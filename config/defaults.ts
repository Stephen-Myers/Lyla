import type { LylaConfig } from '../shared/types';
import { resolveModelForProvider } from './llmDefaults';

export const CONFIG_VERSION = 1;

export const DEFAULT_CONFIG: LylaConfig = {
  version: CONFIG_VERSION,
  uiMode: 'desktop',
  personality: {
    humor: 60,
    sarcasm: 35,
    verbosity: 30,
    formality: 40,
    proactivity: 50,
    lylaMode: true,
    nickname: '',
    speakingSpeed: 1.05,
  },
  voice: {
    enabled: false,
    wakeWordEnabled: true,
    wakeWord: 'Hey LYLA',
    alwaysListening: false,
    pushToTalk: true,
    sensitivity: 0.55,
    hotkey: 'Alt+Space',
    ttsProvider: 'none',
    sttProvider: 'none',
    voiceId: '',
    apiKey: '',
    modelId: 'eleven_multilingual_v2',
    microphoneDeviceId: null,
  },
  permissions: {
    computerControl: true,
    fileReading: true,
    fileModification: 'confirm',
    applicationInstall: 'confirm',
    purchases: 'dangerous',
    systemDestruction: 'disabled',
    terminalExecution: 'confirm',
    webAccess: true,
    clipboardAccess: true,
  },
  user: {
    name: '',
    preferredName: '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    location: '',
    preferences: {},
    communicationStyle: {},
    projects: [],
  },
  llm: {
    provider: 'mock',
    model: 'lyla-local',
    apiKey: '',
    baseUrl: '',
    temperature: 0.7,
    maxTokens: 2048,
    streaming: true,
  },
  logging: {
    level: 'info',
    conversationLogging: false,
  },
};

export function mergeConfig(partial: Partial<LylaConfig> | undefined): LylaConfig {
  if (!partial) return structuredClone(DEFAULT_CONFIG);
  const merged: LylaConfig = {
    ...DEFAULT_CONFIG,
    ...partial,
    personality: { ...DEFAULT_CONFIG.personality, ...partial.personality },
    voice: { ...DEFAULT_CONFIG.voice, ...partial.voice },
    permissions: { ...DEFAULT_CONFIG.permissions, ...partial.permissions },
    user: {
      ...DEFAULT_CONFIG.user,
      ...partial.user,
      preferences: {
        ...DEFAULT_CONFIG.user.preferences,
        ...(partial.user?.preferences ?? {}),
      },
      communicationStyle: {
        ...DEFAULT_CONFIG.user.communicationStyle,
        ...(partial.user?.communicationStyle ?? {}),
      },
      projects: partial.user?.projects ?? DEFAULT_CONFIG.user.projects,
    },
    llm: { ...DEFAULT_CONFIG.llm, ...partial.llm },
    logging: { ...DEFAULT_CONFIG.logging, ...partial.logging },
  };
  merged.llm.model = resolveModelForProvider(merged.llm.provider, merged.llm.model);
  return merged;
}
