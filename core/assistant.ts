import { EventEmitter } from 'eventemitter3';
import { nanoid } from 'nanoid';
import type {
  AssistantSnapshot,
  AssistantState,
  ChatMessage,
  LylaConfig,
  SpeakPayload,
  StreamChunk,
  SystemTelemetry,
  ToolActivity,
  UiMode,
} from '../shared/types';
import { createLlmProvider, type LLMProvider, type LlmMessage } from '../ai/llm/provider';
import {
  createVoiceProvider,
  textForSpeech,
  type VoiceProvider,
} from '../ai/speech/providers';
import { buildSystemPrompt, detectSeriousIntent } from './personality';
import { MemoryStore } from './memory';
import { PermissionGuard } from './permissions';
import { ToolRegistry } from '../tools/types';
import { collectTelemetry, registerBuiltinTools } from '../tools/builtin';
import { logger } from './logging';

export interface AssistantEvents {
  stream: (chunk: StreamChunk) => void;
  state: (state: AssistantState) => void;
  snapshot: (snapshot: AssistantSnapshot) => void;
  confirm: (payload: { id: string; message: string }) => void;
  speak: (payload: SpeakPayload) => void;
  stopSpeak: () => void;
}

export class LylaAssistant extends EventEmitter<AssistantEvents> {
  private config: LylaConfig;
  private llm: LLMProvider;
  private voice: VoiceProvider;
  private memory: MemoryStore;
  private permissions: PermissionGuard;
  private tools = new ToolRegistry();
  private messages: ChatMessage[] = [];
  private activities: ToolActivity[] = [];
  private state: AssistantState = 'idle';
  private telemetry: SystemTelemetry | null = null;
  private abort: AbortController | null = null;
  private pendingConfirms = new Map<string, (ok: boolean) => void>();
  private telemetryTimer: NodeJS.Timeout | null = null;

  constructor(config: LylaConfig) {
    super();
    this.config = config;
    this.llm = createLlmProvider(config.llm);
    this.voice = createVoiceProvider(config.voice);
    this.memory = new MemoryStore();
    this.permissions = new PermissionGuard(config.permissions);
    registerBuiltinTools(this.tools, this.memory);
    logger.configure(config.logging);
  }

  start(): void {
    logger.info('assistant', 'LYLA online');
    void this.refreshTelemetry();
    this.telemetryTimer = setInterval(() => {
      void this.refreshTelemetry();
    }, 5000);
  }

  stopServices(): void {
    if (this.telemetryTimer) clearInterval(this.telemetryTimer);
    this.abortActive('Assistant shutting down');
  }

  getConfig(): LylaConfig {
    return this.config;
  }

  setConfig(config: LylaConfig): void {
    this.config = config;
    this.llm = createLlmProvider(config.llm);
    this.voice = createVoiceProvider(config.voice);
    this.permissions.update(config.permissions);
    logger.configure(config.logging);
    this.emitSnapshot();
  }

  setUiMode(mode: UiMode): void {
    this.config = { ...this.config, uiMode: mode };
    this.emitSnapshot();
  }

  getSnapshot(): AssistantSnapshot {
    return {
      state: this.state,
      messages: [...this.messages],
      activities: [...this.activities],
      telemetry: this.telemetry,
      activeTaskIds: [],
      listening: this.state === 'listening',
      online: true,
    };
  }

  resolveConfirm(id: string, accepted: boolean): void {
    const resolver = this.pendingConfirms.get(id);
    if (resolver) {
      this.pendingConfirms.delete(id);
      resolver(accepted);
    }
  }

  abortActive(reason = 'Stopped by user'): void {
    this.abort?.abort();
    this.abort = null;
    void this.voice.stop();
    this.emit('stopSpeak');
    for (const activity of this.activities) {
      if (activity.status === 'running') {
        activity.status = 'cancelled';
        activity.finishedAt = Date.now();
      }
    }
    const last = this.messages[this.messages.length - 1];
    if (last?.role === 'assistant' && last.status === 'streaming') {
      last.status = 'cancelled';
      if (!last.content.trim()) last.content = '(stopped)';
    }
    this.setState('idle');
    this.emit('stream', { type: 'cancelled', content: reason });
    this.emitSnapshot();
  }

