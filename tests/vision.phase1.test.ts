import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { layoutDisplays, formatDisplayList } from '../vision/layout';
import { resolveDisplayReference } from '../vision/references';
import { PrivacyManager } from '../vision/privacy';
import { ScreenManager, summarizeCapture } from '../vision/ScreenManager';
import type { ScreenCaptureProvider } from '../vision/capture/provider';
import type {
  ActiveWindowInfo,
  CaptureResult,
  ConnectedDisplay,
  CursorInfo,
  Rect,
  WindowSourceInfo,
} from '../vision/types';
import { DEFAULT_CONFIG } from '../config/defaults';
import { MockLlmProvider } from '../ai/llm/provider';

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

class FakeCaptureProvider implements ScreenCaptureProvider {
  readonly id = 'fake';
  displays: ConnectedDisplay[];
  active: ActiveWindowInfo | null;
  windows: WindowSourceInfo[];
  cursor: CursorInfo;
  captureDir: string;

  constructor(captureDir: string, displays: ConnectedDisplay[], active: ActiveWindowInfo | null) {
    this.captureDir = captureDir;
    this.displays = displays;
    this.active = active;
    this.cursor = { x: 100, y: 100, displayId: displays[0]?.id ?? null };
    this.windows = active
      ? [{ id: 'win:active', title: active.title, displayId: active.displayId }]
      : [];
  }

  async listDisplays(): Promise<ConnectedDisplay[]> {
    return this.displays;
  }

  async getCursor(): Promise<CursorInfo> {
    return this.cursor;
  }

  async getActiveWindow(): Promise<ActiveWindowInfo | null> {
    return this.active;
  }

  async listWindows(): Promise<WindowSourceInfo[]> {
    return this.windows;
  }

  async captureDisplay(displayId: string): Promise<CaptureResult> {
    const display = this.displays.find((d) => d.id === displayId);
    if (!display) throw new Error('missing display');
    return this.write('display', display, null, display.size.width, display.size.height);
  }

  async captureWindow(): Promise<CaptureResult> {
    const display = this.displays.find((d) => d.id === this.active?.displayId) ?? this.displays[0];
    return this.write('window', display, null, 800, 600);
  }

  async captureRegion(displayId: string, region: Rect): Promise<CaptureResult> {
    const display = this.displays.find((d) => d.id === displayId);
    if (!display) throw new Error('missing display');
    return this.write('region', display, region, region.width, region.height);
  }

  private async write(
    kind: CaptureResult['kind'],
    display: ConnectedDisplay | null,
    region: Rect | null,
    width: number,
    height: number,
  ): Promise<CaptureResult> {
    const hash = createHash('sha256').update(PNG_1X1).digest('hex').slice(0, 16);
    const filePath = path.join(this.captureDir, `${kind}-${hash}.png`);
    fs.writeFileSync(filePath, PNG_1X1);
    return {
      kind,
      display,
      window: this.active,
      region,
      width,
      height,
      filePath,
      mimeType: 'image/png',
      byteLength: PNG_1X1.byteLength,
      hash,
      capturedAt: Date.now(),
      cursor: this.cursor,
    };
  }
}

function twoDisplays(): ConnectedDisplay[] {
  return layoutDisplays([
    {
      id: '1',
      bounds: { x: 0, y: 0, width: 2560, height: 1440 },
      size: { width: 2560, height: 1440 },
      scaleFactor: 1,
      isPrimary: true,
    },
    {
      id: '2',
      bounds: { x: -1920, y: 0, width: 1920, height: 1080 },
      size: { width: 1920, height: 1080 },
      scaleFactor: 1,
      isPrimary: false,
    },
  ]);
}

describe('display layout', () => {
  it('labels primary and left secondary displays', () => {
    const displays = twoDisplays();
    expect(displays[0].isPrimary).toBe(true);
    expect(displays[0].position).toBe('primary');
    expect(displays[1].position).toBe('left');
    expect(displays[1].index).toBe(2);
    const text = formatDisplayList(displays);
    expect(text).toContain('Display 1');
    expect(text).toContain('2560x1440');
    expect(text).toContain('Position: Left');
  });
});

