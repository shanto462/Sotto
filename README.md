# Sotto

A tray-resident desktop companion that captures the active Chrome window on a
keystroke (or your voice), asks Claude to explain or summarize it, and renders
the answer in an overlay that's hidden from screen-share.

Built for lecturers, presenters, and streamers who occasionally need a quiet
recap or definition — the on-screen equivalent of speaker notes on a podium.

> **Important.** Sotto is licensed under a custom Personal & Educational Use
> license (see [LICENSE](LICENSE)). The screen-capture-invisible overlay must
> **not** be used in interviews, exams, certifications, technical assessments,
> or any other evaluative setting where AI assistance is not openly disclosed
> to and permitted by all evaluators. See LICENSE §1 for the full list of
> prohibited uses.

---

## Platform support

| Feature | macOS 13+ | Windows 10 2004+ |
|---|---|---|
| Tray icon + menu | ✓ | ✓ |
| Onboarding wizard | ✓ | ✓ |
| Settings window | ✓ | ✓ |
| Chrome capture (Ctrl+M) | ✓ | ✓ |
| Voice trigger (Ctrl+Shift+V → Whisper → Claude) | ✓ | ✓ |
| Overlay hidden from screen capture | ✓ (`NSWindowSharingNone`) | ✓ (`WDA_EXCLUDEFROMCAPTURE`) |
| Overlay positioned over Chrome | ✓ | ✗ (top-right of primary display) |
| Global hotkeys (Ctrl+B, Ctrl+H, Ctrl+L, Ctrl+1…5, …) | ✓ | ✓ |
| Light / dark / auto theme | ✓ | ✓ |

Linux is not supported.

---

## Setup

### Prerequisites

- macOS 13+ **or** Windows 10 (build 19041 / 2004+)
- Node.js ≥ 20
- Google Chrome
- An Anthropic API key
- (Optional, for voice trigger) An OpenAI API key

### Install

```bash
git clone https://github.com/shanto462/Sotto.git
cd Sotto
npm install
npm start
```

The onboarding wizard opens automatically on first launch — license
acceptance → API keys → permissions → Chrome extension. Everything is
configured from the GUI. No `.env` editing required.

### Grant OS permissions (one-time)

**macOS** — System Settings → Privacy & Security:

- **Screen Recording** — for the Electron app (required for Ctrl+M capture).
- **Microphone** — for voice trigger.
- **Accessibility** — for the global Ctrl+B / Ctrl+H / Ctrl+L hotkeys.

**Windows** — no special permissions. The first PowerShell invocation may take ~500ms.

### Load the Chrome extension

Done from the onboarding wizard (Step 4). If you skipped it or want to re-run
later, go to **tray → Preferences → Extension** or **About → Re-run setup**.

The manual steps:
1. Open `chrome://extensions`.
2. Enable **Developer mode** (top-right).
3. Click **Load unpacked** → select the [`extension/`](extension) folder.
4. Reload any open tab so the content script attaches.

---

## Run

```bash
npm start
```

That launches the Electron app. The tray icon appears in your menu bar (macOS)
or system tray (Windows). Closing windows does **not** quit the app — quit from
the tray menu or with `Cmd+Q` / `Ctrl+Q`.

---

## Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+M` (in Chrome) | Capture the active Chrome window, ask Claude with the current prompt mode |
| `Ctrl+Shift+V` (anywhere) | Start / stop voice recording → Whisper → Claude |
| `Ctrl+B` (anywhere) | Show / hide the overlay |
| `Ctrl+H` | Toggle history rail in the overlay |
| `Ctrl+L` | Clear current answer (back to empty state) |
| `Ctrl+↑ / ↓ / ← / →` | Nudge overlay 40px |
| `Ctrl+1 … Ctrl+5` | Switch prompt mode (Recap / TL;DR / Define / Explain / Translate) |
| `Cmd+,` (from tray menu) | Open Preferences |

`Ctrl+M` actually fires the Chrome extension's command — on macOS this is the
physical Control key, not Cmd. Customise at `chrome://extensions/shortcuts`.

---

## How it works

```
Chrome extension                Electron desktop app
─────────────────              ───────────────────────────────────
Ctrl+M  ──HTTP POST /ask───▶   onAsk → desktopCapturer →
                                ↓
                                Anthropic Claude (vision + active prompt)
                                ↓
                                marked → IPC → overlay window

Ctrl+Shift+V                    Renderer: MediaRecorder → ArrayBuffer
  ─(global hotkey)──▶ onVoice → ↓
                                IPC → main → OpenAI Whisper → transcript →
                                Anthropic Claude (text) → IPC → overlay

Overlay window (Electron BrowserWindow)
  • Frameless, transparent, always-on-top, click-through
  • setContentProtection(true) — hidden from screen capture
  • Hover to scroll, Ctrl+B to hide
```

