import { z } from 'zod';
import type { ToolDefinition, ToolRegistry } from './types';
import { formatVisualContextForPrompt } from '../vision/context';
import { formatActiveWindow, ScreenManager } from '../vision/ScreenManager';
import { formatDisplayList } from '../vision/layout';
import type { CaptureResult } from '../vision/types';

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

function captureScreenTool(screens: ScreenManager): ToolDefinition<{ display?: string; question?: string }> {
  return {
    name: 'capture_screen',
    description:
      'Look at a display and describe what is on it: subject, visible text, equations, diagrams, code, and UI. display can be main, left, right, other, second, a monitor name, or a number. Omit display to use the screen the user is on. Pass question when the user asked to explain, read, or identify something specific.',
    permission: 'computer_control',
    inputSchema: z.object({
      display: z
        .string()
        .optional()
        .describe('Monitor reference: main, left, right, other, 1, 2, a monitor name, etc.'),
      question: z.string().optional().describe('What the user wants to know about the screen.'),
    }),
    async execute({ display, question }, ctx) {
      const result = await screens.captureScreen(display, { question, signal: ctx.signal });
      return lookResult(screens, result);
    },
  };
}

function captureWindowTool(screens: ScreenManager): ToolDefinition<{ question?: string }> {
  return {
    name: 'capture_window',
    description:
      'Look at the currently active application window and describe what is visible. Pass question when the user wants a specific part explained.',
    permission: 'computer_control',
    inputSchema: z.object({
      question: z.string().optional(),
    }),
    async execute({ question }, ctx) {
      const result = await screens.captureActiveWindow({ question, signal: ctx.signal });
      return lookResult(screens, result);
    },
  };
}

function captureRegionTool(
  screens: ScreenManager,
): ToolDefinition<{ x: number; y: number; width: number; height: number; display?: string; question?: string }> {
  return {
    name: 'capture_region',
    description:
      'Look at a rectangular region of a display and describe what is visible there. Coordinates are in display DIP/logical pixels from the top-left of that display.',
    permission: 'computer_control',
    inputSchema: z.object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
      display: z.string().optional(),
      question: z.string().optional(),
    }),
    async execute({ x, y, width, height, display, question }, ctx) {
      const result = await screens.captureRegion({ x, y, width, height }, display, {
        question,
        signal: ctx.signal,
      });
      return lookResult(screens, result);
    },
  };
}

function lookResult(screens: ScreenManager, result: CaptureResult) {
  const context = screens.getVisualContext();
  return {
    ok: true,
    output: context
      ? formatVisualContextForPrompt(context)
      : (screens.getSnapshot().lastObservation ?? 'Captured the screen.'),
    data: {
      kind: result.kind,
      width: result.width,
      height: result.height,
      context,
    },
  };
}
