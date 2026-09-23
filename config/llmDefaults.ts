import type { LlmProviderId } from '../shared/types';

export const DEFAULT_MODELS: Record<LlmProviderId, string> = {
  mock: 'lyla-local',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-sonnet-4-20250514',
  ollama: 'llama3.2',
};

const PLACEHOLDER_MODELS = new Set([
  'lyla-local',
  '',
  'gpt-4o-mini / claude-sonnet / llama3.2',
]);

/** True when the stored model is clearly wrong for the selected provider. */
export function modelLooksInvalidForProvider(provider: LlmProviderId, model: string): boolean {
  const m = (model || '').trim();
  if (!m || PLACEHOLDER_MODELS.has(m)) return true;
  if (provider === 'openai' && (m === 'lyla-local' || m.startsWith('claude') || m.startsWith('llama'))) {
    return true;
  }
  if (provider === 'anthropic' && (m === 'lyla-local' || m.startsWith('gpt-') || m.startsWith('o1') || m.startsWith('llama'))) {
    return true;
  }
  if (provider === 'ollama' && (m === 'lyla-local' || m.startsWith('gpt-') || m.startsWith('claude'))) {
    return true;
  }
  if (provider === 'mock' && m !== 'lyla-local' && (m.startsWith('gpt-') || m.startsWith('claude'))) {
    return false; // allow custom even on mock
  }
  return false;
}

export function resolveModelForProvider(provider: LlmProviderId, model: string): string {
  if (modelLooksInvalidForProvider(provider, model)) {
    return DEFAULT_MODELS[provider];
  }
  return model.trim();
}
