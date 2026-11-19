# Sotto

[![CI](https://github.com/shanto462/Sotto/actions/workflows/ci.yml/badge.svg)](https://github.com/shanto462/Sotto/actions/workflows/ci.yml)
[![License: Personal & Educational Use](https://img.shields.io/badge/license-Personal%20%26%20Educational%20Use-blue)](LICENSE)

A tray-resident desktop companion that captures the active Chrome window on a
keystroke (or your voice), asks Claude to explain or summarize it, and shows
the answer in an overlay that is hidden from screen-share.

Built for lecturers, presenters, and streamers who sometimes need a quiet
recap or definition: the on-screen version of speaker notes on a podium.

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
| Voice trigger (Ctrl+Shift+V → transcription → Claude) | ✓ | ✓ |
| Overlay hidden from screen capture | ✓ (`NSWindowSharingNone`) | ✓ (`WDA_EXCLUDEFROMCAPTURE`) |
| Overlay drag, resize, remembered position | ✓ | ✓ |
| Optional "Start over Chrome" placement | ✓ | ✗ |
| Global hotkeys (Ctrl+B, Ctrl+H, Ctrl+L, Ctrl+1…5, …) | ✓ | ✓ |
| Light / dark / auto theme | ✓ | ✓ |

Linux is not supported.

---

## Setup

### Prerequisites

- macOS 13+ **or** Windows 10 (build 19041 / 2004+)
- Node.js 22 or newer (see [`.nvmrc`](.nvmrc))
- Google Chrome
- An OpenRouter API key. Sotto calls Claude, and transcribes voice, through
  OpenRouter, so this is the only key you need.

### Install

```bash
git clone https://github.com/shanto462/Sotto.git
cd Sotto
npm install
```

### Build and launch the app

**Recommended: build a real app bundle once, then launch that.**

```bash
npm run cert:mac         # once: create the "Sotto Local Signing" identity
npm run build:mac        # produces dist/mac-arm64/Sotto.app, signed with it
npm run run:mac          # opens it
# or both in one step:
npm run dev:mac
```

On Windows use `npm run build:win`, `npm run run:win`, or `npm run dev:win`
(produces `dist\win-unpacked\Sotto.exe`).

On macOS, `build:mac` signs the app with a self-signed local identity. Without
it, each build gets a new ad-hoc signature and macOS forgets the Screen
Recording, Microphone, and Accessibility grants after every rebuild. With it,
you grant them once. If the identity is missing, the build still succeeds and
prints how to create it.

Running the packaged app matters on macOS because the OS attributes permission
requests to the process that owns them. If you `npm start` from a terminal
(dev mode), macOS asks **the terminal** (Terminal, iTerm, Ghostty…) for
Screen Recording, Microphone, and Accessibility, not Sotto. With the packaged
app, the prompts correctly read "Sotto would like to record this computer's
screen" and the grants stay under `com.shanto.sotto`.

For quick iteration:

```bash
npm start                # dev mode; permissions are scoped to the parent terminal
```

The setup assistant opens on first launch: welcome → license → OpenRouter key
(checked live) → models → permissions → Chrome extension → done. On the Models
step you pick the answer model (Claude 5.5 family) and its effort level, and
the voice transcription model (Gemini Flash), from OpenRouter's live model
list. Everything is configured from the GUI and can be changed later in
**Preferences → API & Models**. No `.env` file is needed. If one exists, its
`OPENROUTER_MODEL`, `SOTTO_EFFORT`, `MAX_TOKENS`, and `TRANSCRIPTION_MODEL`
values override the saved choices when you run `npm start`.

### Other build targets

```bash
npm run build:dmg        # macOS: .dmg installer (not signed with a Developer ID, so Gatekeeper will warn)
npm run build:exe        # Windows: portable .exe (run on a Windows host)
```

### Grant OS permissions (one time)

**macOS**: System Settings → Privacy & Security:

- **Screen Recording**: required for Ctrl+M capture.
- **Microphone**: for the voice trigger.
- **Accessibility**: for the global Ctrl+B / Ctrl+H / Ctrl+L hotkeys.

**Windows**: no special permissions. The first PowerShell call may take about 500 ms.

### Load the Chrome extension

The setup assistant's Chrome Extension step walks you through this and shows the exact
folder to load. To run it again later, use **tray → Preferences → Extension**
or **About → Re-run setup**.

Manual steps:
1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select the extension folder:
   - from source: the [`extension/`](extension) folder in this repo
   - from a packaged app: **tray → Open Chrome extension folder**. The app
     keeps this copy in its data folder, so the path stays the same across
     updates.
4. Reload any open tab so the content script attaches.

The extension ID is fixed by the `key` in its manifest
(`afifinjoafbkafddmedlcjelgnfnoobg`), and the app only accepts requests from
that ID. If a toast says "unknown extension ID", reload the extension at
`chrome://extensions`.

---

## Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+M` (in Chrome) | Capture the active Chrome window and ask Claude with the current prompt mode |
| `Ctrl+Shift+V` (anywhere) | Start / stop voice recording → transcription → Claude |
| `Ctrl+B` (anywhere) | Show / hide the overlay |
| `Ctrl+H` | Toggle the history rail in the overlay |
| `Ctrl+L` | Clear the current answer |
| `Ctrl+↑ / ↓ / ← / →` | Nudge the overlay 40 px |
| `Ctrl+1 … Ctrl+5` | Switch prompt mode (Recap / TL;DR / Define / Explain / Translate) |
| `Cmd+,` (from the tray menu) | Open Preferences |

`Ctrl+M` fires the Chrome extension's command. On macOS this is the physical
Control key, not Cmd. You can change it at `chrome://extensions/shortcuts`.

Closing windows does **not** quit the app. Quit from the tray menu or with
`Cmd+Q` / `Ctrl+Q`.

---

## How it works

```
Chrome extension                Electron desktop app
─────────────────              ───────────────────────────────────
Ctrl+M  ──HTTP POST /ask───▶   onAsk → desktopCapturer →
                                ↓
                                Claude via OpenRouter (vision + active prompt)
                                ↓
                                marked → IPC → overlay window

Ctrl+Shift+V                    Renderer: MediaRecorder → ArrayBuffer
  ─(global hotkey)──▶ onVoice → ↓
                                IPC → main → OpenRouter (Gemini) → transcript →
                                Claude via OpenRouter (text) → IPC → overlay

Overlay window (Electron BrowserWindow)
  • Frameless, transparent, always-on-top, click-through
  • setContentProtection(true): hidden from screen capture
  • Hover to scroll, Ctrl+B to hide
```

The overlay opens at the top-right of your screen. Drag it by its top strip
and resize it from the bottom-right corner; Sotto remembers where you put it.
With **Preferences → General → Start over Chrome** (macOS), it opens over the
right edge of the active Chrome window until you move it yourself. It sits at
the `screen-saver` window level (above full-screen apps) and is click-through
except when the cursor hovers it.

---

## Privacy: what leaves your machine

Sotto has no server of its own, no account, and no analytics or telemetry.
Data only leaves your machine when you trigger a request, and only to the AI
provider that handles it:

| You do | What is sent | Sent to |
|---|---|---|
| Press `Ctrl+M` (or tray → Ask Claude) | A screenshot of the active Chrome window + the active prompt | OpenRouter API (routed to Anthropic) |
| Use the voice trigger | The recorded audio clip | OpenRouter API (routed to the transcription model, Gemini by default) |
| | The transcript of that clip | OpenRouter API (routed to Anthropic) |
| Save or test an API key | The key itself, to check that it works | That provider's API |

The providers' own data policies apply to what you send them. Locally:

- **API keys** are encrypted with the OS keychain (Electron `safeStorage`:
  Keychain on macOS, DPAPI on Windows) and stored in `secrets.enc`. They are
  never written to disk in plain text.
- **Screenshots and audio** are kept in memory only and are not saved to disk.
- **History** (the last 100 answers) is kept in memory. It is written to
  `history.json` only if you turn on **Preferences → General → Remember answers
  across sessions** (off by default).

Settings (and, for packaged builds, the Chrome extension folder) live at:
- macOS: `~/Library/Application Support/sotto/`
- Windows: `%APPDATA%\sotto\`

To wipe everything on macOS (data, keychain entry, permission grants, login
item), run `npm run reset`.

---

## Security

Sotto holds sensitive permissions (screen recording and microphone), so it is
built to keep other software from borrowing them:

- **Local server**: the extension talks to the app on `127.0.0.1:8765`. The
  server only answers loopback requests from the Sotto extension (its ID is
  pinned) or from local tools such as `curl`. Requests from web pages, other
  extensions, and DNS-rebinding attempts are rejected, so a website cannot
  trigger a capture or even detect that Sotto is running.
- **Untrusted answers**: answers are derived from whatever page is on screen,
  so raw HTML in them is escaped, never rendered, and images are shown as
  their alt text. Windows cannot navigate away
  from the app, and links open in your normal browser (`http`, `https`, and
  `mailto` only).
- **Locked-down renderers**: every window runs with `sandbox`,
  `contextIsolation`, no Node integration, and a strict Content Security
  Policy. Only the microphone permission is ever granted to a window.
- **Hardened packaging**: packaged builds disable Electron's
  `ELECTRON_RUN_AS_NODE`, `NODE_OPTIONS`, and `--inspect` entry points, and
  verify the integrity of `app.asar` at startup.

Found a vulnerability? Please report it privately. See [SECURITY.md](SECURITY.md).

---

## Limitations of the "invisible" overlay

`setContentProtection(true)` blocks the overlay from the screen-capture APIs
most software uses:

- **macOS**: QuickTime, Cmd+Shift+5, Zoom / Meet / Teams / Slack screen-share,
  OBS Display/Window Capture (`NSWindowSharingNone`).
- **Windows 10 2004+ / 11**: most screen-share tools, OBS, Game Bar, Snipping
  Tool, PrintScreen (`WDA_EXCLUDEFROMCAPTURE`). On older Windows 10 builds the
  protection falls back to a blank black region (`WDA_MONITOR`).

It does **not** block, on any platform:
- Hardware capture cards (HDMI splitter → recorder).
- A second camera or phone pointed at the screen.
- Some browser `getDisplayMedia()` paths, depending on OS version.
- Future OS changes.

**Verify it before you rely on it in an important session.**
- macOS: Cmd+Shift+5 → "Record entire screen" → 3 s → review.
- Windows: Win+Shift+S, or Win+G then record.

---

## Settings (tray → Preferences)

- **General**: theme (dark / light / auto), opacity, font size, launch at
  login, remember answers across sessions, start over Chrome (macOS),
  reset the overlay's position.
- **Triggers**: the full list of registered global shortcuts.
- **Voice**: enable/disable, max recording length, transcription model.
- **Prompts**: pick the active prompt mode for `Ctrl+M`. Five built-in modes;
  the full system prompt text is shown for transparency.
- **API & Models**: OpenRouter key, with live validation against the
  OpenRouter API. Stored in the OS keychain.
- **Extension**: live connection status.
- **About**: version, runtime info, link to the LICENSE.

---

## Development

```bash
npm run check            # lint + unit tests (what CI runs)
npm run lint             # ESLint
npm test                 # node:test unit tests in test/
npm run icons            # regenerate the placeholder icons
npm run reset            # macOS: wipe all Sotto data, keys, and permission grants
```

Useful while debugging:

```bash
# Start with a clean profile (forces onboarding)
npx electron desktop/main.js --user-data-dir=/tmp/sotto-test

# Check the local HTTP server
curl http://127.0.0.1:8765/health
curl -X POST http://127.0.0.1:8765/heartbeat
```

For local development you can put keys in a `.env` file instead of the
keychain. Copy [`.env.example`](.env.example) for the full list of options.

### Project structure

```
Sotto/
├── LICENSE                     Personal & Educational Use license
├── package.json                Scripts + electron-builder config
├── .github/                    CI, Dependabot, issue and PR templates
├── assets/                     Tray + app icons, macOS entitlements
├── scripts/reset.sh            Wipe all local Sotto state (macOS)
├── scripts/make-cert.sh        Create the local code-signing identity (macOS, once)
├── scripts/sign-mac.mjs        Sign local builds with that identity
├── src/                        Shared library (Node + Electron main)
│   ├── capture.js              Cross-platform capture via desktopCapturer
│   ├── os.js                   Window query: AppleScript / Win32 PowerShell
│   ├── claude.js               Claude via OpenRouter (image + text)
│   ├── voice.js                Voice transcription via OpenRouter
│   ├── openrouter.js           OpenRouter Chat Completions client (fetch)
│   ├── prompt.js               System prompts + PROMPT_PRESETS
│   ├── markdown.js             Markdown → HTML (raw HTML escaped)
│   ├── config.js               Env-driven constants
│   ├── server.js               Local HTTP server + origin checks
│   ├── logger.js               pino
│   ├── settings.js             userData/settings.json
│   ├── merge.js                Settings deep merge
│   ├── secrets.js              OS keychain (safeStorage)
│   ├── extension-monitor.js    Heartbeat liveness
│   ├── history.js              Rolling Q&A store
│   └── index.js                Barrel re-exports
├── desktop/                    Electron app
│   ├── main.js                 Orchestrator
│   ├── paths.js                App paths (asar-aware)
│   ├── tray.js                 Menu-bar icon + menu
│   ├── shortcuts.js            globalShortcut registration
│   ├── windows/                BrowserWindow factories
│   ├── preload/                Per-window context-bridge preloads
│   └── ui/
│       ├── shared/tokens.css   Design tokens (theme-aware)
│       ├── overlay/            Live answer overlay
│       ├── onboarding/         Step-by-step setup assistant
│       └── settings/           Tabbed preferences window
├── extension/                  Chrome MV3 extension (Ctrl+M trigger + heartbeat)
└── test/                       Unit tests (node --test)
```

### Dependencies

| Package | Purpose |
|---|---|
| `marked` + `marked-highlight` + `highlight.js` | Markdown rendering |
| `pino` + `pino-pretty` | Structured logging |
| `electron` (dev) | Desktop runtime |
| `electron-builder` (dev) | Packaging into `Sotto.app` / `.exe` |
| `eslint` (dev) | Linting |
| `sharp` (dev) | One-shot icon generation |

---

## Contributing

Bug reports and pull requests are welcome. Please read
[CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md)
first. Changes are tracked in [CHANGELOG.md](CHANGELOG.md).

## License

Personal & Educational Use License. See [LICENSE](LICENSE).

This is not OSI-approved open source. Use restrictions apply; see LICENSE §1.
