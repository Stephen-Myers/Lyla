import type { VisionConfig, VisionMode } from '../shared/types';

export type { VisionConfig, VisionMode };

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ConnectedDisplay {
  id: string;
  index: number;
  label: string;
  /** Platform monitor name, such as "DELL U2412M". Empty when the OS does not report one. */
  name: string;
  width: number;
  height: number;
  scalePercent: number;
  /** Clockwise rotation in degrees, as reported by the platform. */
  rotation: number;
  /** Natural layout relative to the primary display. */
  position: 'primary' | 'left' | 'right' | 'above' | 'below' | 'secondary';
  isPrimary: boolean;
  bounds: Rect;
  /** Physical pixel size used for capture. */
  size: { width: number; height: number };
}

export interface CursorInfo {
  x: number;
  y: number;
  displayId: string | null;
}

export interface ActiveWindowInfo {
  title: string;
  application: string;
  processName: string;
  processId: number | null;
  displayId: string | null;
  displayLabel: string | null;
  bounds: Rect | null;
}

export interface CaptureResult {
  kind: 'display' | 'window' | 'region';
  display: ConnectedDisplay | null;
  window: ActiveWindowInfo | null;
  region: Rect | null;
  width: number;
  height: number;
  filePath: string;
  mimeType: 'image/png';
  byteLength: number;
  hash: string;
  capturedAt: number;
  cursor: CursorInfo | null;
}

export interface WindowSourceInfo {
  id: string;
  title: string;
  displayId: string | null;
}

/** Future-proof visual source (desktop, later VR / passthrough). */
export type VisualSourceKind = 'desktop_display' | 'application_window' | 'region' | 'vr_view';

export interface VisualCaptureRequest {
  sourceKind: VisualSourceKind;
  displayId?: string;
  windowId?: string;
  region?: Rect;
}

export type VisionEventName =
  | 'ScreenChanged'
  | 'WindowChanged'
  | 'ApplicationChanged'
  | 'VisualContextUpdated'
  | 'UserRequestedVision'
  | 'VisionAnalysisStarted'
  | 'VisionAnalysisCompleted'
  | 'VisionError';

export interface VisionEventMap {
  ScreenChanged: (payload: { displays: ConnectedDisplay[] }) => void;
  WindowChanged: (payload: { window: ActiveWindowInfo | null }) => void;
  ApplicationChanged: (payload: { application: string | null }) => void;
  VisualContextUpdated: (payload: { observation: string }) => void;
  UserRequestedVision: (payload: { query?: string }) => void;
  VisionAnalysisStarted: (payload: { target: string }) => void;
  VisionAnalysisCompleted: (payload: { target: string }) => void;
  VisionError: (payload: { error: string }) => void;
}
