import { useState } from 'react';
import type { LlmProviderId, LylaConfig, VisionMode } from '@shared/types';
import { DEFAULT_MODELS, modelLooksInvalidForProvider } from '../../../config/llmDefaults';

export function SettingsModal({
  config,
  onClose,
  onSave,
}: {
  config: LylaConfig;
  onClose: () => void;
  onSave: (partial: Partial<LylaConfig>) => void;
}) {
  const [draft, setDraft] = useState(config);

  function setProvider(provider: LlmProviderId) {
    const shouldReplace = modelLooksInvalidForProvider(provider, draft.llm.model);
    setDraft({
      ...draft,
      llm: {
        ...draft.llm,
        provider,
        model: shouldReplace ? DEFAULT_MODELS[provider] : draft.llm.model,
        baseUrl:
          provider === 'ollama' && !draft.llm.baseUrl
            ? 'http://127.0.0.1:11434/v1'
            : draft.llm.baseUrl,
      },
    });
  }

  return (
    <div className="settings-overlay" role="dialog" aria-modal>
      <div className="settings-card">
        <h2>Settings</h2>
        <div className="settings-grid">
          <div className="field">
            <label>Preferred name</label>
            <input
              value={draft.user.preferredName}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  user: { ...draft.user, preferredName: e.target.value },
                })
              }
            />
          </div>

          <div className="field">
            <label>LLM provider</label>
            <select
              value={draft.llm.provider}
              onChange={(e) => setProvider(e.target.value as LlmProviderId)}
            >
              <option value="mock">Mock (offline / no API key)</option>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic (Claude)</option>
              <option value="ollama">Ollama (local)</option>
            </select>
          </div>

          <div className="field">
            <label>Model</label>
            <input
              value={draft.llm.model}
              placeholder={DEFAULT_MODELS[draft.llm.provider]}
              onChange={(e) =>
                setDraft({ ...draft, llm: { ...draft.llm, model: e.target.value } })
              }
            />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
              OpenAI default: gpt-4o-mini · Anthropic: claude-sonnet-4-20250514 · Ollama: llama3.2
            </span>
          </div>

          <div className="field">
            <label>API key</label>
            <input
              type="password"
              value={draft.llm.apiKey}
              onChange={(e) =>
                setDraft({ ...draft, llm: { ...draft.llm, apiKey: e.target.value } })
              }
              placeholder="Stored locally in your user data"
            />
          </div>

          <div className="field">
            <label>Base URL (optional / Ollama)</label>
            <input
              value={draft.llm.baseUrl}
              onChange={(e) =>
                setDraft({ ...draft, llm: { ...draft.llm, baseUrl: e.target.value } })
              }
              placeholder="http://127.0.0.1:11434/v1"
            />
          </div>

          <div className="field">
            <label>Humor ({draft.personality.humor})</label>
            <input
              type="range"
              min={0}
              max={100}
              value={draft.personality.humor}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  personality: { ...draft.personality, humor: Number(e.target.value) },
                })
              }
            />
          </div>

          <div className="field">
            <label>Sarcasm ({draft.personality.sarcasm})</label>
            <input
              type="range"
              min={0}
              max={100}
              value={draft.personality.sarcasm}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  personality: { ...draft.personality, sarcasm: Number(e.target.value) },
                })
              }
            />
          </div>

          <div className="field">
            <label>Verbosity ({draft.personality.verbosity})</label>
            <input
              type="range"
              min={0}
              max={100}
              value={draft.personality.verbosity}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  personality: { ...draft.personality, verbosity: Number(e.target.value) },
                })
              }
            />
          </div>

          <div className="field">
            <label>
              <input
                type="checkbox"
                checked={draft.personality.lylaMode}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    personality: { ...draft.personality, lylaMode: e.target.checked },
                  })
                }
              />{' '}
              LYLA Personality mode
            </label>
          </div>

          <h2 style={{ marginTop: '0.5rem' }}>Voice (ElevenLabs)</h2>

          <div className="field">
            <label>
              <input
                type="checkbox"
                checked={draft.voice.enabled}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    voice: {
                      ...draft.voice,
                      enabled: e.target.checked,
                      ttsProvider: e.target.checked ? 'elevenlabs' : draft.voice.ttsProvider,
                    },
                  })
                }
              />{' '}
              Speak replies aloud
            </label>
          </div>

          <div className="field">
            <label>TTS provider</label>
            <select
              value={draft.voice.ttsProvider}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  voice: {
                    ...draft.voice,
                    ttsProvider: e.target.value as typeof draft.voice.ttsProvider,
                    enabled: e.target.value === 'none' ? false : draft.voice.enabled || e.target.value === 'elevenlabs',
                  },
                })
              }
            >
              <option value="none">None</option>
              <option value="elevenlabs">ElevenLabs</option>
            </select>
          </div>

          <div className="field">
            <label>ElevenLabs API key</label>
            <input
              type="password"
              value={draft.voice.apiKey ?? ''}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  voice: { ...draft.voice, apiKey: e.target.value },
                })
              }
              placeholder="xi-... from elevenlabs.io"
            />
          </div>

          <div className="field">
            <label>Voice ID</label>
            <input
              value={draft.voice.voiceId}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  voice: { ...draft.voice, voiceId: e.target.value.trim() },
                })
              }
              placeholder="e.g. 21m00Tcm4TlvDq8ikWAM"
            />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
              Open the voice in ElevenLabs → copy the ID from the URL or Voice ID field
            </span>
          </div>

          <div className="field">
            <label>Model</label>
            <select
              value={draft.voice.modelId || 'eleven_multilingual_v2'}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  voice: { ...draft.voice, modelId: e.target.value },
                })
              }
            >
              <option value="eleven_multilingual_v2">eleven_multilingual_v2</option>
              <option value="eleven_turbo_v2_5">eleven_turbo_v2_5</option>
              <option value="eleven_flash_v2_5">eleven_flash_v2_5</option>
              <option value="eleven_monolingual_v1">eleven_monolingual_v1</option>
            </select>
          </div>

          <div className="field">
            <label>
              <input
                type="checkbox"
                checked={draft.permissions.computerControl}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    permissions: {
                      ...draft.permissions,
                      computerControl: e.target.checked,
                    },
                  })
                }
              />{' '}
              Computer control
            </label>
          </div>

          <div className="field">
            <label>
              <input
                type="checkbox"
                checked={draft.permissions.webAccess}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    permissions: { ...draft.permissions, webAccess: e.target.checked },
                  })
                }
              />{' '}
              Web access
            </label>
          </div>

          <h2 style={{ marginTop: '0.5rem' }}>Vision</h2>

          <div className="field">
            <label>
              <input
                type="checkbox"
                checked={draft.vision.enabled}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    vision: { ...draft.vision, enabled: e.target.checked },
                  })
                }
              />{' '}
              Allow screen vision
            </label>
          </div>

          <div className="field">
            <label>
              <input
                type="checkbox"
                checked={draft.vision.paused}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    vision: { ...draft.vision, paused: e.target.checked },
                  })
                }
              />{' '}
              Pause vision
            </label>
          </div>

          <div className="field">
            <label>Vision mode</label>
            <select
              value={draft.vision.mode}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  vision: { ...draft.vision, mode: e.target.value as VisionMode },
                })
              }
            >
              <option value="on_demand">On demand (capture only when asked)</option>
              <option value="visual_context">Visual context (sample active app, no screenshots)</option>
              <option value="continuous">Continuous (reserved — not capturing yet)</option>
            </select>
          </div>
        </div>

        <div className="settings-actions">
          <button className="icon-btn" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="mode-btn active"
            type="button"
            onClick={() =>
              onSave({
                user: draft.user,
                llm: draft.llm,
                personality: draft.personality,
                permissions: draft.permissions,
                voice: draft.voice,
                vision: draft.vision,
              })
            }
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
