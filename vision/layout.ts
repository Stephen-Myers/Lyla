import type { ConnectedDisplay, Rect } from './types';

export interface RawDisplay {
  id: string;
  bounds: Rect;
  size: { width: number; height: number };
  scaleFactor: number;
  isPrimary: boolean;
  name?: string;
  rotation?: number;
}

export function layoutDisplays(raw: RawDisplay[]): ConnectedDisplay[] {
  const primary = raw.find((d) => d.isPrimary) ?? raw[0];
  const sorted = [...raw].sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    if (a.bounds.x !== b.bounds.x) return a.bounds.x - b.bounds.x;
    return a.bounds.y - b.bounds.y;
  });

  return sorted.map((display, index) => {
    const position = classifyPosition(display, primary);
    return {
      id: display.id,
      index: index + 1,
      label: `Display ${index + 1}`,
      name: display.name?.trim() ?? '',
      width: display.size.width,
      height: display.size.height,
      scalePercent: Math.round(display.scaleFactor * 100),
      rotation: display.rotation ?? 0,
      position,
      isPrimary: display.isPrimary,
      bounds: display.bounds,
      size: display.size,
    };
  });
}

function classifyPosition(
  display: RawDisplay,
  primary: RawDisplay | undefined,
): ConnectedDisplay['position'] {
  if (!primary || display.id === primary.id || display.isPrimary) return 'primary';
  const d = display.bounds;
  const p = primary.bounds;
  if (d.x + d.width <= p.x + 8) return 'left';
  if (d.x >= p.x + p.width - 8) return 'right';
  if (d.y + d.height <= p.y + 8) return 'above';
  if (d.y >= p.y + p.height - 8) return 'below';
  return 'secondary';
}

export function formatDisplay(display: ConnectedDisplay): string {
  const position =
    display.position === 'primary'
      ? 'Primary'
      : display.position.charAt(0).toUpperCase() + display.position.slice(1);
  const portrait = display.rotation === 90 || display.rotation === 270 || display.height > display.width;
  return [
    display.label,
    display.name ? `Name: ${display.name}` : null,
    `Resolution: ${display.width}x${display.height}`,
    `Position: ${position}`,
    `Scale: ${display.scalePercent}%`,
    portrait ? 'Orientation: Portrait' : null,
  ]
    .filter(Boolean)
    .join('\n');
}

export function formatDisplayList(displays: ConnectedDisplay[]): string {
  if (!displays.length) return 'No displays detected.';
  return displays.map(formatDisplay).join('\n\n');
}

export function displayContainingPoint(
  displays: ConnectedDisplay[],
  x: number,
  y: number,
): ConnectedDisplay | null {
  return (
    displays.find(
      (d) =>
        x >= d.bounds.x &&
        y >= d.bounds.y &&
        x < d.bounds.x + d.bounds.width &&
        y < d.bounds.y + d.bounds.height,
    ) ?? null
  );
}

export function displayContainingRect(
  displays: ConnectedDisplay[],
  rect: Rect | null,
): ConnectedDisplay | null {
  if (!rect) return null;
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  return displayContainingPoint(displays, cx, cy);
}
