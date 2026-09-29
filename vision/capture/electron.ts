import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { NativeImage } from 'electron';
import { desktopCapturer, screen } from 'electron';
import type {
  ActiveWindowInfo,
  CaptureResult,
  ConnectedDisplay,
  CursorInfo,
  Rect,
  WindowSourceInfo,
} from '../types';
import type { ScreenCaptureProvider } from './provider';
import { displayContainingPoint, displayContainingRect, layoutDisplays } from '../layout';
import type { WindowInspector } from '../window/inspector';
import { createWindowInspector } from '../window/create';

export interface ElectronCaptureOptions {
  captureDir: string;
  inspector?: WindowInspector;
}

export function createElectronCaptureProvider(
  options: ElectronCaptureOptions,
): ScreenCaptureProvider {
  return new ElectronScreenCaptureProvider(options);
}

class ElectronScreenCaptureProvider implements ScreenCaptureProvider {
  readonly id = 'electron-desktop-capturer';
  private readonly captureDir: string;
  private readonly inspector: WindowInspector;

  constructor(options: ElectronCaptureOptions) {
    this.captureDir = options.captureDir;
    this.inspector = options.inspector ?? createWindowInspector();
  }

  async listDisplays(): Promise<ConnectedDisplay[]> {
    const primary = screen.getPrimaryDisplay();
    const raw = screen.getAllDisplays().map((display) => ({
      id: String(display.id),
      bounds: {
        x: display.bounds.x,
        y: display.bounds.y,
        width: display.bounds.width,
        height: display.bounds.height,
      },
      size: { width: display.size.width, height: display.size.height },
      scaleFactor: display.scaleFactor,
      isPrimary: display.id === primary.id,
      name: display.label,
      rotation: display.rotation,
    }));
    return layoutDisplays(raw);
  }

  watchDisplays(onChange: () => void): () => void {
    const handler = () => onChange();
    screen.on('display-added', handler);
    screen.on('display-removed', handler);
    screen.on('display-metrics-changed', handler);
    return () => {
      screen.off('display-added', handler);
      screen.off('display-removed', handler);
      screen.off('display-metrics-changed', handler);
    };
  }

  async getCursor(): Promise<CursorInfo> {
    const point = screen.getCursorScreenPoint();
    const displays = await this.listDisplays();
    const display = displayContainingPoint(displays, point.x, point.y);
    return { x: point.x, y: point.y, displayId: display?.id ?? null };
  }

  async getActiveWindow(displays?: ConnectedDisplay[]): Promise<ActiveWindowInfo | null> {
    const known = displays ?? (await this.listDisplays());
    const fg = await this.inspector.getForegroundWindow();
    if (!fg) return null;
    const application = friendlyAppName(fg.processName);
    const onDisplay = displayContainingRect(known, fg.bounds);
    return {
      title: fg.title,
      application,
      processName: fg.processName,
      processId: fg.processId,
      displayId: onDisplay?.id ?? null,
      displayLabel: onDisplay?.label ?? null,
      bounds: fg.bounds,
    };
  }

  async listWindows(): Promise<WindowSourceInfo[]> {
    const sources = await desktopCapturer.getSources({
      types: ['window'],
      thumbnailSize: { width: 1, height: 1 },
      fetchWindowIcons: false,
    });
    return sources.map((source) => ({
      id: source.id,
      title: source.name,
      displayId: source.display_id || null,
    }));
  }

  async captureDisplay(displayId: string): Promise<CaptureResult> {
    const displays = await this.listDisplays();
    const display = displays.find((d) => d.id === displayId);
    if (!display) {
      throw new Error(`Display ${displayId} was not found.`);
    }
    const image = await this.grabDisplayImage(display);
    const window = await this.getActiveWindow(displays);
    const cursor = await this.getCursor();
    return this.persist({
      kind: 'display',
      display,
      window,
      region: null,
      image,
      cursor,
    });
  }

  async captureWindow(windowId: string): Promise<CaptureResult> {
    const displays = await this.listDisplays();
    const sources = await desktopCapturer.getSources({
      types: ['window'],
      thumbnailSize: { width: 1920, height: 1080 },
      fetchWindowIcons: false,
    });
    const source = sources.find((s) => s.id === windowId);
    if (!source) {
      throw new Error('That window is no longer available to capture.');
    }
    const image = source.thumbnail;
    if (image.isEmpty()) {
      throw new Error('That window capture came back empty.');
    }
    const active = await this.getActiveWindow(displays);
    const display =
      displays.find((d) => d.id === source.display_id) ??
      (active?.displayId ? displays.find((d) => d.id === active.displayId) : undefined) ??
      null;
    const cursor = await this.getCursor();
    return this.persist({
      kind: 'window',
      display,
      window: {
        title: source.name,
        application: active?.title === source.name ? active.application : inferAppFromTitle(source.name),
        processName: active?.processName ?? '',
        processId: active?.processId ?? null,
        displayId: display?.id ?? null,
        displayLabel: display?.label ?? null,
        bounds: active?.title === source.name ? active.bounds : null,
      },
      region: null,
      image,
      cursor,
    });
  }

