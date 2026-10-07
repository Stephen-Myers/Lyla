# LYLA

**LYLA** (LYrate Lifeform Approximation) is a personal AI assistant for Windows. It is capable, playful, and useful — inspired by the *behavioral qualities* of assistants like JARVIS and Spider-Man 2099's LYLA, not a themed chatbot skin.

You talk to it in natural language. It can check the machine, open apps, remember things, look at your screens, and speak its replies.

https://youtu.be/jm5UvJ7xr0Q

## What it does

- Streaming chat with a tool loop, so actions are real and failures are reported
- Swappable language models: Mock, OpenAI, Anthropic, or a local Ollama server
- Screen vision: list displays, read the active window, and look at a screen, window, or region
- Memory you can store, recall, and forget, with confirmation before anything is written or removed
- Spoken replies through ElevenLabs
- Holographic desktop UI with avatar states, telemetry, an activity feed, and a vision panel
- Window layouts: minimal, desktop, and immersive
- Stop a running reply with the **Stop** button, `stop`, or `/stop`

## Quick start

```bash
npm install
npm run dev
```

Use the LYLA desktop window that opens. The Vite page in a normal browser has no Electron bridge, so the assistant will not start there.

```bash
npm test
```

## Configure

Open **Settings** in the app. Config is saved on this machine under `%APPDATA%/lyla`, not in the repo.

### Language model

Choose **OpenAI**, **Anthropic**, or **Ollama**, then set the model and API key. For Ollama, the base URL is `http://127.0.0.1:11434/v1`.

**Mock** needs no key. It can still greet you and run system status, open app, search, and memory so you can try the flows offline. It does not read screen pixels.

### Voice

Turn on **Speak replies aloud**, pick **ElevenLabs**, and paste an API key plus a voice ID. Replies are spoken after they finish generating.

Listening, wake word, and speech-to-text are not wired up yet. `Alt+Space` only brings the window forward.

### Vision

**Allow screen vision** is on by default. Modes:

| Mode | Behavior |
|------|----------|
| On demand | Captures only when you ask it to look |
| Visual context | Samples the active application on an interval. No screenshots |
| Continuous | Reserved. It does not capture yet |

A vision model is optional. Leave it empty to use the chat model. With Ollama, a vision model such as `llava` can read the image locally.

**Keep vision on this machine** blocks OpenAI and Anthropic from receiving screenshots. Password managers and similar apps are excluded from capture. You can also pause vision without changing the rest of the settings.

## Things to try

| You say | LYLA does |
|--------|-----------|
| `Hey LYLA` | Responds immediately |
| `What's my system status?` | Reads CPU, memory, and battery |
| `Open Chrome` | Launches Chrome |
| `Search for the best Japanese learning resources` | Opens a DuckDuckGo search |
| `Remember that I want to learn Japanese` | Stores a memory after you confirm |
| `What do I want to learn?` | Recalls that memory |
| `What screens do I have?` | Lists connected displays |
| `Look at my screen and explain what I'm working on` | Captures and describes the display |
| `Actually stop` / Stop button | Aborts the active reply |

Web search opens the browser. It does not fetch or summarize the result pages yet.

## Layout

```
electron/          Main process and the secure preload bridge
core/              Assistant, personality, memory, permissions, logging
ai/                Language-model and speech provider abstractions
vision/            Capture, privacy, display layout, and visual understanding
tools/             Tools (schema, permission, execute)
tasks/             Placeholder for later scheduling and automations
config/            Defaults and persistent settings
shared/            IPC and shared types
src/ui/            Holographic React interface
tests/             Automated tests
```

## Design rules

- Natural language first. Slash commands are optional.
- Personality never overrides safety, intent, or accuracy.
- Tools do real work. A failed action is not reported as done.
- Remembering and forgetting ask for confirmation.
- Providers are swappable (`LLMProvider`, vision understanding, `VoiceProvider`).

## Privacy

- Settings and memory live in `%APPDATA%/lyla` (`lyla-config.json` and the memory store). API keys stay there.
- Conversation text is not written to logs unless conversation logging is turned on.
- Screen captures used for vision stay in the app user-data folder.
- There is no always-on microphone. Speech today is playback only.

Do not copy `%APPDATA%/lyla` into this repository.
