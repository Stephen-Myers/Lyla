import fs from 'node:fs';
import path from 'node:path';
import type { LoggingConfig } from '../shared/types';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface LogEntry {
  ts: string;
  level: LogLevel;
  category: string;
  message: string;
  data?: unknown;
}

export class Logger {
  private level: LogLevel = 'info';
  private conversationLogging = false;
  private stream: fs.WriteStream | null = null;
  private logPath: string | null = null;

  configure(config: LoggingConfig): void {
    this.level = config.level;
    this.conversationLogging = config.conversationLogging;
  }

  initFileSink(userDataPath?: string): void {
    try {
      let root = userDataPath;
      if (!root) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { app } = require('electron') as typeof import('electron');
          root = app.getPath('userData');
        } catch {
          root = path.join(process.cwd(), 'data');
        }
      }
      const dir = path.join(root, 'logs');
      fs.mkdirSync(dir, { recursive: true });
      const day = new Date().toISOString().slice(0, 10);
      this.logPath = path.join(dir, `lyla-${day}.log`);
      this.stream = fs.createWriteStream(this.logPath, { flags: 'a' });
    } catch {
      // File logging is best-effort.
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return LEVEL_ORDER[level] >= LEVEL_ORDER[this.level];
  }

  private write(level: LogLevel, category: string, message: string, data?: unknown): void {
    if (!this.shouldLog(level)) return;
    const entry: LogEntry = {
      ts: new Date().toISOString(),
      level,
      category,
      message,
      data,
    };
    const line = JSON.stringify(entry);
    const consoleFn =
      level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    consoleFn(`[${entry.ts}] [${level}] [${category}] ${message}`, data ?? '');
    this.stream?.write(`${line}\n`);
  }

  debug(category: string, message: string, data?: unknown): void {
    this.write('debug', category, message, data);
  }

  info(category: string, message: string, data?: unknown): void {
    this.write('info', category, message, data);
  }

  warn(category: string, message: string, data?: unknown): void {
    this.write('warn', category, message, data);
  }

  error(category: string, message: string, data?: unknown): void {
    this.write('error', category, message, data);
  }

  conversation(role: string, content: string): void {
    if (!this.conversationLogging) return;
    this.info('conversation', role, { content });
  }

  async clearLogs(): Promise<void> {
    if (!this.logPath) return;
    this.stream?.end();
    this.stream = null;
    const dir = path.dirname(this.logPath);
    for (const file of fs.readdirSync(dir)) {
      if (file.startsWith('lyla-') && file.endsWith('.log')) {
        fs.unlinkSync(path.join(dir, file));
      }
    }
    this.initFileSink();
  }
}

export const logger = new Logger();