  async captureRegion(displayId: string, region: Rect): Promise<CaptureResult> {
    const displays = await this.listDisplays();
    const display = displays.find((d) => d.id === displayId);
    if (!display) {
      throw new Error(`Display ${displayId} was not found.`);
    }
    const full = await this.grabDisplayImage(display);
    const scaleX = full.getSize().width / display.bounds.width;
    const scaleY = full.getSize().height / display.bounds.height;
    const crop = {
      x: Math.max(0, Math.round(region.x * scaleX)),
      y: Math.max(0, Math.round(region.y * scaleY)),
      width: Math.max(1, Math.round(region.width * scaleX)),
      height: Math.max(1, Math.round(region.height * scaleY)),
    };
    const size = full.getSize();
    crop.width = Math.min(crop.width, size.width - crop.x);
    crop.height = Math.min(crop.height, size.height - crop.y);
    if (crop.width < 1 || crop.height < 1) {
      throw new Error('The requested region is outside the display bounds.');
    }
    const image = full.crop(crop);
    const window = await this.getActiveWindow(displays);
    const cursor = await this.getCursor();
    return this.persist({
      kind: 'region',
      display,
      window,
      region: crop,
      image,
      cursor,
    });
  }

  private async grabDisplayImage(display: ConnectedDisplay): Promise<NativeImage> {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: display.size.width, height: display.size.height },
      fetchWindowIcons: false,
    });
    const match =
      sources.find((s) => s.display_id && s.display_id === display.id) ??
      sources.find((s) => {
        const size = s.thumbnail.getSize();
        return size.width === display.size.width && size.height === display.size.height;
      }) ??
      sources[display.index - 1];
    if (!match || match.thumbnail.isEmpty()) {
      throw new Error(`Could not capture ${display.label}.`);
    }
    return match.thumbnail;
  }

  private async persist(input: {
    kind: CaptureResult['kind'];
    display: ConnectedDisplay | null;
    window: ActiveWindowInfo | null;
    region: Rect | null;
    image: NativeImage;
    cursor: CursorInfo | null;
  }): Promise<CaptureResult> {
    await fs.mkdir(this.captureDir, { recursive: true });
    if (input.image.isEmpty()) {
      throw new Error('Screen capture returned an empty image.');
    }
    const png = input.image.toPNG();
    const hash = createHash('sha256').update(png).digest('hex').slice(0, 16);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = path.join(this.captureDir, `${input.kind}-${stamp}-${hash}.png`);
    await fs.writeFile(filePath, png);
    const size = input.image.getSize();
    return {
      kind: input.kind,
      display: input.display,
      window: input.window,
      region: input.region,
      width: size.width,
      height: size.height,
      filePath,
      mimeType: 'image/png',
      byteLength: png.byteLength,
      hash,
      capturedAt: Date.now(),
      cursor: input.cursor,
    };
  }
}

function friendlyAppName(processName: string): string {
  const key = processName.toLowerCase();
  const map: Record<string, string> = {
    chrome: 'Google Chrome',
    msedge: 'Microsoft Edge',
    firefox: 'Firefox',
    code: 'Visual Studio Code',
    devenv: 'Visual Studio',
    windowsterminal: 'Windows Terminal',
    explorer: 'File Explorer',
    notepad: 'Notepad',
    powerpnt: 'PowerPoint',
    winword: 'Word',
    excel: 'Excel',
    acrord32: 'Adobe Acrobat',
    zoom: 'Zoom',
    slack: 'Slack',
    discord: 'Discord',
    spotify: 'Spotify',
    electron: 'Electron',
    opera: 'Opera',
    cursor: 'Cursor',
  };
  if (map[key]) return map[key];
  if (!processName) return 'Unknown application';
  return processName.charAt(0).toUpperCase() + processName.slice(1);
}

function inferAppFromTitle(title: string): string {
  if (/opera/i.test(title)) return 'Opera';
  if (/cursor/i.test(title)) return 'Cursor';
  if (/chrome/i.test(title)) return 'Google Chrome';
  if (/visual studio code/i.test(title) || / — vscode/i.test(title)) return 'Visual Studio Code';
  return title.split(/[-—|]/).at(-1)?.trim() || 'Unknown application';
}
