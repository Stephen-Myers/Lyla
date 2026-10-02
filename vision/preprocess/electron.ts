import fs from 'node:fs/promises';
import { nativeImage } from 'electron';
import type { PreparedImage } from '../context';
import type { CaptureResult } from '../types';

const MAX_EDGE = 1600;

/** Shrink a capture before it is sent to a vision model. */
export async function preprocessWithElectron(capture: CaptureResult): Promise<PreparedImage> {
  const original = nativeImage.createFromPath(capture.filePath);
  if (original.isEmpty()) {
    const bytes = await fs.readFile(capture.filePath);
    return { bytes, mimeType: 'image/png', width: capture.width, height: capture.height };
  }
  const size = original.getSize();
  const longest = Math.max(size.width, size.height);
  const scale = longest > MAX_EDGE ? MAX_EDGE / longest : 1;
  const image =
    scale < 1
      ? original.resize({
          width: Math.max(1, Math.round(size.width * scale)),
          height: Math.max(1, Math.round(size.height * scale)),
          quality: 'good',
        })
      : original;
  const bytes = image.toJPEG(75);
  const out = image.getSize();
  return { bytes, mimeType: 'image/jpeg', width: out.width, height: out.height };
}
