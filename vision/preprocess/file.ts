import fs from 'node:fs/promises';
import type { PreparedImage } from '../context';
import type { CaptureResult } from '../types';

export async function readCaptureImage(capture: CaptureResult): Promise<PreparedImage> {
  const bytes = await fs.readFile(capture.filePath);
  return {
    bytes,
    mimeType: 'image/png',
    width: capture.width,
    height: capture.height,
  };
}
