import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_CONFIG } from '../config/defaults';
import { buildVisionUserPrompt, parseVisionReading } from '../vision/context';
import { layoutDisplays } from '../vision/layout';
import { PrivacyManager } from '../vision/privacy';
import { ScreenManager } from '../vision/ScreenManager';
import type { ScreenCaptureProvider } from '../vision/capture/provider';
import type { VisionProvider, VisionReadingResult } from '../vision/understand/provider';
import { createVisionProvider } from '../vision/understand/provider';
import type {
  ActiveWindowInfo,
  CaptureResult,
  ConnectedDisplay,
  CursorInfo,
  Rect,
  WindowSourceInfo,
} from '../vision/types';

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

class FakeCapture implements ScreenCaptureProvider {
  readonly id = 'fake';
  constructor(
    private dir: string,
    private displays: ConnectedDisplay[],
    private active: ActiveWindowInfo | null,
  ) {}

  async listDisplays() {
    return this.displays;
  }
  async getCursor(): Promise<CursorInfo> {
    return { x: 10, y: 10, displayId: this.displays[0]?.id ?? null };
  }
  async getActiveWindow() {
    return this.active;
  }
  async listWindows(): Promise<WindowSourceInfo[]> {
    return [];
  }
  async captureDisplay(displayId: string) {
    return this.write('display', this.displays.find((d) => d.id === displayId) ?? null, null);
  }
  async captureWindow() {
    return this.write('window', this.displays[0] ?? null, null);
  }
  async captureRegion(displayId: string, region: Rect) {
    return this.write('region', this.displays.find((d) => d.id === displayId) ?? null, region);
  }
  private async write(
    kind: CaptureResult['kind'],
    display: ConnectedDisplay | null,
    region: Rect | null,
  ): Promise<CaptureResult> {
    const filePath = path.join(this.dir, `${kind}.png`);
    fs.writeFileSync(filePath, PNG_1X1);
    return {
      kind,
      display,
      window: this.active,
      region,
      width: display?.width ?? 1,
      height: display?.height ?? 1,
      filePath,
      mimeType: 'image/png',
      byteLength: PNG_1X1.byteLength,
      hash: 'abc',
      capturedAt: Date.now(),
      cursor: null,
    };
  }
}

function displays(): ConnectedDisplay[] {
  return layoutDisplays([
    {
      id: '1',
      name: 'LG ULTRAGEAR',
      bounds: { x: 0, y: 0, width: 2560, height: 1440 },
      size: { width: 2560, height: 1440 },
      scaleFactor: 1,
      isPrimary: true,
    },
  ]);
}

const lecture: ActiveWindowInfo = {
  title: 'Computer Vision Lecture — Canvas',
  application: 'Google Chrome',
  processName: 'chrome',
  processId: 7,
  displayId: '1',
  displayLabel: 'Display 1',
  bounds: { x: 0, y: 0, width: 2560, height: 1440 },
};

describe('vision reading parser', () => {
  it('reads fenced JSON and treats confidence above 1 as a percent', () => {
    const reading = parseVisionReading(`\`\`\`json
{"content_type":"presentation","subject":"Computer Vision","title":"Linear Classifier","visible_text":["f(x,W) = Wx + b"],"visual_elements":[{"type":"equation","description":"Linear scoring function"}],"summary":"A lecture slide.","confidence":94}
\`\`\``);
    expect(reading.contentType).toBe('presentation');
    expect(reading.visibleText[0]).toContain('Wx + b');
    expect(reading.confidence).toBeCloseTo(0.94);
  });

  it('includes the user question in the vision prompt', () => {
    const prompt = buildVisionUserPrompt({
      question: 'What does this equation mean?',
      application: 'Google Chrome',
      windowTitle: 'Computer Vision Lecture',
    });
    expect(prompt).toContain('What does this equation mean?');
    expect(prompt).toContain('Google Chrome');
  });
});

