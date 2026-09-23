# LYLA Architecture Plan

## Environment

| Item | Choice |
|------|--------|
| OS | Windows 10/11 |
| Shell | Electron main (Node) + React renderer |
| Language | TypeScript end-to-end |
| UI | Vite + React 19, original holographic visual identity |
| Persistence | `electron-store` (config), JSON memory store (Phase 1) |
| Telemetry | `systeminformation` |
| Tests | Vitest |

## Why this stack

- Native-feeling desktop app with system control from the main process
- Fast holographic UI iteration in React
- Clear security boundary via `contextBridge` IPC
- Provider abstractions so Claude / OpenAI / Ollama / local voice can plug in without rewrites

## Phased delivery

1. **Foundation** — shell, config, logging, assistant, LLM, personality, conversation UI ✅
2. **Voice** — wake word, STT (Whisper), TTS (`VoiceProvider`), barge-in
3. **Tools** — filesystem, clipboard, screenshots, media, richer browser research
4. **Memory** — stronger ranking, task memory UI, forget controls polish
5. **Agent** — multi-step plans, background jobs, Claude Code delegation hook
6. **Interface** — richer avatar/expression, immersive polish
7. **Automation** — reminders, schedules, proactive levels
8. **Hardening** — security review, performance, broader tests

## Security defaults

- Computer control + web: on
- File modify / terminal / installs: confirm
- Purchases: always confirm
- System destruction: disabled
