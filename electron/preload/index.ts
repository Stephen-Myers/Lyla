import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import {
  IPC,
  type AssistantSnapshot,
  type AssistantState,
  type LylaConfig,
  type SpeakPayload,
  type StreamChunk,
  type UiMode,
} from '../../shared/types';

export interface LylaBridge {
  getConfig: () => Promise<LylaConfig>;
  setConfig: (partial: Partial<LylaConfig>) => Promise<LylaConfig>;
  getSnapshot: () => Promise<AssistantSnapshot | null>;
  sendMessage: (text: string) => Promise<void>;
  stop: () => Promise<void>;
  setUiMode: (mode: UiMode) => Promise<UiMode>;
  respondConfirm: (id: string, accepted: boolean) => Promise<void>;
  onStream: (cb: (chunk: StreamChunk) => void) => () => void;
  onState: (cb: (state: AssistantState) => void) => () => void;
  onSnapshot: (cb: (snapshot: AssistantSnapshot) => void) => () => void;
  onConfirm: (cb: (payload: { id: string; message: string }) => void) => () => void;
  onSpeak: (cb: (payload: SpeakPayload) => void) => () => void;
  onStopSpeak: (cb: () => void) => () => void;
}

const bridge: LylaBridge = {
  getConfig: () => ipcRenderer.invoke(IPC.GET_CONFIG),
  setConfig: (partial) => ipcRenderer.invoke(IPC.SET_CONFIG, partial),
  getSnapshot: () => ipcRenderer.invoke(IPC.GET_SNAPSHOT),
  sendMessage: (text) => ipcRenderer.invoke(IPC.SEND_MESSAGE, text),
  stop: () => ipcRenderer.invoke(IPC.STOP),
  setUiMode: (mode) => ipcRenderer.invoke(IPC.SET_UI_MODE, mode),
  respondConfirm: (id, accepted) => ipcRenderer.invoke(IPC.CONFIRM_RESPONSE, id, accepted),
  onStream: (cb) => {
    const listener = (_event: IpcRendererEvent, chunk: StreamChunk) => cb(chunk);
    ipcRenderer.on(IPC.STREAM, listener);
    return () => ipcRenderer.removeListener(IPC.STREAM, listener);
  },
  onState: (cb) => {
    const listener = (_event: IpcRendererEvent, state: AssistantState) => cb(state);
    ipcRenderer.on(IPC.STATE, listener);
    return () => ipcRenderer.removeListener(IPC.STATE, listener);
  },
  onSnapshot: (cb) => {
    const listener = (_event: IpcRendererEvent, snapshot: AssistantSnapshot) => cb(snapshot);
    ipcRenderer.on(IPC.TELEMETRY, listener);
    return () => ipcRenderer.removeListener(IPC.TELEMETRY, listener);
  },
  onConfirm: (cb) => {
    const listener = (_event: IpcRendererEvent, payload: { id: string; message: string }) =>
      cb(payload);
    ipcRenderer.on(IPC.CONFIRM, listener);
    return () => ipcRenderer.removeListener(IPC.CONFIRM, listener);
  },
  onSpeak: (cb) => {
    const listener = (_event: IpcRendererEvent, payload: SpeakPayload) => cb(payload);
    ipcRenderer.on(IPC.SPEAK, listener);
    return () => ipcRenderer.removeListener(IPC.SPEAK, listener);
  },
  onStopSpeak: (cb) => {
    const listener = () => cb();
    ipcRenderer.on(IPC.STOP_SPEAK, listener);
    return () => ipcRenderer.removeListener(IPC.STOP_SPEAK, listener);
  },
};

contextBridge.exposeInMainWorld('lyla', bridge);
