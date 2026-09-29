import type { Rect } from '../types';

export interface ForegroundWindow {
  title: string;
  processName: string;
  processId: number | null;
  exePath: string | null;
  bounds: Rect | null;
}

export interface WindowInspector {
  readonly id: string;
  getForegroundWindow(): Promise<ForegroundWindow | null>;
}

export class StubWindowInspector implements WindowInspector {
  readonly id = 'stub';

  async getForegroundWindow(): Promise<ForegroundWindow | null> {
    return null;
  }
}