The overlay is positioned over the right edge of the active Chrome window on
macOS, sits at the `screen-saver` window level (above full-screen apps), and
is click-through except when the cursor hovers it.

---

## Project structure

```
Sotto/
├── LICENSE                     Personal & Educational Use license
├── README.md
├── package.json                npm start → electron desktop/main.js
├── plans/                      Design docs
├── assets/                     Tray + app icons (regenerate with `npm run icons`)
├── src/                        Shared library (Node + Electron-main)
│   ├── capture.js              Cross-platform capture via desktopCapturer
│   ├── os.js                   Window-query: AppleScript / Win32 PowerShell
│   ├── claude.js               Anthropic API (image + text)
│   ├── voice.js                OpenAI Whisper transcription
│   ├── prompt.js               System prompts + PROMPT_PRESETS
│   ├── config.js               Env-driven constants
│   ├── server.js               Local HTTP server (factory)
│   ├── logger.js               pino
│   ├── settings.js             userData/settings.json
│   ├── secrets.js              OS keychain (safeStorage)
│   ├── extension-monitor.js    Heartbeat liveness
│   ├── history.js              Rolling Q&A store
│   └── index.js                Barrel re-exports
├── desktop/                    Electron app
│   ├── main.js                 Orchestrator
│   ├── tray.js                 Menu-bar icon + menu
│   ├── shortcuts.js            globalShortcut registration
│   ├── windows/                BrowserWindow factories
│   ├── preload/                Per-window context-bridge preloads
│   └── ui/
│       ├── shared/tokens.css   Design tokens (theme-aware)
│       ├── overlay/            Live answer overlay
│       ├── onboarding/         4-step setup wizard
│       └── settings/           Tabbed preferences window
└── extension/                  Chrome MV3 extension (Ctrl+M trigger + heartbeat)
```

---

## Settings (tray → Preferences)

- **General** — theme (dark / light / auto), opacity, font size, auto-launch on
  login, persisted history toggle, position-over-Chrome (macOS).
- **Triggers** — full list of registered global shortcuts.
- **Voice** — enable/disable, max recording length, Whisper model.
- **Prompts** — pick the active prompt mode for `Ctrl+M`. Five built-in modes;
  full system prompt text is visible for transparency.
- **API & Models** — Anthropic key, OpenAI key. Live validation against
  provider APIs. Stored in OS keychain via Electron's `safeStorage`.
- **Extension** — live connection status.
- **About** — version, runtime info, link to LICENSE.

Settings live at:
- macOS: `~/Library/Application Support/sotto/settings.json`
- Windows: `%APPDATA%\sotto\settings.json`

---

## Limitations of the "invisible" overlay

`setContentProtection(true)` blocks the overlay from the screen-capture APIs
most software uses:

- **macOS**: QuickTime, Cmd+Shift+5, Zoom / Meet / Teams / Slack screen-share,
  OBS Display/Window Capture (`NSWindowSharingNone`).
- **Windows 10 2004+ / 11**: most screen-share tools, OBS, Game Bar, Snipping
  Tool, PrintScreen (`WDA_EXCLUDEFROMCAPTURE`). On older Windows 10 builds the
  protection downgrades to "blank black region" (`WDA_MONITOR`).

It does **not** block, on any platform:
- Hardware capture cards (HDMI splitter → recorder).
- A second camera or phone pointed at the screen.
- Some browser `getDisplayMedia()` paths, depending on OS version.
- Future OS changes.

**Verify before relying on it for any important session.**
- macOS: Cmd+Shift+5 → "Record entire screen" → 3 s → review.
- Windows: Win+Shift+S, or Win+G then record.

---

## Development

```bash
# Live syntax check
node --check desktop/main.js src/*.js desktop/**/*.js

# Regenerate placeholder icons
npm run icons

# Start with a clean userData (forces onboarding)
npx electron desktop/main.js --user-data-dir=/tmp/sotto-test

# Verify the local HTTP server
curl http://127.0.0.1:8765/health
curl -X POST http://127.0.0.1:8765/heartbeat
```

### Dependencies

| Package | Purpose |
|---|---|
| `@anthropic-ai/sdk` | Claude vision + text API |
| `openai` | Whisper transcription |
| `electron` (dev) | Desktop runtime |
| `marked` + `marked-highlight` + `highlight.js` | Markdown rendering |
| `pino` + `pino-pretty` | Structured logging |
| `sharp` (dev) | One-shot icon generation |

---

## License

Personal & Educational Use License — see [LICENSE](LICENSE).

Not OSI-approved open source. Use restrictions apply; see LICENSE §1.
