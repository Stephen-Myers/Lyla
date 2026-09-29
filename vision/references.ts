import type { ConnectedDisplay } from './types';

export interface DisplayResolution {
  display: ConnectedDisplay | null;
  ambiguous: boolean;
  reason: string;
}

/**
 * Resolve natural-language monitor references to a connected display.
 */
export function resolveDisplayReference(
  query: string | undefined,
  displays: ConnectedDisplay[],
  context: { cursorDisplayId?: string | null; activeDisplayId?: string | null } = {},
): DisplayResolution {
  if (!displays.length) {
    return { display: null, ambiguous: false, reason: 'No displays are connected.' };
  }

  const trimmed = (query ?? '').trim();
  const byExactId = displays.find((d) => d.id === trimmed);
  if (byExactId) {
    return { display: byExactId, ambiguous: false, reason: `Matched ${byExactId.label}.` };
  }

  const q = trimmed.toLowerCase();
  if (
    !q ||
    /^(this|current|here|screen|monitor|display|my screen|the screen|the monitor|the display)$/.test(q)
  ) {
    const preferred =
      displays.find((d) => d.id === context.activeDisplayId) ??
      displays.find((d) => d.id === context.cursorDisplayId) ??
      displays.find((d) => d.isPrimary) ??
      displays[0];
    return { display: preferred, ambiguous: false, reason: 'Using the current/active display.' };
  }

  const byIndex = q.match(/\b(?:display|screen|monitor)\s*(\d+)\b/) ?? q.match(/^(\d+)$/);
  if (byIndex) {
    const index = Number(byIndex[1]);
    const found = displays.find((d) => d.index === index);
    return found
      ? { display: found, ambiguous: false, reason: `Matched ${found.label}.` }
      : { display: null, ambiguous: false, reason: `No display numbered ${index}.` };
  }

  if (/\b(main|primary|first)\b/.test(q)) {
    const found = displays.find((d) => d.isPrimary) ?? displays[0];
    return { display: found, ambiguous: false, reason: 'Matched the primary display.' };
  }

  if (/\bleft\b/.test(q)) {
    const found = pickByPosition(displays, 'left') ?? leftmost(displays);
    return { display: found, ambiguous: false, reason: 'Matched the left display.' };
  }

  if (/\bright\b/.test(q)) {
    const found = pickByPosition(displays, 'right') ?? rightmost(displays);
    return { display: found, ambiguous: false, reason: 'Matched the right display.' };
  }

  if (/\b(above|top)\b/.test(q)) {
    const found = pickByPosition(displays, 'above');
    return found
      ? { display: found, ambiguous: false, reason: 'Matched the display above the primary.' }
      : { display: null, ambiguous: false, reason: 'No display is positioned above the primary.' };
  }

  if (/\b(below|bottom)\b/.test(q)) {
    const found = pickByPosition(displays, 'below');
    return found
      ? { display: found, ambiguous: false, reason: 'Matched the display below the primary.' }
      : { display: null, ambiguous: false, reason: 'No display is positioned below the primary.' };
  }

  if (/\b(second|2nd)\b/.test(q)) {
    const found = displays.find((d) => d.index === 2);
    return found
      ? { display: found, ambiguous: false, reason: 'Matched the second display.' }
      : { display: null, ambiguous: false, reason: 'There is no second display.' };
  }

  if (/\b(third|3rd)\b/.test(q)) {
    const found = displays.find((d) => d.index === 3);
    return found
      ? { display: found, ambiguous: false, reason: 'Matched the third display.' }
      : { display: null, ambiguous: false, reason: 'There is no third display.' };
  }

  const named = displays.filter((d) => d.name && monitorNameMatches(q, d.name));
  if (named.length === 1) {
    return { display: named[0], ambiguous: false, reason: `Matched ${named[0].name}.` };
  }
  if (named.length > 1) {
    return {
      display: null,
      ambiguous: true,
      reason: 'More than one display matches that name. Say left, right, or a display number.',
    };
  }

  if (/\b(other|another)\b/.test(q)) {
    if (displays.length === 1) {
      return { display: displays[0], ambiguous: false, reason: 'Only one display is connected.' };
    }
    const currentId = context.activeDisplayId ?? context.cursorDisplayId;
    const others = currentId ? displays.filter((d) => d.id !== currentId) : displays.filter((d) => !d.isPrimary);
    if (others.length === 1) {
      return { display: others[0], ambiguous: false, reason: 'Matched the other display.' };
    }
    return {
      display: null,
      ambiguous: true,
      reason: 'There are multiple other displays. Say left, right, or a display number.',
    };
  }

  if (displays.length === 1) {
    return { display: displays[0], ambiguous: false, reason: 'Only one display is connected.' };
  }

  return {
    display: null,
    ambiguous: true,
    reason: 'I am not sure which display you mean. Try "main", "left", "right", or a display number.',
  };
}

function pickByPosition(
  displays: ConnectedDisplay[],
  position: ConnectedDisplay['position'],
): ConnectedDisplay | undefined {
  return displays.find((d) => d.position === position);
}

function monitorNameMatches(query: string, name: string): boolean {
  const normalized = name.toLowerCase();
  if (query.includes(normalized) && !GENERIC_NAME_TOKENS.has(normalized)) return true;
  const tokens = normalized
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !GENERIC_NAME_TOKENS.has(token));
  return tokens.some((token) => new RegExp(`\\b${escapeRegExp(token)}\\b`).test(query));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const GENERIC_NAME_TOKENS = new Set([
  'monitor',
  'screen',
  'display',
  'generic',
  'pnp',
  'plug',
  'play',
]);

function leftmost(displays: ConnectedDisplay[]): ConnectedDisplay {
  return [...displays].sort((a, b) => a.bounds.x - b.bounds.x)[0];
}

function rightmost(displays: ConnectedDisplay[]): ConnectedDisplay {
  return [...displays].sort((a, b) => b.bounds.x - a.bounds.x)[0];
}
