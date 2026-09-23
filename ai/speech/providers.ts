/** Voice provider abstractions. */

import type { VoiceConfig } from '../../shared/types';

export interface SpeechToTextResult {
  text: string;
  isFinal: boolean;
}

export interface SpeechToTextProvider {
  readonly id: string;
  start(options: {
    deviceId?: string | null;
    onPartial: (result: SpeechToTextResult) => void;
    signal?: AbortSignal;
  }): Promise<void>;
  stop(): Promise<void>;
}

export interface VoiceSynthesizeRequest {
  text: string;
  voiceId?: string;
  speed?: number;
  signal?: AbortSignal;
}

export interface SynthesizedAudio {
  mimeType: string;
  bytes: Uint8Array;
}

export interface VoiceProvider {
  readonly id: string;
  synthesize(request: VoiceSynthesizeRequest): Promise<SynthesizedAudio>;
  stop(): Promise<void>;
}

export class NoopSpeechToTextProvider implements SpeechToTextProvider {
  readonly id = 'none';
  async start(): Promise<void> {
    throw new Error('Speech-to-text is not configured yet.');
  }
  async stop(): Promise<void> {}
}

export class NoopVoiceProvider implements VoiceProvider {
  readonly id = 'none';
  async synthesize(): Promise<SynthesizedAudio> {
    return { mimeType: 'audio/mpeg', bytes: new Uint8Array() };
  }
  async stop(): Promise<void> {}
}

export function createVoiceProvider(config: VoiceConfig): VoiceProvider {
  if (!config.enabled || config.ttsProvider === 'none') {
    return new NoopVoiceProvider();
  }
  if (config.ttsProvider === 'elevenlabs') {
    return new ElevenLabsVoiceProvider(config);
  }
  return new NoopVoiceProvider();
}

export class ElevenLabsVoiceProvider implements VoiceProvider {
  readonly id = 'elevenlabs';
  private abort: AbortController | null = null;

  constructor(private config: VoiceConfig) {}

  async synthesize(request: VoiceSynthesizeRequest): Promise<SynthesizedAudio> {
    const voiceId = (request.voiceId || this.config.voiceId || '').trim();
    const apiKey = this.config.apiKey.trim();
    if (!apiKey) {
      throw new Error('ElevenLabs API key is missing. Add it in Settings → Voice.');
    }
    if (!voiceId) {
      throw new Error('ElevenLabs voice ID is missing. Paste it in Settings → Voice.');
    }

    await this.stop();
    const abort = new AbortController();
    this.abort = abort;
    if (request.signal) {
      request.signal.addEventListener('abort', () => abort.abort(), { once: true });
    }

    const modelId = this.config.modelId || 'eleven_multilingual_v2';
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text: request.text,
        model_id: modelId,
        voice_settings: {
          stability: 0.45,
          similarity_boost: 0.8,
          style: 0.35,
          use_speaker_boost: true,
        },
      }),
      signal: abort.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => response.statusText);
      throw new Error(`ElevenLabs error ${response.status}: ${detail}`);
    }

    const buffer = new Uint8Array(await response.arrayBuffer());
    return { mimeType: 'audio/mpeg', bytes: buffer };
  }

  async stop(): Promise<void> {
    this.abort?.abort();
    this.abort = null;
  }
}

/** Strip markdown / UI noise so TTS sounds natural. */
export function textForSpeech(raw: string): string {
  return raw
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/[#*_~>]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
