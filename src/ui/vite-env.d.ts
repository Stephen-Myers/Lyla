import type { LylaBridge } from '../../electron/preload/index';

declare global {
  interface Window {
    lyla: LylaBridge;
  }
}

export {};