describe('display references', () => {
  const displays = twoDisplays();

  it('resolves main, left, right, second, and other', () => {
    expect(resolveDisplayReference('my main monitor', displays).display?.id).toBe('1');
    expect(resolveDisplayReference('the left screen', displays).display?.id).toBe('2');
    expect(resolveDisplayReference('the second screen', displays).display?.id).toBe('2');
    expect(
      resolveDisplayReference('the other monitor', displays, { activeDisplayId: '1' }).display?.id,
    ).toBe('2');
  });

  it('resolves monitor product names and a portrait display on the left', () => {
    const displays = layoutDisplays([
      {
        id: 'lg',
        name: 'LG ULTRAGEAR',
        bounds: { x: 0, y: 0, width: 2560, height: 1440 },
        size: { width: 2560, height: 1440 },
        scaleFactor: 1,
        isPrimary: true,
        rotation: 0,
      },
      {
        id: 'dell',
        name: 'DELL U2412M',
        bounds: { x: -1200, y: 0, width: 1200, height: 1920 },
        size: { width: 1200, height: 1920 },
        scaleFactor: 1,
        isPrimary: false,
        rotation: 90,
      },
    ]);
    expect(displays[1].position).toBe('left');
    expect(displays[1].width).toBe(1200);
    expect(displays[1].height).toBe(1920);
    const text = formatDisplayList(displays);
    expect(text).toContain('Name: DELL U2412M');
    expect(text).toContain('Orientation: Portrait');
    expect(text).toContain('Position: Left');
    expect(resolveDisplayReference('the dell', displays).display?.id).toBe('dell');
    expect(resolveDisplayReference('look at the ultragear', displays).display?.id).toBe('lg');
    expect(resolveDisplayReference('the other monitor', displays, { activeDisplayId: 'lg' }).display?.id).toBe(
      'dell',
    );
  });

  it('defaults "this" to the active display', () => {
    const resolved = resolveDisplayReference('this', displays, { activeDisplayId: '2' });
    expect(resolved.display?.id).toBe('2');
  });
});

describe('privacy manager', () => {
  it('blocks password managers by default', () => {
    const privacy = new PrivacyManager(DEFAULT_CONFIG.vision);
    const decision = privacy.canCapture({ application: '1Password', windowTitle: 'Login' });
    expect(decision.allowed).toBe(false);
  });

  it('blocks user exclusions', () => {
    const privacy = new PrivacyManager(DEFAULT_CONFIG.vision);
    privacy.excludeApplication('Signal');
    const decision = privacy.canCapture({ application: 'Signal' });
    expect(decision.allowed).toBe(false);
  });
});

