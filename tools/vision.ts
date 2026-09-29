import { z } from 'zod';
import type { ToolDefinition, ToolRegistry } from './types';
import { formatActiveWindow, ScreenManager } from '../vision/ScreenManager';
import { formatDisplayList } from '../vision/layout';

export function registerVisionTools(registry: ToolRegistry, screens: ScreenManager): void {
  registry.register(getScreensTool(screens));
  registry.register(getActiveWindowTool(screens));
  registry.register(captureScreenTool(screens));
  registry.register(captureWindowTool(screens));
  registry.register(captureRegionTool(screens));
}

function getScreensTool(screens: ScreenManager): ToolDefinition {
  return {
    name: 'get_screens',
    description:
      'List connected displays (resolution, primary/left/right position, scale). Use when the user asks what screens they have or which monitor to look at.',
    permission: 'computer_control',
    inputSchema: z.object({}),
    async execute() {
      const displays = await screens.listDisplays(true);
      return {
        ok: true,
        output: formatDisplayList(displays),
        data: displays,
      };
    },
  };
}

function getActiveWindowTool(screens: ScreenManager): ToolDefinition {
  return {
    name: 'get_active_window',
    description:
      'Get the currently focused application, window title, and which display it is on. Use to interpret "this" or "what am I working in".',
    permission: 'computer_control',
    inputSchema: z.object({}),
    async execute() {
      const window = await screens.getActiveWindow(true);
      return {
        ok: true,
        output: formatActiveWindow(window),
        data: window,
      };
    },
  };
}

function captureScreenTool(screens: ScreenManager): ToolDefinition<{ display?: string }> {
  return {
    name: 'capture_screen',
    description:
      'Capture a screenshot of a display. display can be a natural reference such as "main", "left", "right", "other", "second", or a display number. Omit to capture the display the user is currently using. Phase 1 returns capture metadata (path, size, active window) — visual understanding comes in a later phase.',
    permission: 'computer_control',
    inputSchema: z.object({
      display: z
        .string()
        .optional()
        .describe('Monitor reference: main, left, right, other, 1, 2, etc.'),
    }),
    async execute({ display }) {
      const result = await screens.captureScreen(display);
      const observation = screens.getSnapshot().lastObservation ?? 'Captured the display.';
      return {
        ok: true,
        output: [
          observation,
          `Saved PNG: ${result.filePath}`,
          `Hash: ${result.hash}`,
          'Visual content analysis is not wired yet — I can see display, application, and window metadata.',
        ].join('\n'),
        data: {
          kind: result.kind,
          filePath: result.filePath,
          hash: result.hash,
          width: result.width,
          height: result.height,
          display: result.display,
          window: result.window,
        },
      };
    },
  };
}

function captureWindowTool(screens: ScreenManager): ToolDefinition {
  return {
    name: 'capture_window',
    description:
      'Capture the currently active application window rather than the full display.',
    permission: 'computer_control',
    inputSchema: z.object({}),
    async execute() {
      const result = await screens.captureActiveWindow();
      const observation = screens.getSnapshot().lastObservation ?? 'Captured the window.';
      return {
        ok: true,
        output: [
          observation,
          `Saved PNG: ${result.filePath}`,
          `Hash: ${result.hash}`,
        ].join('\n'),
        data: {
          kind: result.kind,
          filePath: result.filePath,
          hash: result.hash,
          width: result.width,
          height: result.height,
          window: result.window,
        },
      };
    },
  };
}

function captureRegionTool(
  screens: ScreenManager,
): ToolDefinition<{ x: number; y: number; width: number; height: number; display?: string }> {
  return {
    name: 'capture_region',
    description:
      'Capture a rectangular region of a display. Coordinates are in display DIP/logical pixels from the top-left of that display.',
    permission: 'computer_control',
    inputSchema: z.object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
      display: z.string().optional(),
    }),
    async execute({ x, y, width, height, display }) {
      const result = await screens.captureRegion({ x, y, width, height }, display);
      const observation = screens.getSnapshot().lastObservation ?? 'Captured a region.';
      return {
        ok: true,
        output: [
          observation,
          `Saved PNG: ${result.filePath}`,
          `Hash: ${result.hash}`,
        ].join('\n'),
        data: {
          kind: result.kind,
          filePath: result.filePath,
          hash: result.hash,
          width: result.width,
          height: result.height,
          region: result.region,
        },
      };
    },
  };
}
