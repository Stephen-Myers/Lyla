# LYLA

**LYLA** (LYrate Lifeform Approximation) is a personal AI computer assistant for Windows — capable, playful, and useful — inspired by the *behavioral qualities* of assistants like JARVIS and Spider-Man 2099's LYLA, not a themed chatbot skin.

## Status

**Phase 1 — Foundation (implemented)**

- Electron + React + TypeScript application shell
- Config store, structured logging, permission guard
- Assistant core with streaming chat + tool loop
- Personality system (priority hierarchy + LYLA mode)
- LLM provider abstraction: Mock / OpenAI / Anthropic / Ollama
- Real tools: system status, open app, web search, memory, time
- Holographic desktop UI with avatar states, telemetry, activity feed, settings
- UI modes: minimal / desktop / immersive
- Interruption via **Stop** / `/stop`

**Next phases:** Voice (wake word, STT, TTS) → richer tools → full research → agent/jobs → automations → hardening

## Quick start

```bash
npm install
npm run dev
```

Optional: run unit tests

```bash
npm test
```

### Configure a real brain

1. Open **Settings** in the app
2. Choose **OpenAI**, **Anthropic**, or **Ollama**
3. Set model + API key (Ollama: base URL `http://127.0.0.1:11434/v1`)
4. Save

Without a key, the **Mock** provider still handles greetings, system status, open app, search, and memory so you can verify the acceptance-style flows offline.

## Architecture

```
electron/          Main process + secure preload bridge
core/              Assistant, personality, memory, permissions, logging
ai/                LLM / STT / TTS provider abstractions
tools/             Modular tools (schema + permission + execute)
tasks/             (Phase 5/7) scheduler, automations, background jobs
config/            Defaults + persistent settings
shared/            IPC + shared types
src/ui/            Holographic React interface
tests/             Automated tests
```

### Design rules

- Natural language first; slash commands optional
- Personality never overrides safety / intent / accuracy
- Tools are real; no fake “Done.” on failure
- Dangerous actions require confirmation
- Providers are swappable (`LLMProvider`, `VoiceProvider`, `SpeechToTextProvider`)

## Acceptance smoke (Phase 1)

| You say | LYLA does |
|--------|-----------|
| `Hey LYLA` | Responds immediately |
| `What's my system status?` | Reads CPU/RAM/battery via tool |
| `Open Chrome` | Launches Chrome |
| `Search for the best Japanese learning resources` | Opens web search |
| `Remember that I want to learn Japanese` | Stores memory (confirm) |
| `What do I want to learn?` | Recalls memory |
| `Actually stop` / Stop button | Aborts active generation |

## Privacy

- Config and memory live in the Electron user-data directory (`%APPDATA%/lyla` on Windows), **not** in this repo
- API keys entered in Settings stay on your machine in `lyla-config.json` under that folder
- Conversation content is **not** logged unless you enable conversation logging
- No secret always-on recording in Phase 1 (voice arrives in Phase 2 with explicit controls)

**Before pushing to GitHub:** do not copy `%APPDATA%/lyla` into the project folder. Keys are never supposed to live in the repo.
