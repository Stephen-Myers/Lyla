import { z } from 'zod';
import si from 'systeminformation';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ToolDefinition, ToolRegistry } from './types';
import type { MemoryStore } from '../core/memory';
import type { SystemTelemetry } from '../shared/types';

const execFileAsync = promisify(execFile);

export async function collectTelemetry(): Promise<SystemTelemetry> {
  const [currentLoad, mem, battery] = await Promise.all([
    si.currentLoad(),
    si.mem(),
    si.battery().catch(() => null),
  ]);

  return {
    cpu: Math.round(currentLoad.currentLoad),
    memory: Math.round((mem.active / mem.total) * 100),
    memoryUsedGb: Number((mem.active / 1024 ** 3).toFixed(1)),
    memoryTotalGb: Number((mem.total / 1024 ** 3).toFixed(1)),
    battery: battery?.hasBattery ? Math.round(battery.percent) : undefined,
    charging: battery?.hasBattery ? battery.isCharging : undefined,
    networkOnline: true,
    timestamp: Date.now(),
  };
}

export function registerBuiltinTools(registry: ToolRegistry, memory: MemoryStore): void {
  registry.register(systemStatusTool());
  registry.register(openApplicationTool());
  registry.register(webSearchTool());
  registry.register(memoryRememberTool(memory));
  registry.register(memoryRecallTool(memory));
  registry.register(memoryForgetTool(memory));
  registry.register(getTimeTool());
}

function systemStatusTool(): ToolDefinition {
  return {
    name: 'get_system_status',
    description: 'Read CPU, memory, and battery telemetry for the local machine.',
    permission: 'computer_control',
    inputSchema: z.object({}),
    async execute() {
      const telemetry = await collectTelemetry();
      const parts = [
        `CPU ${telemetry.cpu}%`,
        `memory ${telemetry.memory}% (${telemetry.memoryUsedGb}/${telemetry.memoryTotalGb} GB)`,
      ];
      if (telemetry.battery != null) {
        parts.push(
          `battery ${telemetry.battery}%${telemetry.charging ? ' (charging)' : ''}`,
        );
      }
      return {
        ok: true,
        output: `System status: ${parts.join(', ')}.`,
        data: telemetry,
      };
    },
  };
}

function openApplicationTool(): ToolDefinition<{ application: string }> {
  return {
    name: 'open_application',
    description: 'Open a desktop application or URL by name on Windows.',
    permission: 'computer_control',
    inputSchema: z.object({
      application: z.string().describe('Application name or executable, e.g. Chrome, Spotify'),
    }),
    async execute({ application }) {
      const app = application.trim();
      if (!app) {
        return { ok: false, output: '', error: 'No application specified.' };
      }

      const mapped = mapCommonApp(app);
      try {
        if (/^https?:\/\//i.test(mapped)) {
          await execFileAsync('cmd', ['/c', 'start', '', mapped], { windowsHide: true });
        } else {
          await execFileAsync('cmd', ['/c', 'start', '', mapped], { windowsHide: true });
        }
        return { ok: true, output: `Opened ${app}.` };
      } catch (error) {
        return {
          ok: false,
          output: '',
          error: `Could not open ${app}: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  };
}

function webSearchTool(): ToolDefinition<{ query: string }> {
  return {
    name: 'web_search',
    description:
      'Open a web search for the query in the default browser. Use for research requests when a browsing API is not configured.',
    permission: 'web',
    inputSchema: z.object({
      query: z.string().describe('Search query'),
    }),
    async execute({ query }) {
      const q = query.trim();
      if (!q) return { ok: false, output: '', error: 'Empty search query.' };
      const url = `https://duckduckgo.com/?q=${encodeURIComponent(q)}`;
      try {
        await execFileAsync('cmd', ['/c', 'start', '', url], { windowsHide: true });
        return {
          ok: true,
          output: `Opened web search for "${q}". Review the results in the browser; I do not yet have a full page-fetch research pipeline wired in.`,
          data: { url, query: q },
        };
      } catch (error) {
        return {
          ok: false,
          output: '',
          error: `Web search failed: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  };
}

function memoryRememberTool(memory: MemoryStore): ToolDefinition<{ content: string; tags?: string[] }> {
  return {
    name: 'memory_remember',
    description: 'Store a useful long-term memory about the user, preference, or project decision.',
    permission: 'file_modify',
    inputSchema: z.object({
      content: z.string(),
      tags: z.array(z.string()).optional(),
    }),
    async execute({ content, tags }, ctx) {
      const confirmed = await ctx.confirm(`Remember: "${content}"?`);
      if (!confirmed) {
        return { ok: false, output: '', error: 'User declined to store that memory.' };
      }
      const entry = memory.remember(content, { kind: 'long', tags: tags ?? [], importance: 70 });
      return { ok: true, output: `Remembered: ${entry.content}`, data: entry };
    },
  };
}

function memoryRecallTool(memory: MemoryStore): ToolDefinition<{ query: string }> {
  return {
    name: 'memory_recall',
    description: 'Search stored memories relevant to a query.',
    permission: 'file_read',
    inputSchema: z.object({
      query: z.string(),
    }),
    async execute({ query }) {
      const hits = memory.search(query, 8);
      if (!hits.length) {
        return { ok: true, output: 'No matching memories found.' };
      }
      return {
        ok: true,
        output: hits.map((h) => `- ${h.content}`).join('\n'),
        data: hits,
      };
    },
  };
}

function memoryForgetTool(memory: MemoryStore): ToolDefinition<{ query: string }> {
  return {
    name: 'memory_forget',
    description: 'Forget memories matching a query.',
    permission: 'file_modify',
    inputSchema: z.object({
      query: z.string(),
    }),
    async execute({ query }, ctx) {
      const confirmed = await ctx.confirm(`Forget memories matching "${query}"?`);
      if (!confirmed) {
        return { ok: false, output: '', error: 'User declined forget request.' };
      }
      const removed = memory.forget(query);
      return {
        ok: true,
        output: removed.length
          ? `Forgot ${removed.length} memor${removed.length === 1 ? 'y' : 'ies'}.`
          : 'No matching memories to forget.',
        data: removed,
      };
    },
  };
}

function getTimeTool(): ToolDefinition {
  return {
    name: 'get_current_time',
    description: 'Get the current local date and time.',
    permission: 'computer_control',
    inputSchema: z.object({}),
    async execute() {
      const now = new Date();
      const output = now.toLocaleString(undefined, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
      return { ok: true, output: `It is ${output}.`, data: { iso: now.toISOString() } };
    },
  };
}

function mapCommonApp(name: string): string {
  const key = name.toLowerCase().trim();
  const map: Record<string, string> = {
    chrome: 'chrome',
    'google chrome': 'chrome',
    edge: 'msedge',
    'microsoft edge': 'msedge',
    firefox: 'firefox',
    spotify: 'spotify',
    notepad: 'notepad',
    explorer: 'explorer',
    'file explorer': 'explorer',
    code: 'code',
    'vs code': 'code',
    'visual studio code': 'code',
    calculator: 'calc',
    calc: 'calc',
    terminal: 'wt',
    'windows terminal': 'wt',
  };
  return map[key] ?? name;
}
