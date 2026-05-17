# Sotto

A personal companion that captures your active Chrome window on a keystroke, asks Claude
to explain or summarize it, and renders the answer in a small overlay window that is
hidden from screen-share / screen-recording APIs.

Built for lecturers, presenters, and streamers who occasionally need a quiet recap —
the on-screen equivalent of speaker notes on a podium.

> **Important.** Sotto is licensed under a custom Personal & Educational Use license
> (see [LICENSE](LICENSE)). The screen-capture-invisible overlay must **not** be used
> in interviews, exams, certifications, technical assessments, or any other evaluative
> setting where AI assistance is not openly disclosed to and permitted by all
> evaluators. See LICENSE §1 for the full list of prohibited uses.

---

## Platform support

| Feature | macOS 13+ | Windows 10 2004+ |
|---|---|---|
| Trigger via Ctrl+M (Chrome extension) | ✓ | ✓ |
| Capture active Chrome window | ✓ (Electron `desktopCapturer` + AppleScript for title/bounds) | ✓ (Electron `desktopCapturer` + PowerShell/Win32 for title) |
| Overlay hidden from screen capture | ✓ (`NSWindowSharingNone`) | ✓ (`WDA_EXCLUDEFROMCAPTURE`) |
| Overlay auto-positioned over Chrome | ✓ | ✗ (defaults to top-right of primary display) |
| Global Ctrl+B toggle | ✓ | ✓ |

Linux is not supported.

---

## Setup

### Prerequisites

- macOS 13+ **or** Windows 10 (build 19041 / 2004+)
- Node.js ≥ 20
- Google Chrome
- An Anthropic API key

### Install

```bash
git clone https://github.com/shanto462/Sotto.git
cd Sotto
npm install
```

### Configure

Create a `.env` file at the repo root:

```ini
ANTHROPIC_API_KEY=sk-ant-…

# Optional:
# CLAUDE_MODEL=claude-sonnet-4-6   # default: claude-opus-4-7
# MAX_TOKENS=2048
# PORT=8765
# LOG_LEVEL=info
```

### Grant OS permissions (one-time)

**macOS** — System Settings → Privacy & Security:

- **Screen Recording** → enable for your terminal (Terminal / iTerm) and for Electron.
- **Automation** → allow your terminal to control "Google Chrome".
- **Accessibility** → may be requested when the `Ctrl+B` global shortcut is registered.

**Windows** — nothing special; the first PowerShell invocation may take ~500ms.

### Load the Chrome extension

1. Open `chrome://extensions`.
2. Toggle **Developer mode** (top-right).
3. **Load unpacked** → select the [`extension/`](extension) folder.
4. Reload any tab where you want the shortcut to work.

If `Ctrl+M` doesn't bind automatically, set it manually at
`chrome://extensions/shortcuts`.

---

## Run

```bash
npm run overlay
```

That starts the Electron daemon (HTTP server on `127.0.0.1:8765` + the overlay window)
and registers the global `Ctrl+B` toggle. Leave the terminal open — logs appear there.

| Shortcut | Action |
|---|---|
| `Ctrl+M` (in Chrome) | Capture the active Chrome window, ask Claude, render the answer |
| `Ctrl+B` (anywhere) | Show / hide the overlay window |

---

## How it works

```
Chrome extension                Electron daemon
─────────────────              ───────────────────────────
Ctrl+M pressed  ──HTTP POST──▶  /ask
                                  │
                                  ├─ OS query: get active Chrome window's title
                                  │    (AppleScript on macOS; PowerShell/Win32 on Windows)
                                  ├─ Electron desktopCapturer: PNG of that window
                                  ├─ Anthropic API: send PNG + system prompt
                                  └─ IPC: stream answer to overlay window
                                                │
                                                ▼
                                  Frameless, click-through, always-on-top window
                                  with setContentProtection(true) — hidden from
                                  screen-share & screen-recording pipelines.
```

On macOS the overlay is auto-positioned over the right edge of the active Chrome
window and sits at `screen-saver` window level (above full-screen apps). On Windows
it sits in the top-right of the primary display. In both cases the overlay is
click-through except when the cursor hovers it (so the scroll wheel scrolls the
answer), and stays always-on-top.

---

## Project structure

```
Sotto/
├── LICENSE                   ← Personal & Educational Use license
├── package.json              ← Single script: `npm run overlay`
├── .env / .gitignore
├── src/                      ← Shared library
│   ├── capture.js            ← Electron desktopCapturer (cross-platform)
│   ├── os.js                 ← Platform-specific window query (macOS/Windows)
│   ├── claude.js             ← Anthropic API call
│   ├── config.js             ← Env-driven constants
│   ├── prompt.js             ← System prompt
│   ├── server.js             ← HTTP server factory
│   ├── logger.js             ← pino setup
│   └── index.js              ← Barrel re-exports
├── overlay/                  ← Electron app
│   ├── main.js               ← Main process
│   ├── preload.cjs           ← Context bridge
│   ├── index.html            ← UI
│   └── ui.js                 ← Renderer-process code
└── extension/                ← Chrome extension (MV3)
    ├── manifest.json
    ├── background.js         ← Service worker → daemon
    └── content.js            ← Toast feedback
```

---

## Limitations of the "invisible" overlay

`setContentProtection(true)` blocks the overlay from the screen-capture APIs that
most software uses:

- **macOS**: QuickTime, Cmd+Shift+5, Zoom / Meet / Teams / Slack screen-share, OBS
  Display/Window Capture (uses `NSWindowSharingNone`).
- **Windows 10 2004+ / 11**: most screen-share tools, OBS Window/Display Capture,
  Game Bar, Snipping Tool, PrintScreen (uses `WDA_EXCLUDEFROMCAPTURE`). On older
  Windows 10 builds the protection downgrades to "blank black region" (`WDA_MONITOR`)
  instead of full invisibility.

It does **not** block, on any platform:

- Hardware capture cards (HDMI splitter → recorder).
- A second camera or phone pointed at the screen.
- Some browser `getDisplayMedia()` paths, depending on OS version.
- Future OS changes — Apple and Microsoft have both adjusted this behavior across
  releases.

Test against your actual screen-share tool before relying on the invisibility for any
important session.

- **macOS** quick check: Cmd+Shift+5 → "Record entire screen" → 3 seconds → review.
- **Windows** quick check: Win+Shift+S (Snipping Tool) or Win+G (Game Bar record).

---

## License

Personal & Educational Use License — see [LICENSE](LICENSE).

Not OSI-approved open source. Use restrictions apply; see LICENSE §1.
