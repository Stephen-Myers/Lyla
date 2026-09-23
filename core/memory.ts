import { nanoid } from 'nanoid';
import fs from 'node:fs';
import path from 'node:path';
import { logger } from './logging';

export type MemoryKind = 'short' | 'session' | 'long' | 'task';

export interface MemoryEntry {
  id: string;
  kind: MemoryKind;
  key?: string;
  content: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  importance: number;
}

interface MemoryFile {
  entries: MemoryEntry[];
}

function defaultMemoryPath(): string {
  try {
    // Lazy require so unit tests can inject a temp path without loading Electron.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { app } = require('electron') as typeof import('electron');
    return path.join(app.getPath('userData'), 'memory', 'lyla-memory.json');
  } catch {
    return path.join(process.cwd(), 'data', 'memory', 'lyla-memory.json');
  }
}

/**
 * Persistent memory. Only stores useful/stable facts, explicit remembers,
 * preferences, and ongoing project/task context — not every utterance.
 */
export class MemoryStore {
  private filePath: string;
  private data: MemoryFile = { entries: [] };
  private sessionId = nanoid(8);

  constructor(filePath?: string) {
    this.filePath = filePath ?? defaultMemoryPath();
    this.load();
  }

  private load(): void {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      if (fs.existsSync(this.filePath)) {
        this.data = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as MemoryFile;
      } else {
        this.save();
      }
    } catch (error) {
      logger.error('memory', 'Failed to load memory store', error);
      this.data = { entries: [] };
    }
  }

  private save(): void {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (error) {
      logger.error('memory', 'Failed to save memory store', error);
    }
  }

  remember(content: string, options: Partial<Omit<MemoryEntry, 'id' | 'content' | 'createdAt' | 'updatedAt'>> = {}): MemoryEntry {
    const now = Date.now();
    const entry: MemoryEntry = {
      id: nanoid(),
      kind: options.kind ?? 'long',
      key: options.key,
      content: content.trim(),
      tags: options.tags ?? [],
      createdAt: now,
      updatedAt: now,
      importance: options.importance ?? 50,
    };
    this.data.entries.push(entry);
    this.save();
    logger.info('memory', 'Stored memory', { id: entry.id, kind: entry.kind });
    return entry;
  }

  forget(query: string): MemoryEntry[] {
    const q = query.toLowerCase();
    const kept: MemoryEntry[] = [];
    const removed: MemoryEntry[] = [];
    for (const entry of this.data.entries) {
      const hay = `${entry.key ?? ''} ${entry.content} ${entry.tags.join(' ')}`.toLowerCase();
      if (hay.includes(q)) removed.push(entry);
      else kept.push(entry);
    }
    this.data.entries = kept;
    this.save();
    return removed;
  }

  forgetAll(kind?: MemoryKind): number {
    const before = this.data.entries.length;
    this.data.entries = kind ? this.data.entries.filter((e) => e.kind !== kind) : [];
    this.save();
    return before - this.data.entries.length;
  }

  search(query: string, limit = 8): MemoryEntry[] {
    const q = query.toLowerCase().trim();
    if (!q) {
      return [...this.data.entries]
        .sort((a, b) => b.importance - a.importance || b.updatedAt - a.updatedAt)
        .slice(0, limit);
    }
    return this.data.entries
      .map((entry) => {
        const hay = `${entry.key ?? ''} ${entry.content} ${entry.tags.join(' ')}`.toLowerCase();
        let score = 0;
        for (const token of q.split(/\s+/)) {
          if (hay.includes(token)) score += 1;
        }
        if (entry.kind === 'long') score += 0.5;
        score += entry.importance / 200;
        return { entry, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((x) => x.entry);
  }

  list(kind?: MemoryKind): MemoryEntry[] {
    return this.data.entries
      .filter((e) => (kind ? e.kind === kind : true))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  toPromptBlock(query?: string): string {
    const entries = query ? this.search(query, 6) : this.list('long').slice(0, 6);
    if (!entries.length) return 'No long-term memories relevant right now.';
    return entries.map((e) => `- (${e.kind}) ${e.content}`).join('\n');
  }

  getSessionId(): string {
    return this.sessionId;
  }
}
