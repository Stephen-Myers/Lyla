import type { LlmConfig } from '../../shared/types';
import { buildVisionUserPrompt, parseVisionReading } from '../context';
import { linkSignals, readErrorBody } from './http';
import type { VisionAnalysisRequest, VisionProvider, VisionReadingResult } from './provider';

export class OpenAiVisionProvider implements VisionProvider {
  readonly id: string;
  readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(
    config: LlmConfig,
    id: 'openai' | 'ollama',
  ) {
    this.id = id;
    this.model = config.model || (id === 'ollama' ? 'llava' : 'gpt-4o-mini');
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
  }

  async analyze(request: VisionAnalysisRequest): Promise<VisionReadingResult> {
    if (this.id === 'openai' && !this.apiKey.trim()) {
      throw new Error('OpenAI vision needs an API key in Settings.');
    }
    const dataUrl = `data:${request.image.mimeType};base64,${request.image.bytes.toString('base64')}`;
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey || 'ollama'}`,
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.2,
        max_tokens: 1200,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: promptFor(request) },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
      signal: linkSignals(request.signal, 45_000),
    });
    if (!response.ok) {
      throw new Error(`${this.id} vision error ${response.status}: ${await readErrorBody(response)}`);
    }
    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const text = json.choices?.[0]?.message?.content ?? '';
    return {
      reading: parseVisionReading(text),
      source: 'model',
      providerId: this.id,
      model: this.model,
    };
  }
}

function promptFor(request: VisionAnalysisRequest): string {
  return buildVisionUserPrompt({
    question: request.question,
    application: request.hint?.application,
    windowTitle: request.hint?.windowTitle,
    displayLabel: request.hint?.displayLabel,
  });
}
