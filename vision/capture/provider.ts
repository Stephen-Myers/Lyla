import type {
  ActiveWindowInfo,
  CaptureResult,
  ConnectedDisplay,
  CursorInfo,
  Rect,
  WindowSourceInfo,
} from '../types';

/**
 * Platform-agnostic capture surface. Desktop uses Electron/OS backends;
 * later VR / passthrough providers can implement the same contract.
 */
export interface ScreenCaptureProvider {
  readonly id: string;
  listDisplays(): Promise<ConnectedDisplay[]>;
  getCursor(): Promise<CursorInfo>;
  getActiveWindow(displays?: ConnectedDisplay[]): Promise<ActiveWindowInfo | null>;
  listWindows(): Promise<WindowSourceInfo[]>;
  captureDisplay(displayId: string): Promise<CaptureResult>;
  captureWindow(windowId: string): Promise<CaptureResult>;
  captureRegion(displayId: string, region: Rect): Promise<CaptureResult>;
  /** Optional. Fires when displays are added, removed, or resized. */
  watchDisplays?(onChange: () => void): () => void;
}

export class UnavailableCaptureProvider implements ScreenCaptureProvider {
  readonly id = 'unavailable';

  async listDisplays(): Promise<ConnectedDisplay[]> {
    return [];
  }

  async getCursor(): Promise<CursorInfo> {
    return { x: 0, y: 0, displayId: null };
  }

  async getActiveWindow(): Promise<ActiveWindowInfo | null> {
    return null;
  }

  async listWindows(): Promise<WindowSourceInfo[]> {
    return [];
  }

  async captureDisplay(): Promise<CaptureResult> {
    throw new Error('Screen capture is only available in the LYLA desktop app.');
  }

  async captureWindow(): Promise<CaptureResult> {
    throw new Error('Window capture is only available in the LYLA desktop app.');
  }

  async captureRegion(): Promise<CaptureResult> {
    throw new Error('Region capture is only available in the LYLA desktop app.');
  }
}
