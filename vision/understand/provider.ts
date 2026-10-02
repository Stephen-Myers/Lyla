import type { LlmConfig, VisionConfig } from '../../shared/types';
import type { PreparedImage, VisionModelReading } from '../context';
import { AnthropicVisionProvider } from './anthropic';
import { OpenAiVisionProvider } from './openai';

export interface VisionAnalysisRequest {
  image: PreparedImage;
  question?: string;
  hint?: {
    application?: string;
    windowTitle?: string;
    displayLabel?: string;
  };
  signal?: AbortSignal;
}

export interface VisionReadingResult {
  reading: VisionModelReading;
  source: 'model' | 'metadata';
  providerId: string;
  model: string;
}

/**
 * Replaceable visual understanding. Implementations read one image.
 * ScreenManager attaches the real display and window.
 */
export interface VisionProvider {
  readonly id: string;
  readonly model: string;
  analyze(request: VisionAnalysisRequest): Promise<VisionReadingResult>;
}

export function createVisionProvider(llm: LlmConfig, vision: VisionConfig): VisionProvider {
  const model = vision.model.trim() || llm.model;
  if (vision.localOnly && (llm.provider === 'openai' || llm.provider === 'anthropic')) {
    return new LocalOnlyVisionProvider(llm.provider);
  }
  switch (llm.provider) {
    case 'openai':
      return new OpenAiVisionProvider({ ...llm, model }, 'openai');
    case 'ollama':
      return new OpenAiVisionProvider(
        {
          ...llm,
          model,
          baseUrl: llm.baseUrl || 'http://127.0.0.1:11434/v1',
          apiKey: llm.apiKey || 'ollama',
        },
        'ollama',
      );
    case 'anthropic':
      return new AnthropicVisionProvider({ ...llm, model });
    case 'mock':
    default:
      return new MockVisionProvider();
  }
}

export class MockVisionProvider implements VisionProvider {
  readonly id = 'mock';
  readonly model = 'lyla-local';

  async analyze(request: VisionAnalysisRequest): Promise<VisionReadingResult> {
    const app = request.hint?.application || '';
    const title = request.hint?.windowTitle || '';
    const where = [request.hint?.displayLabel, app, title].filter(Boolean).join(' — ');
    return {
      reading: {
        contentType: 'desktop',
        subject: '',
        title,
        visibleText: [],
        visualElements: [],
        summary: where
          ? `I can see that ${where} is in front. No vision model is configured, so I have not read the pixels.`
          : 'No vision model is configured, so I have not read the pixels.',
        confidence: 0.3,
      },
      source: 'metadata',
      providerId: this.id,
      model: this.model,
    };
  }
}

class LocalOnlyVisionProvider implements VisionProvider {
  readonly id = 'local-only';
  readonly model = 'blocked';

  constructor(private cloudProvider: string) {}

  async analyze(): Promise<VisionReadingResult> {
    throw new Error(
      `Local-only vision is on, so I will not send this screen to ${this.cloudProvider}. Use Ollama with a vision model, or turn local-only off.`,
    );
  }
}