  async handleSlashOrMessage(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) return;

    if (/^\/stop\b/i.test(trimmed) || /^stop$/i.test(trimmed)) {
      this.abortActive('Stopped.');
      await this.pushAssistant('Stopped. Ready when you are.');
      return;
    }

    if (/^\/settings\b/i.test(trimmed)) {
      await this.pushAssistant(
        'Open the Settings panel in the UI to configure LLM provider, personality, voice, and permissions.',
      );
      return;
    }

    await this.chat(trimmed);
  }

  async chat(userText: string): Promise<void> {
    this.abortActive();
    const abort = new AbortController();
    this.abort = abort;

    const userMessage: ChatMessage = {
      id: nanoid(),
      role: 'user',
      content: userText,
      timestamp: Date.now(),
      status: 'complete',
    };
    this.messages.push(userMessage);
    logger.conversation('user', userText);
    this.emitSnapshot();

    const assistantId = nanoid();
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      status: 'streaming',
    };
    this.messages.push(assistantMessage);
    this.setState('thinking');
    this.emit('stream', { type: 'state', state: 'thinking', messageId: assistantId });

    try {
      await this.runAgentLoop(assistantMessage, abort.signal);
      if (abort.signal.aborted) {
        for (const message of this.messages) {
          if (message.role === 'assistant' && message.status === 'streaming') {
            message.status = 'cancelled';
          }
        }
      } else {
        for (const message of this.messages) {
          if (message.role === 'assistant' && message.status === 'streaming') {
            message.status = 'complete';
          }
        }
        const spoken = [...this.messages]
          .reverse()
          .find((m) => m.role === 'assistant' && m.content.trim() && m.status === 'complete');
        if (spoken) {
          await this.speak(spoken.content, abort.signal);
        } else {
          this.setState('idle');
        }
      }
    } catch (error) {
      if (abort.signal.aborted) {
        for (const message of this.messages) {
          if (message.role === 'assistant' && message.status === 'streaming') {
            message.status = 'cancelled';
          }
        }
        this.setState('idle');
      } else {
        const target =
          [...this.messages].reverse().find((m) => m.role === 'assistant') ?? assistantMessage;
        target.status = 'error';
        const msg = error instanceof Error ? error.message : String(error);
        target.content = target.content || `I hit a problem: ${msg}`;
        this.setState('error');
        this.emit('stream', { type: 'error', error: msg, messageId: target.id });
        logger.error('assistant', 'Chat failed', error);
      }
    } finally {
      const doneId =
        [...this.messages].reverse().find((m) => m.role === 'assistant')?.id ?? assistantId;
      this.emit('stream', { type: 'done', messageId: doneId });
      this.emitSnapshot();
      if (this.abort === abort) this.abort = null;
    }
  }

  private async speak(raw: string, signal?: AbortSignal): Promise<void> {
    if (!this.config.voice.enabled || this.config.voice.ttsProvider === 'none') {
      this.setState('idle');
      return;
    }
    const text = textForSpeech(raw);
    if (!text || signal?.aborted) {
      this.setState('idle');
      return;
    }

    try {
      this.setState('speaking');
      const audio = await this.voice.synthesize({
        text,
        voiceId: this.config.voice.voiceId,
        speed: this.config.personality.speakingSpeed,
        signal,
      });
      if (signal?.aborted || !audio.bytes.length) {
        this.setState('idle');
        return;
      }
      const base64 = Buffer.from(audio.bytes).toString('base64');
      this.emit('speak', { mimeType: audio.mimeType, base64, text });
      // Renderer owns playback duration; return to idle once audio is handed off.
      this.setState('idle');
    } catch (error) {
      if (signal?.aborted) {
        this.setState('idle');
        return;
      }
      const msg = error instanceof Error ? error.message : String(error);
      logger.error('voice', 'TTS failed', error);
      this.messages.push({
        id: nanoid(),
        role: 'assistant',
        content: `I couldn't speak that aloud: ${msg}`,
        timestamp: Date.now(),
        status: 'complete',
      });
      this.setState('idle');
      this.emitSnapshot();
    }
  }

  private async runAgentLoop(assistantMessage: ChatMessage, signal: AbortSignal): Promise<void> {
    const personalityCtx = detectSeriousIntent(
      this.messages.filter((m) => m.role === 'user').at(-1)?.content ?? '',
    );
    const memoryBlock = this.memory.toPromptBlock(
      this.messages.filter((m) => m.role === 'user').at(-1)?.content,
    );

    const system = [
      buildSystemPrompt(this.config.personality, this.config.user, personalityCtx),
      '',
      'Relevant memories:',
      memoryBlock,
      '',
      `LLM provider: ${this.config.llm.provider} (${this.config.llm.model || 'default'}).`,
    ].join('\n');

    let currentAssistant = assistantMessage;

    // Multi-step tool loop (bounded)
    for (let step = 0; step < 4; step++) {
      if (signal.aborted) return;

      const llmMessages = this.buildLlmMessages(system);
      const pendingToolCalls: Array<{ id: string; name: string; arguments: string }> = [];
      let stepContent = '';

      this.setState(step === 0 ? 'thinking' : 'working');

      for await (const event of this.llm.completeStream({
        messages: llmMessages,
        tools: this.tools.toLlmTools(),
        signal,
      })) {
        if (signal.aborted) return;
        if (event.type === 'token' && event.token) {
          this.setState('speaking');
          stepContent += event.token;
          currentAssistant.content = stepContent;
          this.emit('stream', {
            type: 'token',
            content: event.token,
            messageId: currentAssistant.id,
          });
          this.emitSnapshot();
        } else if (event.type === 'tool_call' && event.toolCall) {
          pendingToolCalls.push(event.toolCall);
        } else if (event.type === 'error') {
          throw new Error(event.error || 'Unknown LLM error');
        }
      }

      if (!pendingToolCalls.length) {
        currentAssistant.content = stepContent || currentAssistant.content || "I'm here. Tell me what you need.";
        currentAssistant.status = 'complete';
        logger.conversation('assistant', currentAssistant.content);
        return;
      }

      // OpenAI requires an assistant message with tool_calls before any tool results.
      currentAssistant.content = stepContent;
      currentAssistant.toolCalls = pendingToolCalls;
      currentAssistant.status = 'complete';
      this.emitSnapshot();

      for (const call of pendingToolCalls) {
        if (signal.aborted) return;
        const resultText = await this.executeToolCall(call, signal);
        this.messages.push({
          id: nanoid(),
          role: 'tool',
          content: resultText,
          timestamp: Date.now(),
          toolName: call.name,
          toolCallId: call.id,
          status: 'complete',
        });
      }

      if (this.config.llm.provider === 'mock' && stepContent.trim()) {
        logger.conversation('assistant', currentAssistant.content);
        return;
      }

      // Fresh assistant turn to summarize / continue after tool results.
      currentAssistant = {
        id: nanoid(),
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        status: 'streaming',
      };
      this.messages.push(currentAssistant);
      this.emitSnapshot();
    }
  }

  /** Build OpenAI-compatible history, dropping orphan tool messages. */
  private buildLlmMessages(system: string): LlmMessage[] {
    const history = this.messages
      .filter((m) => m.status !== 'cancelled')
      .filter((m) => m.role === 'user' || m.role === 'assistant' || m.role === 'tool')
      .filter((m) => !(m.role === 'assistant' && !m.content && !m.toolCalls?.length));

    const sanitized: typeof history = [];
    const openToolCallIds = new Set<string>();

    for (const message of history) {
      if (message.role === 'assistant') {
        openToolCallIds.clear();
        for (const call of message.toolCalls ?? []) openToolCallIds.add(call.id);
        sanitized.push(message);
        continue;
      }
      if (message.role === 'tool') {
        if (message.toolCallId && openToolCallIds.has(message.toolCallId)) {
          sanitized.push(message);
          openToolCallIds.delete(message.toolCallId);
        }
        continue;
      }
      openToolCallIds.clear();
      sanitized.push(message);
    }

    return [
      { role: 'system', content: system },
      ...sanitized.slice(-24).map((m) => ({
        role: m.role as LlmMessage['role'],
        content: m.content,
        name: m.toolName,
        toolCallId: m.toolCallId,
        toolCalls: m.toolCalls,
      })),
    ];
  }

  private async executeToolCall(
    call: { id: string; name: string; arguments: string },
    signal: AbortSignal,
  ): Promise<string> {
    const tool = this.tools.get(call.name);
    const activity: ToolActivity = {
      id: call.id,
      name: call.name,
      description: humanizeTool(call.name),
      status: 'running',
      startedAt: Date.now(),
    };
    this.activities = [activity, ...this.activities].slice(0, 30);
    this.setState('working');
    this.emit('stream', { type: 'activity', activity });
    this.emitSnapshot();

    if (!tool) {
      activity.status = 'error';
      activity.error = `Unknown tool: ${call.name}`;
      activity.finishedAt = Date.now();
      this.emit('stream', { type: 'activity', activity });
      return `Error: unknown tool ${call.name}`;
    }

    const decision = this.permissions.evaluate(tool.permission);
    if (!decision.allowed) {
      activity.status = 'error';
      activity.error = decision.reason;
      activity.finishedAt = Date.now();
      this.emit('stream', { type: 'activity', activity });
      return `Permission denied: ${decision.reason}`;
    }

    let args: unknown = {};
    try {
      args = call.arguments ? JSON.parse(call.arguments) : {};
    } catch {
      activity.status = 'error';
      activity.error = 'Invalid tool arguments JSON';
      activity.finishedAt = Date.now();
      this.emit('stream', { type: 'activity', activity });
      return 'Error: invalid tool arguments';
    }

    const parsed = tool.inputSchema.safeParse(args);
    if (!parsed.success) {
      activity.status = 'error';
      activity.error = parsed.error.message;
      activity.finishedAt = Date.now();
      this.emit('stream', { type: 'activity', activity });
      return `Error: ${parsed.error.message}`;
    }

    try {
      const result = await tool.execute(parsed.data, {
        signal,
        confirm: async (message) => {
          if (!decision.requiresConfirmation && tool.permission !== 'file_modify') {
            // memory tools still ask when permission is confirm
          }
          if (!decision.requiresConfirmation && !/remember|forget/i.test(message)) {
            return true;
          }
          return this.askConfirm(message);
        },
      });
      activity.status = result.ok ? 'success' : 'error';
      activity.error = result.error;
      activity.finishedAt = Date.now();
      this.emit('stream', { type: 'activity', activity });
      this.emitSnapshot();
      logger.info('tool', `${call.name} ${result.ok ? 'ok' : 'fail'}`, {
        error: result.error,
      });
      return result.ok ? result.output : `Error: ${result.error || 'Tool failed'}`;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      activity.status = 'error';
      activity.error = msg;
      activity.finishedAt = Date.now();
      this.emit('stream', { type: 'activity', activity });
      return `Error: ${msg}`;
    }
  }

  private askConfirm(message: string): Promise<boolean> {
    const id = nanoid();
    return new Promise((resolve) => {
      this.pendingConfirms.set(id, resolve);
      this.setState('warning');
      this.emit('confirm', { id, message });
      // Auto-timeout deny after 60s
      setTimeout(() => {
        if (this.pendingConfirms.has(id)) {
          this.pendingConfirms.delete(id);
          resolve(false);
        }
      }, 60_000);
    });
  }

  private async pushAssistant(content: string): Promise<void> {
    this.messages.push({
      id: nanoid(),
      role: 'assistant',
      content,
      timestamp: Date.now(),
      status: 'complete',
    });
    this.emitSnapshot();
  }

  private setState(state: AssistantState): void {
    this.state = state;
    this.emit('state', state);
  }

  private emitSnapshot(): void {
    this.emit('snapshot', this.getSnapshot());
  }

  private async refreshTelemetry(): Promise<void> {
    try {
      this.telemetry = await collectTelemetry();
      this.emit('snapshot', this.getSnapshot());
    } catch (error) {
      logger.warn('telemetry', 'Failed to collect telemetry', error);
    }
  }
}

function humanizeTool(name: string): string {
  const map: Record<string, string> = {
    get_system_status: 'Checking system status',
    open_application: 'Opening application',
    web_search: 'Searching the web',
    memory_remember: 'Storing memory',
    memory_recall: 'Recalling memory',
    memory_forget: 'Forgetting memory',
    get_current_time: 'Checking the time',
  };
  return map[name] ?? name.replace(/_/g, ' ');
}
