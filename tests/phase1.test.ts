import { describe, expect, it } from 'vitest';
import { buildSystemPrompt, detectSeriousIntent } from '../core/personality';
import { DEFAULT_CONFIG } from '../config/defaults';
import { PermissionGuard } from '../core/permissions';
import { MockLlmProvider } from '../ai/llm/provider';
import { MemoryStore } from '../core/memory';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('personality priority', () => {
  it('marks destructive requests as dangerous/serious', () => {
    const ctx = detectSeriousIntent('Delete all my files');
    expect(ctx.dangerous).toBe(true);
    expect(ctx.serious).toBe(true);
  });

  it('builds a system prompt that encodes LYLA identity', () => {
    const prompt = buildSystemPrompt(DEFAULT_CONFIG.personality, {
      ...DEFAULT_CONFIG.user,
      preferredName: 'Stephen',
    });
    expect(prompt).toContain('LYLA');
    expect(prompt).toContain('Stephen');
    expect(prompt).toContain('Safety');
  });
});

describe('permissions', () => {
  it('blocks disabled system destruction', () => {
    const guard = new PermissionGuard(DEFAULT_CONFIG.permissions);
    const decision = guard.evaluate('system_destruction');
    expect(decision.allowed).toBe(false);
  });

  it('requires confirmation for file modification', () => {
    const guard = new PermissionGuard(DEFAULT_CONFIG.permissions);
    const decision = guard.evaluate('file_modify');
    expect(decision.allowed).toBe(true);
    expect(decision.requiresConfirmation).toBe(true);
  });
});

describe('mock LLM intent routing', () => {
  it('routes system status to get_system_status tool', async () => {
    const provider = new MockLlmProvider();
    const events = [];
    for await (const event of provider.completeStream({
      messages: [{ role: 'user', content: "What's my system status?" }],
    })) {
      events.push(event);
    }
    expect(events.some((e) => e.type === 'tool_call' && e.toolCall?.name === 'get_system_status')).toBe(
      true,
    );
  });

  it('routes open chrome to open_application', async () => {
    const provider = new MockLlmProvider();
    const events = [];
    for await (const event of provider.completeStream({
      messages: [{ role: 'user', content: 'Open Chrome' }],
    })) {
      events.push(event);
    }
    const call = events.find((e) => e.type === 'tool_call');
    expect(call?.toolCall?.name).toBe('open_application');
    expect(call?.toolCall?.arguments?.toLowerCase()).toContain('chrome');
  });
});

describe('memory store', () => {
  it('remembers and recalls facts', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lyla-mem-'));
    const store = new MemoryStore(path.join(dir, 'mem.json'));
    store.remember('User wants to learn Japanese', { kind: 'long', tags: ['learning'] });
    const hits = store.search('Japanese');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].content).toContain('Japanese');
    const removed = store.forget('Japanese');
    expect(removed.length).toBe(1);
  });
});
