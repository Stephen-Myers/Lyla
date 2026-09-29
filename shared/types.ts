/** Shared types used by main process, preload, and renderer. */

export type UiMode = 'minimal' | 'desktop' | 'immersive';

export type AssistantState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'working'
  | 'warning'
  | 'error'
  | 'celebrating'
  | 'amused';

export type PermissionLevel = 'safe' | 'confirm' | 'dangerous' | 'disabled';

export type LlmProviderId = 'openai' | 'anthropic' | 'ollama' | 'mock';

export type ProactivityLevel = 'disabled' | 'minimal' | 'normal' | 'proactive';

export interface PersonalityConfig {
  humor: number;
  sarcasm: number;
  verbosity: number;
  formality: number;
  proactivity: number;
  lylaMode: boolean;
  nickname: string;
  speakingSpeed: number;
}

export interface VoiceConfig {
  enabled: boolean;
  wakeWordEnabled: boolean;
  wakeWord: string;
  alwaysListening: boolean;
  pushToTalk: boolean;
  sensitivity: number;
  hotkey: string;
  ttsProvider: 'edge' | 'openai' | 'elevenlabs' | 'local' | 'none';
  sttProvider: 'whisper' | 'openai' | 'local' | 'none';
  /** ElevenLabs voice ID (from the voice URL / voice settings). */
  voiceId: string;
  /** ElevenLabs (or other TTS) API key. */
  apiKey: string;
  /** ElevenLabs model, e.g. eleven_multilingual_v2 or eleven_turbo_v2_5. */
  modelId: string;
  microphoneDeviceId: string | null;
}

export interface PermissionConfig {
  computerControl: boolean;
  fileReading: boolean;
  fileModification: PermissionLevel;
  applicationInstall: PermissionLevel;
  purchases: PermissionLevel;
  systemDestruction: PermissionLevel;
  terminalExecution: PermissionLevel;
  webAccess: boolean;
  clipboardAccess: boolean;
}

export interface UserProfile {
  name: string;
  preferredName: string;
  timezone: string;
  location: string;
  preferences: Record<string, unknown>;
  communicationStyle: Record<string, unknown>;
  projects: string[];
}

export interface LlmConfig {
  provider: LlmProviderId;
  model: string;
  apiKey: string;
  baseUrl: string;
  temperature: number;
  maxTokens: number;
  streaming: boolean;
}

export interface LoggingConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
  conversationLogging: boolean;
}

export type VisionMode = 'on_demand' | 'visual_context' | 'continuous';

export interface VisionConfig {
  /** Master switch for any screen vision. */
  enabled: boolean;
  /** Temporary pause without changing other settings. */
  paused: boolean;
  mode: VisionMode;
  /** Lightweight active-window sampling interval (visual_context mode). */
  contextIntervalMs: number;
  /** Reserved for later continuous capture; unused in Phase 1. */
  continuousIntervalMs: number;
  /** Prefer local processing when later vision models are wired. */
  localOnly: boolean;
  excludedApplications: string[];
  excludedDisplayIds: string[];
}

export interface VisionSnapshot {
  enabled: boolean;
  paused: boolean;
  mode: VisionMode;
  looking: boolean;
  indicator: string;
  displays: Array<{
    id: string;
    index: number;
    label: string;
    name: string;
    width: number;
    height: number;
    scalePercent: number;
    rotation: number;
    position: 'primary' | 'left' | 'right' | 'above' | 'below' | 'secondary';
    isPrimary: boolean;
  }>;
  activeWindow: {
    title: string;
    application: string;
    processName: string;
    displayId: string | null;
    displayLabel: string | null;
  } | null;
  lastObservation: string | null;
  lastCaptureAt: number | null;
}

export interface LylaConfig {
  version: number;
  uiMode: UiMode;
  personality: PersonalityConfig;
  voice: VoiceConfig;
  permissions: PermissionConfig;
  user: UserProfile;
  llm: LlmConfig;
  logging: LoggingConfig;
  vision: VisionConfig;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: number;
  toolName?: string;
  toolCallId?: string;
  toolCalls?: Array<{ id: string; name: string; arguments: string }>;
  status?: 'pending' | 'streaming' | 'complete' | 'error' | 'cancelled';
}

export interface ToolActivity {
  id: string;
  name: string;
  description: string;
  status: 'running' | 'success' | 'error' | 'cancelled';
  startedAt: number;
  finishedAt?: number;
  error?: string;
}

export interface SystemTelemetry {
  cpu: number;
  memory: number;
  memoryUsedGb: number;
  memoryTotalGb: number;
  battery?: number;
  charging?: boolean;
  diskUsedPercent?: number;
  networkOnline: boolean;
  timestamp: number;
}

export interface AssistantSnapshot {
  state: AssistantState;
  messages: ChatMessage[];
  activities: ToolActivity[];
  telemetry: SystemTelemetry | null;
  vision: VisionSnapshot | null;
  activeTaskIds: string[];
  listening: boolean;
  online: boolean;
}

export interface StreamChunk {
  type: 'token' | 'activity' | 'state' | 'tool_result' | 'done' | 'error' | 'cancelled';
  content?: string;
  activity?: ToolActivity;
  state?: AssistantState;
  messageId?: string;
  error?: string;
}

export interface SpeakPayload {
  mimeType: string;
  base64: string;
  text: string;
}

export const IPC = {
  GET_CONFIG: 'lyla:get-config',
  SET_CONFIG: 'lyla:set-config',
  GET_SNAPSHOT: 'lyla:get-snapshot',
  SEND_MESSAGE: 'lyla:send-message',
  STOP: 'lyla:stop',
  SET_UI_MODE: 'lyla:set-ui-mode',
  STREAM: 'lyla:stream',
  STATE: 'lyla:state',
  TELEMETRY: 'lyla:telemetry',
  CONFIRM: 'lyla:confirm',
  CONFIRM_RESPONSE: 'lyla:confirm-response',
  RUN_COMMAND: 'lyla:run-command',
  SPEAK: 'lyla:speak',
  STOP_SPEAK: 'lyla:stop-speak',
} as const;
