import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  AssistantSnapshot,
  AssistantState,
  LylaConfig,
  UiMode,
} from '@shared/types';
import { HoloAvatar } from './components/HoloAvatar';
import { TelemetryPanel } from './components/TelemetryPanel';
import { ActivityFeed } from './components/ActivityFeed';
import { ChatPanel } from './components/ChatPanel';
import { SettingsModal } from './components/SettingsModal';
import { ConfirmBanner } from './components/ConfirmBanner';
import { useVoicePlayback } from './hooks/useVoicePlayback';

const emptySnapshot: AssistantSnapshot = {
  state: 'idle',
  messages: [],
  activities: [],
  telemetry: null,
  activeTaskIds: [],
  listening: false,
  online: true,
};

export function App() {
  const [config, setConfig] = useState<LylaConfig | null>(null);
  const [snapshot, setSnapshot] = useState<AssistantSnapshot>(emptySnapshot);
  const [state, setState] = useState<AssistantState>('idle');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirm, setConfirm] = useState<{ id: string; message: string } | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useVoicePlayback();

  useEffect(() => {
    const api = window.lyla;
    if (!api) {
      setBootError(
        'LYLA bridge unavailable. You are probably in a browser tab — use the LYLA desktop window opened by `npm run dev`, not http://localhost:5173 in Chrome/Cursor Simple Browser.',
      );
      return;
    }

    let unsubs = [
      api.onSnapshot((s) => {
        setSnapshot((prev) => {
          const messagesUnchanged =
            prev.messages.length === s.messages.length &&
            prev.messages.every(
              (m, i) =>
                m.id === s.messages[i]?.id &&
                m.content === s.messages[i]?.content &&
                m.status === s.messages[i]?.status,
            );
          return messagesUnchanged ? { ...s, messages: prev.messages } : s;
        });
        setState(s.state);
      }),
      api.onState((s) => setState(s)),
      api.onConfirm((payload) => setConfirm(payload)),
    ];

    void (async () => {
      const [cfg, snap] = await Promise.all([api.getConfig(), api.getSnapshot()]);
      setConfig(cfg);
      if (snap) {
        setSnapshot(snap);
        setState(snap.state);
      }
    })();

    return () => unsubs.forEach((u) => u());
  }, []);

  const mode = config?.uiMode ?? 'desktop';

  const modeClass = useMemo(() => `app mode-${mode} state-${state}`, [mode, state]);

  async function send(text: string) {
    if (!window.lyla || !text.trim()) return;
    await window.lyla.sendMessage(text.trim());
  }

  async function changeMode(next: UiMode) {
    if (!window.lyla) return;
    const applied = await window.lyla.setUiMode(next);
    setConfig((c) => (c ? { ...c, uiMode: applied } : c));
  }

  async function saveSettings(partial: Partial<LylaConfig>) {
    if (!window.lyla) return;
    const next = await window.lyla.setConfig(partial);
    setConfig(next);
    setSettingsOpen(false);
  }

  if (bootError) {
    return (
      <div className="app">
        <div className="empty-hint">{bootError}</div>
      </div>
    );
  }

  return (
    <div className={modeClass}>
      <header className="topbar">
        <div className="brand">
          <h1>LYLA</h1>
          <span>personal intelligence</span>
        </div>
        <div className="top-actions">
          {(['minimal', 'desktop', 'immersive'] as UiMode[]).map((m) => (
            <button
              key={m}
              className={`mode-btn${mode === m ? ' active' : ''}`}
              onClick={() => void changeMode(m)}
              type="button"
            >
              {m}
            </button>
          ))}
          <button className="icon-btn" type="button" onClick={() => setSettingsOpen(true)}>
            Settings
          </button>
          <button
            className="icon-btn danger"
            type="button"
            onClick={() => void window.lyla?.stop()}
          >
            Stop
          </button>
        </div>
      </header>

      <div className="workspace">
        <aside className="panel side-left">
          <div className="panel-header">Presence</div>
          <div className="avatar-stage">
            <HoloAvatar state={state} />
            <div className="state-label">{state}</div>
            <div className="waveform" aria-hidden>
              <span /><span /><span /><span /><span />
            </div>
          </div>
          <div className="panel-header">Telemetry</div>
          <div className="panel-body">
            <TelemetryPanel telemetry={snapshot.telemetry} />
          </div>
        </aside>

        <main className="panel chat-panel">
          <div className="panel-header">Conversation</div>
          <ChatPanel
            messages={snapshot.messages}
            onSend={(t) => void send(t)}
            inputRef={inputRef}
            disabled={!window.lyla}
          />
        </main>

        <aside className="panel side-right">
          <div className="panel-header">Activity</div>
          <div className="panel-body">
            <ActivityFeed activities={snapshot.activities} />
          </div>
        </aside>
      </div>

      {settingsOpen && config && (
        <SettingsModal
          config={config}
          onClose={() => setSettingsOpen(false)}
          onSave={(partial) => void saveSettings(partial)}
        />
      )}

      {confirm && (
        <ConfirmBanner
          message={confirm.message}
          onAccept={() => {
            void window.lyla?.respondConfirm(confirm.id, true);
            setConfirm(null);
          }}
          onDecline={() => {
            void window.lyla?.respondConfirm(confirm.id, false);
            setConfirm(null);
          }}
        />
      )}
    </div>
  );
}
