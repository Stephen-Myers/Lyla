import { EventEmitter } from 'eventemitter3';
import type { VisionConfig, VisionSnapshot } from '../shared/types';
import type { ScreenCaptureProvider } from './capture/provider';
import { PrivacyManager } from './privacy';
import { resolveDisplayReference } from './references';
import { formatDisplayList } from './layout';
import type {
  ActiveWindowInfo,
  CaptureResult,
  ConnectedDisplay,
  Rect,
  VisionEventMap,
} from './types';

export interface ScreenManagerOptions {
  capture: ScreenCaptureProvider;
  privacy: PrivacyManager;
  config: VisionConfig;
}

export class ScreenManager extends EventEmitter<VisionEventMap> {
  private capture: ScreenCaptureProvider;
  private privacy: PrivacyManager;
  private config: VisionConfig;
  private displays: ConnectedDisplay[] = [];
  private activeWindow: ActiveWindowInfo | null = null;
  private looking = false;
  private lastObservation: string | null = null;
  private lastCaptureAt: number | null = null;
  private lastCapture: CaptureResult | null = null;
  private sampleTimer: NodeJS.Timeout | null = null;
  private unwatchDisplays: (() => void) | null = null;
  private lastAppName: string | null = null;

  constructor(options: ScreenManagerOptions) {
    super();
    this.capture = options.capture;
    this.privacy = options.privacy;
    this.config = options.config;
  }

  setConfig(config: VisionConfig): void {
    this.config = config;
    this.privacy.update(config);
    this.restartSampler();
  }

  start(): void {
    this.restartSampler();
    this.unwatchDisplays?.();
    this.unwatchDisplays =
      this.capture.watchDisplays?.(() => {
        void this.refreshDisplays();
      }) ?? null;
    void this.refreshDisplays();
    if (this.config.mode === 'visual_context' && this.privacy.isEnabled()) {
      void this.refreshActiveWindow();
    }
  }

  stop(): void {
    this.stopSampler();
    this.unwatchDisplays?.();
    this.unwatchDisplays = null;
  }

  getSnapshot(): VisionSnapshot {
    return {
      enabled: this.config.enabled,
      paused: this.config.paused,
      mode: this.config.mode,
      looking: this.looking,
      indicator: this.indicatorText(),
      displays: this.displays,
      activeWindow: this.activeWindow,
      lastObservation: this.lastObservation,
      lastCaptureAt: this.lastCaptureAt,
    };
  }

  getLastCapture(): CaptureResult | null {
    return this.lastCapture;
  }

  async listDisplays(force = false): Promise<ConnectedDisplay[]> {
    if (!this.displays.length || force) {
      await this.refreshDisplays();
    }
    return this.displays;
  }

  async describeDisplays(): Promise<string> {
    const displays = await this.listDisplays(true);
    return formatDisplayList(displays);
  }

  async getActiveWindow(force = false): Promise<ActiveWindowInfo | null> {
    if (force || !this.activeWindow) {
      await this.refreshActiveWindow();
    }
    return this.activeWindow;
  }

  excludeApplication(name: string): string[] {
    const list = this.privacy.excludeApplication(name);
    this.config = { ...this.config, excludedApplications: list };
    this.privacy.update(this.config);
    return list;
  }

  getConfig(): VisionConfig {
    return this.config;
  }

  async captureScreen(reference?: string): Promise<CaptureResult> {
    this.emit('UserRequestedVision', { query: reference });
    const displays = await this.listDisplays(true);
    const active = await this.getActiveWindow(true);
    const cursor = await this.capture.getCursor();
    const resolved = resolveDisplayReference(reference, displays, {
      cursorDisplayId: cursor.displayId,
      activeDisplayId: active?.displayId,
    });
    if (!resolved.display) {
      throw new Error(resolved.reason);
    }
    return this.runCapture(resolved.display.label, active, async () => {
      this.assertAllowed(resolved.display!.id, active, 'display');
      return this.capture.captureDisplay(resolved.display!.id);
    });
  }

  async captureActiveWindow(): Promise<CaptureResult> {
    this.emit('UserRequestedVision', { query: 'active window' });
    const active = await this.getActiveWindow(true);
    if (!active?.title) {
      throw new Error('I could not determine the active window.');
    }
    const windows = await this.capture.listWindows();
    const match = windows.find((w) => titlesMatch(w.title, active.title));
    if (!match) {
      return this.captureScreen(active.displayId ?? undefined);
    }
    return this.runCapture(active.title, active, async () => {
      this.assertAllowed(active.displayId, active, 'window');
      return this.capture.captureWindow(match.id);
    });
  }

  async captureRegion(region: Rect, displayRef?: string): Promise<CaptureResult> {
    this.emit('UserRequestedVision', { query: 'region' });
    const displays = await this.listDisplays(true);
    const active = await this.getActiveWindow(true);
    const cursor = await this.capture.getCursor();
    const resolved = resolveDisplayReference(displayRef, displays, {
      cursorDisplayId: cursor.displayId,
      activeDisplayId: active?.displayId,
    });
    if (!resolved.display) {
      throw new Error(resolved.reason);
    }
    return this.runCapture(`a region on ${resolved.display.label}`, active, async () => {
      this.assertAllowed(resolved.display!.id, active, 'display');
      return this.capture.captureRegion(resolved.display!.id, region);
    });
  }

