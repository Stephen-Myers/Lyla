import type { LlmConfig } from '../../shared/types';
import { buildVisionUserPrompt, parseVisionReading } from '../context';
import { linkSignals, readErrorBody } from './http';
import type { VisionAnalysisRequest, VisionProvider, VisionReadingResult } from './provider';

export class AnthropicVisionProvider implements VisionProvider {
  readonly id = 'anthropic';
  readonly model: string;
  private readonly apiKey: string;

  constructor(config: LlmConfig) {
    this.model = config.model || 'claude-sonnet-4-20250514';
    this.apiKey = config.apiKey;
  }

  async analyze(request: VisionAnalysisRequest): Promise<VisionReadingResult> {
    if (!this.apiKey.trim()) {
      throw new Error('Anthropic vision needs an API key in Settings.');
    }
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 1200,
        temperature: 0.2,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: request.image.mimeType,
                  data: request.image.bytes.toString('base64'),
                },
              },
              {
                type: 'text',
                text: buildVisionUserPrompt({
                  question: request.question,
                  application: request.hint?.application,
                  windowTitle: request.hint?.windowTitle,
                  displayLabel: request.hint?.displayLabel,
                }),
              },
            ],
          },
        ],
      }),
      signal: linkSignals(request.signal, 45_000),
    });
    if (!response.ok) {
      throw new Error(`Anthropic vision error ${response.status}: ${await readErrorBody(response)}`);
    }
    const json = (await response.json()) as {
      content?: Array<{ type?: string; text?: string }>;
    };
    const text = json.content?.filter((block) => block.type === 'text').map((block) => block.text ?? '').join('\n') ?? '';
    return {
      reading: parseVisionReading(text),
      source: 'model',
      providerId: this.id,
      model: this.model,
    };
  }
}
