import type { LlmConfig } from '../../shared/types';

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: LlmToolCall[];
}

export interface LlmToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface LlmToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface LlmStreamEvent {
  type: 'token' | 'tool_call' | 'done' | 'error';
  token?: string;
  toolCall?: LlmToolCall;
  error?: string;
}

export interface LlmCompletionRequest {
  messages: LlmMessage[];
  tools?: LlmToolSpec[];
  signal?: AbortSignal;
}

export interface LLMProvider {
  readonly id: string;
  completeStream(request: LlmCompletionRequest): AsyncGenerator<LlmStreamEvent>;
}

export function createLlmProvider(config: LlmConfig): LLMProvider {
  switch (config.provider) {
    case 'openai':
      return new OpenAiCompatibleProvider('openai', config);
    case 'ollama':
      return new OpenAiCompatibleProvider('ollama', {
        ...config,
        baseUrl: config.baseUrl || 'http://127.0.0.1:11434/v1',
        apiKey: config.apiKey || 'ollama',
      });
    case 'anthropic':
      return new AnthropicProvider(config);
    case 'mock':
    default:
      return new MockLlmProvider();
  }
}

function serializeOpenAiMessage(m: LlmMessage): Record<string, unknown> {
  if (m.role === 'tool') {
    return {
      role: 'tool',
      content: m.content || '',
      tool_call_id: m.toolCallId || 'unknown',
    };
  }
  if (m.role === 'assistant' && m.toolCalls?.length) {
    return {
      role: 'assistant',
      content: m.content?.trim() ? m.content : null,
      tool_calls: m.toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function',
        function: {
          name: tc.name,
          arguments: tc.arguments || '{}',
        },
      })),
    };
  }
  return {
    role: m.role,
    content: m.content,
  };
}

class OpenAiCompatibleProvider implements LLMProvider {
  constructor(
    readonly id: string,
    private config: LlmConfig,
  ) {}

  async *completeStream(request: LlmCompletionRequest): AsyncGenerator<LlmStreamEvent> {
    const base = (this.config.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
    const body: Record<string, unknown> = {
      model: this.config.model || 'gpt-4o-mini',
      messages: request.messages.map((m) => serializeOpenAiMessage(m)),
      temperature: this.config.temperature,
      max_tokens: this.config.maxTokens,
      stream: true,
    };

    if (request.tools?.length) {
      body.tools = request.tools.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
      body.tool_choice = 'auto';
    }

    let response: Response;
    try {
      response = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: request.signal,
      });
    } catch (error) {
      yield {
        type: 'error',
        error: `LLM request failed: ${error instanceof Error ? error.message : String(error)}`,
      };
      return;
    }

    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => '');
      yield {
        type: 'error',
        error: `LLM error ${response.status}: ${text || response.statusText}`,
      };
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const toolCalls = new Map<number, { id: string; name: string; arguments: string }>();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const raw of lines) {
        const line = raw.trim();
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') {
          for (const call of toolCalls.values()) {
            yield { type: 'tool_call', toolCall: call };
          }
          yield { type: 'done' };
          return;
        }
        try {
          const json = JSON.parse(data) as {
            choices?: Array<{
              delta?: {
                content?: string;
                tool_calls?: Array<{
                  index: number;
                  id?: string;
                  function?: { name?: string; arguments?: string };
                }>;
              };
            }>;
          };
          const delta = json.choices?.[0]?.delta;
          if (delta?.content) yield { type: 'token', token: delta.content };
          for (const tc of delta?.tool_calls ?? []) {
            const existing = toolCalls.get(tc.index) ?? {
              id: tc.id ?? `call_${tc.index}`,
              name: '',
              arguments: '',
            };
            if (tc.id) existing.id = tc.id;
            if (tc.function?.name) existing.name += tc.function.name;
            if (tc.function?.arguments) existing.arguments += tc.function.arguments;
            toolCalls.set(tc.index, existing);
          }
        } catch {
          // ignore malformed chunks
        }
      }
    }

    for (const call of toolCalls.values()) {
      yield { type: 'tool_call', toolCall: call };
    }
    yield { type: 'done' };
  }
}

class AnthropicProvider implements LLMProvider {
  readonly id = 'anthropic';
  constructor(private config: LlmConfig) {}