  private assertAllowed(
    displayId: string | null | undefined,
    window: ActiveWindowInfo | null,
    scope: 'display' | 'window',
  ): void {
    const windowOnTarget =
      scope === 'window' || !displayId || !window?.displayId || window.displayId === displayId;
    const decision = this.privacy.canCapture({
      displayId,
      application: windowOnTarget ? (window?.application ?? window?.processName) : null,
      windowTitle: windowOnTarget ? window?.title : null,
    });
    if (!decision.allowed) {
      throw new Error(decision.reason ?? 'Capture blocked by privacy settings.');
    }
  }

  private async runCapture(
    target: string,
    windowBefore: ActiveWindowInfo | null,
    fn: () => Promise<CaptureResult>,
  ): Promise<CaptureResult> {
    if (!this.privacy.isEnabled()) {
      throw new Error(
        this.privacy.isPaused()
          ? 'Screen vision is temporarily paused.'
          : 'Screen vision is disabled in settings.',
      );
    }
    this.looking = true;
    this.lastObservation = `Looking at ${target}...`;
    this.emit('VisionAnalysisStarted', { target });
    try {
      const result = await fn();
      this.lastCapture = result;
      this.lastCaptureAt = result.capturedAt;
      this.lastObservation = summarizeCapture(result, windowBefore);
      this.activeWindow = result.window ?? windowBefore;
      this.emit('VisionAnalysisCompleted', { target });
      this.emit('VisualContextUpdated', { observation: this.lastObservation });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.emit('VisionError', { error: message });
      throw error;
    } finally {
      this.looking = false;
    }
  }

  private async refreshDisplays(): Promise<void> {
    try {
      const next = await this.capture.listDisplays();
      const changed =
        next.length !== this.displays.length ||
        next.some((d, i) => d.id !== this.displays[i]?.id || d.width !== this.displays[i]?.width);
      this.displays = next;
      if (changed) {
        this.emit('ScreenChanged', { displays: next });
      }
    } catch (error) {
      this.emit('VisionError', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async refreshActiveWindow(): Promise<void> {
    try {
      const displays = await this.listDisplays();
      const next = await this.capture.getActiveWindow(displays);
      const prev = this.activeWindow;
      this.activeWindow = next;
      if ((prev?.title ?? null) !== (next?.title ?? null)) {
        this.emit('WindowChanged', { window: next });
      }
      const app = next?.application ?? null;
      if (app !== this.lastAppName) {
        this.lastAppName = app;
        this.emit('ApplicationChanged', { application: app });
        if (this.config.mode === 'visual_context' && app) {
          this.lastObservation = `You're currently working in ${app}.`;
          this.emit('VisualContextUpdated', { observation: this.lastObservation });
        }
      }
    } catch (error) {
      this.emit('VisionError', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private restartSampler(): void {
    this.stopSampler();
    if (!this.privacy.isEnabled()) return;
    if (this.config.mode !== 'visual_context') return;
    const ms = Math.max(3000, this.config.contextIntervalMs || 10000);
    this.sampleTimer = setInterval(() => {
      void this.refreshActiveWindow();
    }, ms);
  }

  private stopSampler(): void {
    if (this.sampleTimer) {
      clearInterval(this.sampleTimer);
      this.sampleTimer = null;
    }
  }

  private indicatorText(): string {
    if (!this.config.enabled || this.config.paused) return 'VISION OFF';
    if (this.looking) return 'LOOKING';
    if (this.config.mode === 'visual_context') return 'VISUAL CONTEXT ACTIVE';
    return 'VISION OFF';
  }
}

function titlesMatch(a: string, b: string): boolean {
  const na = a.trim().toLowerCase();
  const nb = b.trim().toLowerCase();
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

export function summarizeCapture(result: CaptureResult, fallbackWindow: ActiveWindowInfo | null): string {
  const window = result.window ?? fallbackWindow;
  const display = result.display
    ? `${[result.display.label, result.display.name].filter(Boolean).join(' — ')} (${result.width}x${result.height})`
    : `${result.width}x${result.height}`;
  const windowOnCapture =
    result.kind === 'window' || !result.display || !window?.displayId || window.displayId === result.display.id;
  const app = windowOnCapture && window?.application ? `Application: ${window.application}` : null;
  const title = windowOnCapture && window?.title ? `Window: ${window.title}` : null;
  const elsewhere =
    window && !windowOnCapture
      ? `Foreground: ${window.application || window.processName || 'Unknown'} on ${window.displayLabel || 'another display'}`
      : null;
  const kind =
    result.kind === 'window'
      ? 'Captured the active window'
      : result.kind === 'region'
        ? 'Captured a screen region'
        : 'Captured the display';
  return [kind, display, app, title, elsewhere].filter(Boolean).join('\n');
}

export function formatActiveWindow(window: ActiveWindowInfo | null): string {
  if (!window) return 'I could not determine the active window.';
  return [
    'Active Application:',
    window.application || window.processName || 'Unknown',
    '',
    'Window:',
    window.title || '(untitled)',
    '',
    'Screen:',
    window.displayLabel || 'Unknown',
  ].join('\n');
}
