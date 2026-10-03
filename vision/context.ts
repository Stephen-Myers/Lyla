import type { ActiveWindowInfo, CaptureResult, ConnectedDisplay } from './types';

export type VisualContentType =
  | 'presentation'
  | 'document'
  | 'code'
  | 'browser'
  | 'diagram'
  | 'chart'
  | 'desktop'
  | 'image'
  | 'other';

export interface VisualElement {
  type: string;
  description: string;
}

export interface PreparedImage {
  bytes: Buffer;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
  width: number;
  height: number;
}

/** Structured understanding of one capture. Screen and app come from the capture, not the model. */
export interface VisualContext {
  screen: { id: string; label: string; resolution: string } | null;
  application: { name: string; windowTitle: string } | null;
  contentType: VisualContentType;
  subject: string;
  title: string;
  visibleText: string[];
  visualElements: VisualElement[];
  summary: string;
  confidence: number;
  /** `model` means a vision model saw the image. `metadata` means only the window title was available. */
  source: 'model' | 'metadata';
  providerId: string;
  model: string;
}

export interface VisionModelReading {
  contentType: VisualContentType;
  subject: string;
  title: string;
  visibleText: string[];
  visualElements: VisualElement[];
  summary: string;
  confidence: number;
}

const CONTENT_TYPES = new Set<VisualContentType>([
  'presentation',
  'document',
  'code',
  'browser',
  'diagram',
  'chart',
  'desktop',
  'image',
  'other',
]);

export function parseVisionReading(raw: string): VisionModelReading {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced?.[1] ?? trimmed;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new Error('Vision model did not return JSON.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body.slice(start, end + 1));
  } catch {
    throw new Error('Vision model returned malformed JSON.');
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Vision model returned malformed JSON.');
  }
  return readingFromRecord(parsed as Record<string, unknown>);
}

/** Prefer JSON. If the model describes the screen in prose, keep that instead of failing the look. */
export function readingFromModelText(raw: string): VisionModelReading {
  const text = raw.trim();
  if (!text) {
    throw new Error('Vision model returned an empty description.');
  }
  try {
    return parseVisionReading(text);
  } catch {
    return {
      contentType: 'other',
      subject: '',
      title: '',
      visibleText: [],
      visualElements: [],
      summary: clip(text, 1200),
      confidence: 0.45,
    };
  }
}

export function metadataContext(input: {
  capture: CaptureResult;
  providerId: string;
  model: string;
  summary?: string;
}): VisualContext {
  const window = input.capture.window;
  const app = window?.application || window?.processName || '';
  const title = window?.title || '';
  return {
    screen: screenOf(input.capture.display),
    application: app || title ? { name: app || 'Unknown application', windowTitle: title } : null,
    contentType: inferContentType(`${title} ${app}`),
    subject: '',
    title,
    visibleText: [],
    visualElements: [],
    summary:
      input.summary ??
      (app
        ? `The active application is ${app}${title ? `, window “${title}”` : ''}. The image itself was not read.`
        : 'A screen was captured, but the image itself was not read.'),
    confidence: 0.3,
    source: 'metadata',
    providerId: input.providerId,
    model: input.model,
  };
}

export function contextFromReading(
  reading: VisionModelReading,
  capture: CaptureResult,
  provider: { id: string; model: string },
): VisualContext {
  const window = capture.window;
  const app = window?.application || window?.processName || '';
  return {
    screen: screenOf(capture.display),
    application: app || window?.title ? { name: app || 'Unknown application', windowTitle: window?.title || '' } : null,
    contentType: reading.contentType,
    subject: reading.subject,
    title: reading.title || window?.title || '',
    visibleText: reading.visibleText,
    visualElements: reading.visualElements,
    summary: reading.summary,
    confidence: reading.confidence,
    source: 'model',
    providerId: provider.id,
    model: provider.model,
  };
}

export function formatObservation(ctx: VisualContext): string {
  const lines: string[] = ['I see:', '', ctx.summary.trim() || 'Something is on screen, but I could not summarize it.'];
  if (ctx.contentType !== 'other') {
    lines.push('', 'Kind:', labelContentType(ctx.contentType));
  }
  if (ctx.subject) lines.push('', 'Topic:', ctx.subject);
  if (ctx.title) lines.push('', 'Title:', ctx.title);
  for (const equation of equationSnippets(ctx).slice(0, 3)) {
    lines.push('', 'Detected equation:', equation);
  }
  const other = ctx.visualElements.filter((el) => el.type !== 'equation').slice(0, 4);
  if (other.length) {
    lines.push('', 'Also visible:');
    for (const el of other) lines.push(`- ${el.type}: ${el.description}`);
  }
  if (ctx.confidence < 0.55) {
    lines.push('', "I'm not completely sure about some of this.");
  }
  if (ctx.source === 'metadata') {
    lines.push('', 'A vision model did not read this image. This is only the active window.');
  } else {
    lines.push('', `Understood by ${ctx.providerId} / ${ctx.model}.`);
  }
  return lines.join('\n');
}