  async *completeStream(request: LlmCompletionRequest): AsyncGenerator<LlmStreamEvent> {
    const system = request.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const messages = request.messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role, content: m.content }));

    const tools = request.tools?.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));

    let response: Response;
    try {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.config.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.config.model || 'claude-sonnet-4-20250514',
          max_tokens: this.config.maxTokens,
          temperature: this.config.temperature,
          system: system || undefined,
          messages,
          stream: true,
          tools: tools?.length ? tools : undefined,
        }),
        signal: request.signal,
      });
    } catch (error) {
      yield {
        type: 'error',
        error: `Anthropic request failed: ${error instanceof Error ? error.message : String(error)}`,
      };
      return;
    }

    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => '');
      yield {
        type: 'error',
        error: `Anthropic error ${response.status}: ${text || response.statusText}`,
      };
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const toolBuffers = new Map<number, { id: string; name: string; arguments: string }>();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const raw of lines) {
        const line = raw.trim();
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data) continue;
        try {
          const json = JSON.parse(data) as {
            type?: string;
            delta?: { type?: string; text?: string; partial_json?: string };
            content_block?: { type?: string; id?: string; name?: string; index?: number };
            index?: number;
          };
          if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta' && json.delta.text) {
            yield { type: 'token', token: json.delta.text };
          }
          if (json.type === 'content_block_start' && json.content_block?.type === 'tool_use') {
            const index = json.index ?? 0;
            toolBuffers.set(index, {
              id: json.content_block.id ?? `tool_${index}`,
              name: json.content_block.name ?? '',
              arguments: '',
            });
          }
          if (json.type === 'content_block_delta' && json.delta?.type === 'input_json_delta') {
            const index = json.index ?? 0;
            const existing = toolBuffers.get(index);
            if (existing && json.delta.partial_json) {
              existing.arguments += json.delta.partial_json;
            }
          }
          if (json.type === 'message_stop') {
            for (const call of toolBuffers.values()) {
              yield { type: 'tool_call', toolCall: call };
            }
            yield { type: 'done' };
            return;
          }
        } catch {
          // ignore
        }
      }
    }
    yield { type: 'done' };
  }
}

/**
 * Deterministic offline brain so LYLA is usable before API keys are configured.
 * Understands common intents and routes to tools via structured pseudo-tool calls.
 */
export class MockLlmProvider implements LLMProvider {
  readonly id = 'mock';