describe('createVisionProvider', () => {
  const image = { bytes: PNG_1X1, mimeType: 'image/png' as const, width: 1, height: 1 };

  it('refuses cloud vision when local-only is on', async () => {
    const provider = createVisionProvider(
      { ...DEFAULT_CONFIG.llm, provider: 'openai', apiKey: 'sk-test', model: 'gpt-4o-mini' },
      { ...DEFAULT_CONFIG.vision, localOnly: true },
    );
    await expect(provider.analyze({ image })).rejects.toThrow(/local-only/i);
  });

  it('refuses OpenAI vision without an API key', async () => {
    const provider = createVisionProvider(
      { ...DEFAULT_CONFIG.llm, provider: 'openai', apiKey: '', model: 'gpt-4o-mini' },
      DEFAULT_CONFIG.vision,
    );
    await expect(provider.analyze({ image })).rejects.toThrow(/api key/i);
  });

  it('uses an explicit vision model override', () => {
    const provider = createVisionProvider(
      { ...DEFAULT_CONFIG.llm, provider: 'ollama', model: 'llama3.2', baseUrl: 'http://127.0.0.1:11434/v1' },
      { ...DEFAULT_CONFIG.vision, model: 'llava' },
    );
    expect(provider.id).toBe('ollama');
    expect(provider.model).toBe('llava');
  });
});

describe('ScreenManager visual context', () => {
  it('attaches a model reading to the captured display', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lyla-vision-read-'));
    let question = '';
    const vision: VisionProvider = {
      id: 'scripted',
      model: 'test',
      async analyze(request) {
        question = request.question ?? '';
        const result: VisionReadingResult = {
          source: 'model',
          providerId: 'scripted',
          model: 'test',
          reading: {
            contentType: 'presentation',
            subject: 'Computer Vision',
            title: 'Linear Classifier',
            visibleText: ['f(x,W) = Wx + b', 'Linear Classifier'],
            visualElements: [{ type: 'equation', description: 'Linear classifier function' }],
            summary: 'A lecture slide introducing the linear classifier.',
            confidence: 0.94,
          },
        };
        return result;
      },
    };
    const manager = new ScreenManager({
      capture: new FakeCapture(dir, displays(), lecture),
      privacy: new PrivacyManager(DEFAULT_CONFIG.vision),
      config: DEFAULT_CONFIG.vision,
      vision,
    });
    const captured = await manager.captureScreen('main', { question: 'What does this equation mean?' });
    expect(fs.existsSync(captured.filePath)).toBe(true);
    expect(question).toBe('What does this equation mean?');
    const context = manager.getVisualContext();
    expect(context?.subject).toBe('Computer Vision');
    expect(context?.screen?.resolution).toBe('2560x1440');
    expect(context?.application?.name).toBe('Google Chrome');
    expect(context?.source).toBe('model');
    const observation = manager.getSnapshot().lastObservation ?? '';
    expect(observation).toContain('I see:');
    expect(observation).toContain('f(x,W) = Wx + b');
    expect(observation).toContain('Linear Classifier');
    expect(observation).toContain('Understood by scripted / test');
  });

  it('keeps the capture when the vision model fails', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lyla-vision-fail-'));
    const vision: VisionProvider = {
      id: 'scripted',
      model: 'test',
      async analyze() {
        throw new Error('model unavailable');
      },
    };
    const manager = new ScreenManager({
      capture: new FakeCapture(dir, displays(), lecture),
      privacy: new PrivacyManager(DEFAULT_CONFIG.vision),
      config: DEFAULT_CONFIG.vision,
      vision,
    });
    const captured = await manager.captureScreen();
    expect(fs.existsSync(captured.filePath)).toBe(true);
    const context = manager.getVisualContext();
    expect(context?.source).toBe('metadata');
    expect(manager.getSnapshot().lastObservation).toMatch(/could not read it/i);
    expect(manager.getSnapshot().lastObservation).toMatch(/model unavailable/);
  });
});