describe('ScreenManager phase 1', () => {
  it('captures each connected display to a PNG', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lyla-vision-'));
    const displays = twoDisplays();
    const active: ActiveWindowInfo = {
      title: 'Computer Vision Lecture — Canvas',
      application: 'Google Chrome',
      processName: 'chrome',
      processId: 42,
      displayId: '1',
      displayLabel: 'Display 1',
      bounds: { x: 0, y: 0, width: 2560, height: 1440 },
    };
    const manager = new ScreenManager({
      capture: new FakeCaptureProvider(dir, displays, active),
      privacy: new PrivacyManager(DEFAULT_CONFIG.vision),
      config: DEFAULT_CONFIG.vision,
    });

    const listed = await manager.listDisplays(true);
    expect(listed).toHaveLength(2);

    const primary = await manager.captureScreen('main');
    expect(primary.display?.id).toBe('1');
    expect(fs.existsSync(primary.filePath)).toBe(true);
    expect(primary.width).toBe(2560);

    const left = await manager.captureScreen('left');
    expect(left.display?.id).toBe('2');
    expect(fs.existsSync(left.filePath)).toBe(true);

    const window = await manager.getActiveWindow(true);
    expect(window?.application).toBe('Google Chrome');
    expect(window?.title).toContain('Computer Vision Lecture');

    const region = await manager.captureRegion({ x: 10, y: 10, width: 80, height: 40 }, 'primary');
    expect(region.kind).toBe('region');
    expect(region.width).toBe(80);

    const summary = summarizeCapture(
      { ...left, window: active },
      active,
    );
    expect(summary).toContain('Display 2');
    expect(summary).toContain('Foreground: Google Chrome on Display 1');
    expect(summary).not.toContain('Application: Google Chrome');
  });

  it('refuses capture when vision is disabled', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lyla-vision-'));
    const manager = new ScreenManager({
      capture: new FakeCaptureProvider(dir, twoDisplays(), null),
      privacy: new PrivacyManager({ ...DEFAULT_CONFIG.vision, enabled: false }),
      config: { ...DEFAULT_CONFIG.vision, enabled: false },
    });
    await expect(manager.captureScreen()).rejects.toThrow(/disabled/i);
  });

  it('refuses capture of an excluded application', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lyla-vision-'));
    const displays = twoDisplays();
    const active: ActiveWindowInfo = {
      title: 'Vault',
      application: 'Bitwarden',
      processName: 'bitwarden',
      processId: 9,
      displayId: '1',
      displayLabel: 'Display 1',
      bounds: null,
    };
    const manager = new ScreenManager({
      capture: new FakeCaptureProvider(dir, displays, active),
      privacy: new PrivacyManager(DEFAULT_CONFIG.vision),
      config: DEFAULT_CONFIG.vision,
    });
    await expect(manager.captureScreen()).rejects.toThrow(/exclusion/i);
  });

  it('captures another display when the excluded app is not on it', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lyla-vision-'));
    const displays = twoDisplays();
    const active: ActiveWindowInfo = {
      title: 'Vault',
      application: 'Bitwarden',
      processName: 'bitwarden',
      processId: 9,
      displayId: '1',
      displayLabel: 'Display 1',
      bounds: null,
    };
    const manager = new ScreenManager({
      capture: new FakeCaptureProvider(dir, displays, active),
      privacy: new PrivacyManager(DEFAULT_CONFIG.vision),
      config: DEFAULT_CONFIG.vision,
    });
    const left = await manager.captureScreen('left');
    expect(left.display?.id).toBe('2');
    await expect(manager.captureScreen('main')).rejects.toThrow(/exclusion/i);
  });
});

describe('mock LLM vision routing', () => {
  it('routes "what\'s on my screen" to capture_screen', async () => {
    const provider = new MockLlmProvider();
    const events = [];
    for await (const event of provider.completeStream({
      messages: [{ role: 'user', content: "LYLA, what's on my screen?" }],
    })) {
      events.push(event);
    }
    expect(events.some((e) => e.type === 'tool_call' && e.toolCall?.name === 'capture_screen')).toBe(
      true,
    );
  });

  it('routes left-monitor requests with a display argument', async () => {
    const provider = new MockLlmProvider();
    const events = [];
    for await (const event of provider.completeStream({
      messages: [{ role: 'user', content: 'Look at the left monitor' }],
    })) {
      events.push(event);
    }
    const call = events.find((e) => e.type === 'tool_call');
    expect(call?.toolCall?.name).toBe('capture_screen');
    expect(call?.toolCall?.arguments).toContain('left');
  });

  it('routes a named monitor to capture_screen', async () => {
    const provider = new MockLlmProvider();
    const events = [];
    for await (const event of provider.completeStream({
      messages: [{ role: 'user', content: 'Look at the Dell monitor' }],
    })) {
      events.push(event);
    }
    const call = events.find((e) => e.type === 'tool_call');
    expect(call?.toolCall?.name).toBe('capture_screen');
    expect(call?.toolCall?.arguments).toContain('dell');
  });
});