  async *completeStream(request: LlmCompletionRequest): AsyncGenerator<LlmStreamEvent> {
    const lastUser = [...request.messages].reverse().find((m) => m.role === 'user')?.content ?? '';
    const lower = lastUser.toLowerCase().trim();

    const reply = (text: string) => text;

    if (/^(hey )?lyla[.!?]?$/i.test(lower) || lower === 'hello' || lower === 'hi') {
      yield* tokens(reply("Always. What do you need?"));
      yield { type: 'done' };
      return;
    }

    if (/\b(stop|cancel|never mind|nevermind)\b/i.test(lower)) {
      yield* tokens(reply('Stopped. Ready when you are.'));
      yield { type: 'done' };
      return;
    }

    if (
      /\b(how many (screens|monitors|displays)|list (my )?(screens|monitors|displays)|what( screens| monitors) (do i have|are connected)|connected displays)\b/i.test(
        lower,
      )
    ) {
      yield* tokens(reply("I'll check what's connected."));
      yield {
        type: 'tool_call',
        toolCall: { id: 'mock_screens', name: 'get_screens', arguments: '{}' },
      };
      yield { type: 'done' };
      return;
    }

    if (
      /\b(active window|what('?s| is) focused|what app am i (in|using)|foreground window|which (app|application|window))\b/i.test(
        lower,
      )
    ) {
      yield {
        type: 'tool_call',
        toolCall: { id: 'mock_active_win', name: 'get_active_window', arguments: '{}' },
      };
      yield { type: 'done' };
      return;
    }

    const lookMonitor = lower.match(
      /\blook at (?:the )?(left|right|other|second|main|primary) (?:screen|monitor|display)\b/,
    );
    const namedMonitor = lower.match(
      /\blook at (?:the )?([a-z0-9][\w-]*) (?:screen|monitor|display)\b/,
    );
    const namedDisplay =
      namedMonitor && !/^(my|this|a)$/.test(namedMonitor[1]) ? namedMonitor[1] : undefined;
    if (
      lookMonitor ||
      namedDisplay ||
      /\b(what'?s on my screen|what am i looking at|look at (this|my screen|the screen)|capture (my )?screen|look at this)\b/i.test(
        lower,
      )
    ) {
      const display = lookMonitor?.[1] ?? namedDisplay;
      yield* tokens(reply("I'll take a look."));
      yield {
        type: 'tool_call',
        toolCall: {
          id: 'mock_capture',
          name: 'capture_screen',
          arguments: JSON.stringify(display ? { display } : {}),
        },
      };
      yield { type: 'done' };
      return;
    }

    if (/\b(what time|current time|what's the time|whats the time)\b/i.test(lower)) {
      yield {
        type: 'tool_call',
        toolCall: { id: 'mock_time', name: 'get_current_time', arguments: '{}' },
      };
      yield { type: 'done' };
      return;
    }

    if (/\b(system status|cpu|how'?s my (pc|computer|system)|system health)\b/i.test(lower)) {
      yield* tokens(reply("Give me a moment — I'll pull a quick diagnostic."));
      yield {
        type: 'tool_call',
        toolCall: { id: 'mock_status', name: 'get_system_status', arguments: '{}' },
      };
      yield { type: 'done' };
      return;
    }

    const openMatch = lower.match(/\b(?:open|launch|start)\s+(.+)$/i);
    if (openMatch) {
      const application = openMatch[1].replace(/[.!?]+$/, '').trim();
      yield* tokens(reply(`Opening ${titleCase(application)}.`));
      yield {
        type: 'tool_call',
        toolCall: {
          id: 'mock_open',
          name: 'open_application',
          arguments: JSON.stringify({ application }),
        },
      };
      yield { type: 'done' };
      return;
    }

    const searchMatch = lower.match(/\b(?:search(?: for)?|look up|research|find)\s+(.+)$/i);
    if (searchMatch) {
      const query = searchMatch[1].replace(/[.!?]+$/, '').trim();
      yield* tokens(reply(`I'll look into that.`));
      yield {
        type: 'tool_call',
        toolCall: {
          id: 'mock_search',
          name: 'web_search',
          arguments: JSON.stringify({ query }),
        },
      };
      yield { type: 'done' };
      return;
    }

    const rememberMatch = lower.match(/\bremember (?:that )?(.+)$/i);
    if (rememberMatch) {
      yield {
        type: 'tool_call',
        toolCall: {
          id: 'mock_remember',
          name: 'memory_remember',
          arguments: JSON.stringify({ content: rememberMatch[1].replace(/[.!?]+$/, '').trim() }),
        },
      };
      yield { type: 'done' };
      return;
    }

    if (/\b(what do (?:i|you) remember|what do i want|recall|what do you know about me)\b/i.test(lower)) {
      yield {
        type: 'tool_call',
        toolCall: {
          id: 'mock_recall',
          name: 'memory_recall',
          arguments: JSON.stringify({ query: lastUser }),
        },
      };
      yield { type: 'done' };
      return;
    }

    if (lower.startsWith('/help') || /\bhelp\b/.test(lower) && lower.length < 20) {
      yield* tokens(
        reply(
          "I'm LYLA — your personal assistant. Try things like \"What's my system status?\", \"Open Chrome\", \"Search for Japanese learning resources\", or \"Remember that I want to learn Japanese.\" Slash commands: /help /status /memory /settings /stop.",
        ),
      );
      yield { type: 'done' };
      return;
    }

    if (lower.startsWith('/status')) {
      yield {
        type: 'tool_call',
        toolCall: { id: 'mock_status_cmd', name: 'get_system_status', arguments: '{}' },
      };
      yield { type: 'done' };
      return;
    }

    if (lower.startsWith('/memory')) {
      yield {
        type: 'tool_call',
        toolCall: {
          id: 'mock_memory_cmd',
          name: 'memory_recall',
          arguments: JSON.stringify({ query: '' }),
        },
      };
      yield { type: 'done' };
      return;
    }

    // If the last message looks like a tool result follow-up, summarize it.
    const lastTool = [...request.messages].reverse().find((m) => m.role === 'tool');
    if (lastTool) {
      yield* tokens(reply(lastTool.content));
      yield { type: 'done' };
      return;
    }

    yield* tokens(
      reply(
        "I heard you. I'm running on the local mock brain right now — configure OpenAI, Anthropic, or Ollama in Settings for full reasoning. I can still handle system status, opening apps, web search, memory, and looking at your screens.",
      ),
    );
    yield { type: 'done' };
  }
}

async function* tokens(text: string): AsyncGenerator<LlmStreamEvent> {
  const parts = text.split(/(\s+)/);
  for (const part of parts) {
    if (!part) continue;
    yield { type: 'token', token: part };
    await delay(12);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (c) => c.toUpperCase());
}
