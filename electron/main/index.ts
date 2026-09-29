import {
  app,
  BrowserWindow,
  ipcMain,
  globalShortcut,
  shell,
} from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LylaAssistant } from '../../core/assistant';
import { loadConfig, saveConfig } from '../../config/store';
import { logger } from '../../core/logging';
import { IPC, type LylaConfig, type UiMode } from '../../shared/types';
import { createElectronCaptureProvider } from '../../vision/capture/electron';
import { PrivacyManager } from '../../vision/privacy';
import { ScreenManager } from '../../vision/ScreenManager';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;
let assistant: LylaAssistant | null = null;

const isDev = !app.isPackaged;

function resolvePreloadPath(): string {
  const candidates = [
    path.join(__dirname, '../preload/index.cjs'),
    path.join(__dirname, '../preload/index.mjs'),
    path.join(__dirname, '../preload/index.js'),
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error(`LYLA preload script not found. Looked in:\n${candidates.join('\n')}`);
  }
  return found;
}

function createWindow(): void {
  const preload = resolvePreloadPath();
  logger.info('electron', 'Using preload', { preload });

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 420,
    minHeight: 520,
    backgroundColor: '#05080f',
    title: 'LYLA',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.webContents.on('preload-error', (_event, preloadPath, error) => {
    logger.error('electron', 'Preload failed', { preloadPath, error: String(error) });
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL || (isDev ? 'http://localhost:5173' : null);
  if (devUrl) {
    void mainWindow.loadURL(devUrl);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function wireAssistant(instance: LylaAssistant): void {
  instance.on('stream', (chunk) => {
    mainWindow?.webContents.send(IPC.STREAM, chunk);
  });
  instance.on('state', (state) => {
    mainWindow?.webContents.send(IPC.STATE, state);
  });
  instance.on('snapshot', (snapshot) => {
    mainWindow?.webContents.send(IPC.TELEMETRY, snapshot);
  });
  instance.on('confirm', (payload) => {
    mainWindow?.webContents.send(IPC.CONFIRM, payload);
  });
  instance.on('speak', (payload) => {
    mainWindow?.webContents.send(IPC.SPEAK, payload);
  });
  instance.on('stopSpeak', () => {
    mainWindow?.webContents.send(IPC.STOP_SPEAK);
  });
}

function registerIpc(): void {
  ipcMain.handle(IPC.GET_CONFIG, () => assistant?.getConfig() ?? loadConfig());

  ipcMain.handle(IPC.SET_CONFIG, (_event, partial: Partial<LylaConfig>) => {
    const current = assistant?.getConfig() ?? loadConfig();
    const next = saveConfig({
      ...current,
      ...partial,
      personality: { ...current.personality, ...partial.personality },
      voice: { ...current.voice, ...partial.voice },
      permissions: { ...current.permissions, ...partial.permissions },
      user: { ...current.user, ...partial.user },
      llm: { ...current.llm, ...partial.llm },
      logging: { ...current.logging, ...partial.logging },
      vision: { ...current.vision, ...partial.vision },
    });
    assistant?.setConfig(next);
    return next;
  });

  ipcMain.handle(IPC.GET_SNAPSHOT, () => assistant?.getSnapshot() ?? null);

  ipcMain.handle(IPC.SEND_MESSAGE, async (_event, text: string) => {
    if (!assistant) return;
    await assistant.handleSlashOrMessage(text);
  });

  ipcMain.handle(IPC.STOP, () => {
    assistant?.abortActive('Stopped by user');
  });

  ipcMain.handle(IPC.SET_UI_MODE, (_event, mode: UiMode) => {
    assistant?.setUiMode(mode);
    const current = assistant?.getConfig() ?? loadConfig();
    saveConfig({ ...current, uiMode: mode });
    if (!mainWindow) return mode;
    if (mode === 'minimal') {
      mainWindow.setSize(420, 640, true);
    } else if (mode === 'immersive') {
      mainWindow.setSize(1480, 920, true);
    } else {
      mainWindow.setSize(1280, 820, true);
    }
    return mode;
  });

  ipcMain.handle(IPC.CONFIRM_RESPONSE, (_event, id: string, accepted: boolean) => {
    assistant?.resolveConfirm(id, accepted);
  });

  ipcMain.handle(IPC.RUN_COMMAND, async (_event, command: string) => {
    if (!assistant) return;
    await assistant.handleSlashOrMessage(command);
  });
}

app.whenReady().then(() => {
  const config = loadConfig();
  logger.configure(config.logging);
  logger.initFileSink();
  const captureDir = path.join(app.getPath('userData'), 'vision-captures');
  fs.mkdirSync(captureDir, { recursive: true });
  const screenManager = new ScreenManager({
    capture: createElectronCaptureProvider({ captureDir }),
    privacy: new PrivacyManager(config.vision),
    config: config.vision,
  });
  assistant = new LylaAssistant(config, { screenManager });
  wireAssistant(assistant);
  assistant.start();
  registerIpc();
  createWindow();

  try {
    globalShortcut.register(config.voice.hotkey || 'Alt+Space', () => {
      mainWindow?.webContents.send(IPC.STATE, 'listening');
      mainWindow?.show();
      mainWindow?.focus();
    });
  } catch (error) {
    logger.warn('hotkey', 'Failed to register hotkey', error);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  assistant?.stopServices();
  globalShortcut.unregisterAll();
  if (process.platform !== 'darwin') app.quit();
});