/** What the chat model should see, including text the panel summary may shorten. */
export function formatVisualContextForPrompt(ctx: VisualContext): string {
  const parts = [
    formatObservation(ctx),
    ctx.visibleText.length ? `Visible text:\n${ctx.visibleText.map((line) => `- ${line}`).join('\n')}` : '',
    `Confidence: ${Math.round(ctx.confidence * 100)}%`,
    ctx.screen ? `Screen: ${ctx.screen.label} ${ctx.screen.resolution}` : '',
    ctx.application?.name ? `Application: ${ctx.application.name}` : '',
    ctx.application?.windowTitle ? `Window: ${ctx.application.windowTitle}` : '',
  ];
  return parts.filter(Boolean).join('\n');
}

export function buildVisionUserPrompt(input: {
  question?: string;
  application?: string;
  windowTitle?: string;
  displayLabel?: string;
}): string {
  const lines = [
    'Describe what is visible in this screenshot.',
    'Return only JSON with keys content_type, subject, title, visible_text, visual_elements, summary, confidence.',
    'content_type is one of: presentation, document, code, browser, diagram, chart, desktop, image, other.',
    'visual_elements is an array of { "type": "equation|diagram|chart|code|image|ui|text", "description": "..." }.',
    'Quote headings and equations exactly when you can read them. Do not invent text that is not visible.',
    'confidence is a number from 0 to 1.',
  ];
  if (input.displayLabel) lines.push(`Display: ${input.displayLabel}.`);
  if (input.application) lines.push(`Active application: ${input.application}.`);
  if (input.windowTitle) lines.push(`Window title: ${input.windowTitle}.`);
  if (input.question?.trim()) {
    lines.push(`The user asked: ${input.question.trim()}`);
    lines.push('Pay particular attention to the part of the screen that question is about.');
  }
  return lines.join('\n');
}

function readingFromRecord(record: Record<string, unknown>): VisionModelReading {
  return {
    contentType: normalizeContentType(record.content_type ?? record.contentType),
    subject: clip(record.subject, 200),
    title: clip(record.title, 200),
    visibleText: stringList(record.visible_text ?? record.visibleText).slice(0, 12),
    visualElements: elementList(record.visual_elements ?? record.visualElements).slice(0, 12),
    summary: clip(record.summary, 1200),
    confidence: normalizeConfidence(record.confidence),
  };
}

function screenOf(display: ConnectedDisplay | null): VisualContext['screen'] {
  if (!display) return null;
  return {
    id: display.id,
    label: display.name ? `${display.label} — ${display.name}` : display.label,
    resolution: `${display.width}x${display.height}`,
  };
}

function equationSnippets(ctx: VisualContext): string[] {
  const fromText = ctx.visibleText.filter((line) => /=|\\[a-zA-Z]/.test(line));
  if (fromText.length) return fromText;
  return ctx.visualElements.filter((el) => el.type === 'equation').map((el) => el.description);
}

function labelContentType(type: VisualContentType): string {
  if (type === 'code') return 'Code';
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function inferContentType(haystack: string): VisualContentType {
  const hay = haystack.toLowerCase();
  if (/visual studio|vscode|cursor|code/.test(hay)) return 'code';
  if (/slide|powerpoint|lecture|keynote/.test(hay)) return 'presentation';
  if (/chrome|edge|firefox|opera|browser/.test(hay)) return 'browser';
  if (/excel|spreadsheet|sheets/.test(hay)) return 'chart';
  if (/word|pdf|acrobat|document/.test(hay)) return 'document';
  return 'desktop';
}

function normalizeContentType(value: unknown): VisualContentType {
  const text = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return CONTENT_TYPES.has(text as VisualContentType) ? (text as VisualContentType) : 'other';
}

function normalizeConfidence(value: unknown): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(n)) return 0.5;
  const unit = n > 1 ? n / 100 : n;
  return Math.min(1, Math.max(0, unit));
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => clip(item, 500));
}

function elementList(value: unknown): VisualElement[] {
  if (!Array.isArray(value)) return [];
  const elements: VisualElement[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const description = clip(record.description, 400);
    if (!description) continue;
    const type = clip(record.type, 40).toLowerCase() || 'text';
    elements.push({ type, description });
  }
  return elements;
}

function clip(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

export function activeWindowHint(window: ActiveWindowInfo | null): { application?: string; windowTitle?: string } {
  if (!window) return {};
  return {
    application: window.application || window.processName || undefined,
    windowTitle: window.title || undefined,
  };
}
