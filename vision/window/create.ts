import type { WindowInspector } from './inspector';
import { StubWindowInspector } from './inspector';
import { WindowsWindowInspector } from './windows';

export function createWindowInspector(): WindowInspector {
  if (process.platform === 'win32') {
    return new WindowsWindowInspector();
  }
  return new StubWindowInspector();
}
