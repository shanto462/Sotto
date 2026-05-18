# Sotto — Production UI Plan

Going from "CLI-style Electron daemon" to a polished macOS/Windows desktop app
with a tray menu, onboarding wizard, settings window, and the overlay we already
have. Voice trigger plugs into the new shell.

Decisions already locked in by the user:

- **STT provider:** OpenAI Whisper.
- **Voice trigger style:** toggle (press once to start, press again to stop).
- **Voice answer location:** same overlay window as Ctrl+M.

This document is design-only. No code is written until the flow is signed off.

---

## 1. Vision

What "production-level" means here:

- **Tray-resident.** Sotto lives in the macOS menu bar / Windows system tray with
  a status icon. There is no dock icon, no "main window". Closing windows does
  not quit the app.
- **Self-configuring.** First-time users see an onboarding wizard. No `.env`
  editing required. API keys go in the OS keychain via Electron's `safeStorage`,
  not a plaintext file.
- **Self-explanatory.** Extension install state is detected and surfaced. If
  permissions are missing, the app shows what's missing and how to grant it.
- **Self-contained.** All configuration is changeable from a real Settings
  window. Shortcuts are rebindable. Prompts are editable.
- **Single-instance.** Second launch focuses the existing tray icon.
- **Honest about boundaries.** The LICENSE acceptable-use copy is shown verbatim
  during onboarding and linked from About.

---

## 2. Surfaces (inventory)

| Surface | Purpose | Lifecycle |
|---|---|---|
| **Tray icon + menu** | Always-on entry point. Status indicator. | Created on app start, destroyed on quit. |
| **Onboarding window** | First-launch wizard: keys, permissions, extension, shortcuts cheat-sheet. | Created on first launch (or via "Re-run setup"). Destroyed after completion. |
| **Settings window** | All configuration. | Lazy-created on demand from tray menu. Hidden when closed, not destroyed. |
| **Overlay window** | Shows live answers. Click-through, content-protected. | Created on app start, hidden until first trigger or Ctrl+B. |
| **About panel** | Modal inside Settings → About tab. | n/a |
| **Native notifications** | Brief OS notifications (e.g. "Ready", "Extension not detected"). | Transient. |

Explicitly **no** dock icon (macOS) and **no** taskbar entry. `app.dock.hide()`
on macOS, `skipTaskbar: true` on all windows.

---

## 3. Tray menu

```
┌───────────────────────────────────────┐
│ ● Sotto                       Ready   │
├───────────────────────────────────────┤
│ Ask Claude               ⌃M           │
│ Ask by voice…            ⌃⇧V          │
│ Show / hide overlay      ⌃B           │
├───────────────────────────────────────┤
│ History (12) ▸                        │
│ ┌──────────────────────────────────┐  │
│ │ 14:32  Treaty of Versailles      │  │
│ │ 14:18  Eigenvector intuition     │  │
│ │ 13:55  N+1 query example         │  │
│ │ …                                │  │
│ └──────────────────────────────────┘  │
├───────────────────────────────────────┤
│ Preferences…             ⌃,           │
│ Open Chrome extension folder          │
│ Check for updates                     │
├───────────────────────────────────────┤
│ About Sotto                           │
│ Quit Sotto               ⌘Q           │
└───────────────────────────────────────┘
```

**Status line** at top shows live state:
- `● Sotto · Ready` (idle)
- `◐ Sotto · Recording…` (voice capture in progress)
- `◐ Sotto · Asking Claude…` (request in flight)
- `⚠ Sotto · Extension not detected`
- `⚠ Sotto · Missing API key`

**Icon states** in the tray:
- Idle: filled circle (template image)
- Busy: animated arc
- Error: filled circle with red dot overlay

**Click behavior:**
- macOS: left-click opens menu (same as right-click).
- Windows: left-click opens menu.

---

## 4. Onboarding wizard

Triggered on first launch (no `settings.json` in `userData`). Three steps + a
finish screen. Single window, ~640×560, resizable within reason, centered.

### Step 1 — Welcome & License acknowledgement

```
┌───────────────────────────────────────────────────┐
│                                                   │
│              [ Sotto logo, large ]                │
│                                                   │
│         Welcome. Let's get you set up.            │
│                                                   │
│   Sotto captures your active Chrome window on a   │
│   keystroke, asks Claude to explain or recap it,  │
│   and shows the answer in an overlay that's       │
│   hidden from screen-share.                       │
│                                                   │
│   For lecturers, presenters, streamers — not for  │
│   interviews, exams, or anywhere AI use isn't     │
│   openly disclosed.                               │
│                                                   │
│   [ ] I have read and accept the acceptable use   │
│       terms (LICENSE §1).        [Open LICENSE ↗] │
│                                                   │
│                              [Skip]    [Continue] │
└───────────────────────────────────────────────────┘
```

`Continue` disabled until the checkbox is ticked.

### Step 2 — API keys

```
┌───────────────────────────────────────────────────┐
│  API Keys                       Step 2 of 4       │
├───────────────────────────────────────────────────┤
│                                                   │
│  Anthropic API key  (required)                    │
│  ┌─────────────────────────────────────────────┐  │
│  │ sk-ant-…                                    │  │
│  └─────────────────────────────────────────────┘  │
│  Get one at console.anthropic.com  [Open ↗]       │
│                                                   │
│  OpenAI API key  (optional — for voice trigger)   │
│  ┌─────────────────────────────────────────────┐  │
│  │ sk-…                                        │  │
│  └─────────────────────────────────────────────┘  │
│  Get one at platform.openai.com  [Open ↗]         │
│                                                   │
│  Keys are stored in your OS keychain.             │
│                                                   │
│                      [Back]  [Skip OpenAI]  [Next]│
└───────────────────────────────────────────────────┘
```

Each field has live validation: ping `/v1/models` for Anthropic, `/v1/models`
for OpenAI. Spinner while validating, green check on success, red text on
failure. Stored via `safeStorage.encryptString()` keyed by service name.

### Step 3 — Permissions

Detect current permission status using Electron's `systemPreferences` (macOS) or
infer from API availability (Windows). Show a checklist:

```
┌───────────────────────────────────────────────────┐
│  Permissions                    Step 3 of 4       │
├───────────────────────────────────────────────────┤
│                                                   │
│   ✓ Screen Recording   (required for capture)     │
│   ✓ Microphone         (for voice trigger)        │
│   ! Accessibility      (for Ctrl+B global hotkey) │
│                                                   │
│   ┌─────────────────────────────────────────────┐ │
│   │ Accessibility is not granted. macOS needs   │ │
│   │ this to let Sotto register global keyboard  │ │
│   │ shortcuts that work in any app.             │ │
│   │                                             │ │
│   │           [Open System Settings ↗]          │ │
│   └─────────────────────────────────────────────┘ │
│                                                   │
│                              [Back]    [Continue] │
└───────────────────────────────────────────────────┘
```

`Continue` enabled regardless (user can skip; they'll see warnings in the tray
status until granted).

### Step 4 — Chrome extension

```
┌───────────────────────────────────────────────────┐
│  Chrome extension              Step 4 of 4        │
├───────────────────────────────────────────────────┤
│                                                   │
│  Sotto uses a tiny Chrome extension to trigger    │
│  on Ctrl+M without you having to switch windows.  │
│                                                   │
│  Status:  ⚠ Not detected                          │
│                                                   │
│  ┌──────────────────────────────────────────────┐ │
│  │ 1. Click the button below — Chrome opens to  │ │
│  │    the extensions page.                      │ │
│  │ 2. Toggle "Developer mode" (top right).      │ │
│  │ 3. Click "Load unpacked".                    │ │
│  │ 4. Select this folder:                       │ │
│  │    /Users/.../Sotto/extension                │ │
│  │                              [Copy path]     │ │
│  └──────────────────────────────────────────────┘ │
│                                                   │
│       [Open chrome://extensions in Chrome ↗]      │
│                                                   │
│   Once loaded, the status above will turn green.  │
│                                                   │
│                                [Back]    [Finish] │
└───────────────────────────────────────────────────┘
```

The status indicator polls the extension's heartbeat (see §10) every 2s while
the window is open and updates live.

### Finish screen

Cheat-sheet of shortcuts + tray icon location pointer. Shows for ~3s, then the
window closes and the tray icon shows a "Sotto is ready" notification.

---

## 5. Settings window

Tabbed, ~720×520, resizable. Opened from tray → Preferences (or ⌃,).

### Tabs

| Tab | Contains |
|---|---|
| **General** | Theme (dark/light/auto), opacity (slider 40-100%), font size (slider 11-18 px), auto-launch on login (toggle), default position, **remember answers across sessions** (toggle, default off — when on, history persists to `userData/history.json` with a 100-entry rolling cap). |
| **Triggers** | Each global shortcut, rebindable. Capture key combo by clicking in the field. Conflict warnings shown inline. |
| **Voice** | Enable voice trigger (toggle), silence-detect threshold (slider), max recording length (slider), Whisper model (`whisper-1` for now). |
| **Prompts** | Manage the prompt library — name, description, hotkey assignment (⌃1…⌃5), prompt text editor. Add/edit/delete/reorder. |
| **API & models** | Anthropic key (with reveal/edit), Claude model picker, max tokens. OpenAI key (with reveal/edit). |
| **Extension** | Live status of Chrome extension connection. Path-to-folder copier. Re-run install hint. |
| **About** | Version, GitHub link, LICENSE viewer (rendered), credits, "Re-run setup" button. |

### Visual

```
┌─ Sotto Preferences ────────────────────────────────────┐
│  General  Triggers  Voice  Prompts  API  Extension  About │
├────────────────────────────────────────────────────────┤
│  Appearance                                            │
│    Theme         (○) Dark  ( ) Light  ( ) Auto         │
│    Opacity       ────────●──── 88%                     │
│    Font size     ────────●──── 14 px                   │
│                                                        │
│  Behavior                                              │
│    [✓] Launch Sotto at login                           │
│    [✓] Show notifications                              │
│    [ ] Show overlay over Chrome (macOS only)           │
│                                                        │
│                                                        │
│                                            [Done]      │
└────────────────────────────────────────────────────────┘
```

Settings save **on change**, no Save button. Toast at the bottom confirms.

---

## 6. Overlay window — refinements

Keep current behavior. Add:

- **Title bar status pill** — small chip on the left showing current prompt
  mode (`Recap`, `Define`, etc.) and which trigger was used (text icon for
  Ctrl+M, mic icon for voice).
- **History rail** — collapsible left strip (Ctrl+H). Same UX as the tray-menu
  "History" submenu but rendered inline in the overlay.
- **Recording state** — when voice is active, the entire overlay shows a centered
  waveform + RMS meter + "Listening… (press ⌃⇧V to stop)".

---

## 7. User flows

### 7a. First launch
```
launch
  ├─ no settings.json found
  ├─ tray icon appears with ⚠ status
  ├─ onboarding window opens automatically
  │    └─ user clicks through 4 steps
  ├─ settings persisted
  ├─ overlay window created (hidden)
  ├─ tray icon → idle status
  └─ native notification: "Sotto is ready · Press ⌃M in Chrome"
```

### 7b. Daily use (text trigger)
```
user in Chrome → ⌃M
  ├─ extension → POST /ask
  ├─ overlay fades in (top-right or over Chrome on macOS)
  ├─ status: "Capturing…"      (~50ms)
  ├─ status: "Asking Claude…"  (~1-3s)
  ├─ markdown answer renders
  └─ ⌃B hides; ⌃B again brings it back
```

### 7c. Daily use (voice trigger)
```
user anywhere → ⌃⇧V
  ├─ overlay fades in, recording UI (waveform)
  ├─ user speaks
  ├─ ⌃⇧V again (or 2s silence)
  ├─ status: "Transcribing…"  (~1s, Whisper)
  ├─ status: "Asking Claude…" (~1-3s)
  ├─ markdown answer renders
  └─ same overlay, same hide behavior
```

### 7d. Editing a prompt
```
tray → Preferences → Prompts tab
  ├─ select existing prompt or "+ New prompt"
  ├─ edit name, hotkey, body
  ├─ save (auto)
  ├─ broadcast to main: new prompt registry
  └─ next ⌃M (or the prompt's bound hotkey) uses the new text
```

### 7e. Extension drops offline
```
extension stops sending heartbeats for >60s
  ├─ tray icon turns ⚠
  ├─ tray status: "Extension not detected"
  ├─ silent (no popup) unless user opens tray menu
  └─ next ⌃M from a fresh extension restores green status
```

---

## 8. State model

Three layers of state, each with a single source of truth.

| Layer | Where | What |
|---|---|---|
| **Persistent settings** | `userData/settings.json` | Theme, shortcuts, prompts, opacity, autoLaunch, voice config, lastWindowPosition, persistHistory flag. |
| **Secrets** | OS keychain via `safeStorage` | Anthropic key, OpenAI key. |
| **Persistent history** *(opt-in)* | `userData/history.json` | Last 100 Q&As with timestamps. Only written when `persistHistory` toggle is on. |
| **Runtime state** | In-memory in main process | Current operation (idle/recording/asking), extension last-seen timestamp, in-memory history (always kept this session), permission status. |

Main process owns runtime state. Windows subscribe via IPC channels (see §10).

---

## 9. Window lifecycle

```
            ┌─────────────┐
            │  app start  │
            └──────┬──────┘
                   ▼
        ┌──────────────────────┐
        │ singleInstanceLock?  │── already running ──▶ focus existing & exit
        └──────────┬───────────┘
                   ▼
        ┌──────────────────────┐
        │ load settings.json   │
        └──────────┬───────────┘
                   ▼
           ┌───────┴───────┐
           ▼               ▼
       ┌────────┐    ┌──────────┐
       │ first  │    │ returning│
       └───┬────┘    └────┬─────┘
           ▼               ▼
   create onboarding   skip onboarding
           │               │
           └───────┬───────┘
                   ▼
        ┌──────────────────────┐
        │ create tray + overlay│
        │ (overlay hidden)     │
        └──────────┬───────────┘
                   ▼
        ┌──────────────────────┐
        │ register shortcuts   │
        │ start HTTP server    │
        └──────────────────────┘
```

---

## 10. IPC inventory

Main → Renderer:

| Channel | Payload | Consumers |
|---|---|---|
| `state:update` | `{ status, extensionOk, busy }` | overlay, tray, settings |
| `answer:show` | `{ html, text, meta, sourceMode }` | overlay |
| `recording:state` | `{ active, durationMs, rms }` | overlay |
| `history:update` | `Item[]` | overlay (rail), settings (tab) |
| `settings:applied` | `Partial<Settings>` | all windows |

Renderer → Main:

| Channel | Payload | Sender |
|---|---|---|
| `settings:save` | `Partial<Settings>` | settings |
| `settings:get` | — (responds via invoke) | settings, overlay |
| `secret:save` | `{ service, value }` | onboarding, settings |
| `secret:test` | `{ service }` (responds with `{ ok, error? }`) | onboarding, settings |
| `voice:start` / `voice:stop` | — | overlay (when user toggles inside the overlay) |
| `voice:audio` | `Blob` (transferred) | overlay (after recording stops) |
| `history:select` | `{ id }` | overlay (rail), tray |
| `permission:request` | `{ kind }` | onboarding, settings |
| `extension:openInstall` | — | onboarding, settings |

Extension ↔ Daemon (HTTP):

| Endpoint | Purpose |
|---|---|
| `GET /health` | Existing. |
| `POST /ask` | Existing. Existing path stays; just registers the heartbeat. |
| `POST /heartbeat` | New. Extension's service worker pings this on `chrome.runtime.onStartup` and every 30s while a tab is open. Used to drive the tray's `extension not detected` warning. |
| `POST /ask-voice` | New. Receives audio blob, runs Whisper, then Claude. Same response shape as `/ask`. |

---

## 11. File structure (revised)

```
sotto/
├── LICENSE
├── README.md
├── package.json
├── .gitignore
├── .env.example                ← retired; settings live in userData now
├── plans/
│   └── next-features.md
├── assets/                     ← NEW (placeholder "S" monogram)
│   ├── icon-app.png            ← 1024×1024 color, accent blue + white "S"
│   ├── icon-tray-Template.png  ← 16×16 monochrome "S" + alpha (macOS template)
│   ├── icon-tray-Template@2x.png
│   ├── icon-tray-busy.png      ← animated frames (color, used during request)
│   ├── icon-tray-warn.png      ← red overlay for error states
│   └── generate-icons.js       ← node script that renders the monogram set
├── src/                        ← shared (Node + Electron-main)
│   ├── capture.js
│   ├── claude.js               ← extended with askClaudeText()
│   ├── voice.js                ← NEW: Whisper API client
│   ├── os.js
│   ├── config.js
│   ├── prompt.js               ← becomes registry { id, name, body, hotkey }
│   ├── server.js               ← extended with /ask-voice, /heartbeat
│   ├── logger.js
│   ├── settings.js             ← NEW: load/save/migrate settings.json
│   ├── secrets.js              ← NEW: safeStorage wrapper
│   ├── extension-monitor.js    ← NEW: tracks heartbeat freshness
│   └── index.js                ← barrel
├── desktop/                    ← Electron app (was overlay/)
│   ├── main.js                 ← orchestrator
│   ├── tray.js                 ← NEW: tray icon + menu builder
│   ├── shortcuts.js            ← NEW: globalShortcut registration/teardown
│   ├── windows/                ← NEW: window factories
│   │   ├── overlay.js
│   │   ├── onboarding.js
│   │   └── settings.js
│   ├── preload/                ← per-window preloads
│   │   ├── overlay.cjs
│   │   ├── onboarding.cjs
│   │   └── settings.cjs
│   └── ui/                     ← renderer assets
│       ├── shared/             ← shared CSS tokens, fonts
│       │   └── tokens.css
│       ├── overlay/
│       │   ├── index.html
│       │   └── ui.js
│       ├── onboarding/
│       │   ├── index.html
│       │   ├── ui.js
│       │   └── styles.css
│       └── settings/
│           ├── index.html
│           ├── ui.js
│           └── styles.css
└── extension/
    ├── manifest.json
    ├── background.js           ← extended with periodic /heartbeat POSTs
    └── content.js
```

`overlay/` → `desktop/` is the only rename. Imports in `desktop/main.js` change
from `../src/...` to `../src/...` (same depth). Git will detect the move.

---

## 12. Visual design language

Shared CSS tokens used by all three windows (`desktop/ui/shared/tokens.css`):

```css
:root {
  --color-bg:        rgba(20, 22, 28, 0.92);
  --color-surface:   rgba(28, 32, 40, 0.85);
  --color-border:    rgba(255, 255, 255, 0.07);
  --color-text:      #e7e9ee;
  --color-muted:     #8b8f99;
  --color-accent:    #7aa2ff;
  --color-success:   #4ade80;
  --color-warning:   #fbbf24;
  --color-danger:    #ef4444;

  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;

  --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI Variable",
               "Inter", system-ui, sans-serif;
  --font-mono: "SF Mono", Menlo, Consolas, monospace;

  --duration-fast: 120ms;
  --duration-med:  220ms;
  --easing:        cubic-bezier(0.4, 0, 0.2, 1);
}

@media (prefers-color-scheme: light) {
  :root[data-theme="auto"] {
    --color-bg:      rgba(248, 249, 252, 0.94);
    --color-surface: rgba(255, 255, 255, 0.85);
    --color-text:    #1a1d23;
    --color-muted:   #6b7280;
    --color-border:  rgba(0, 0, 0, 0.08);
  }
}
```

No Tailwind, no React, no build step. Plain HTML + CSS + JS in each renderer,
sharing tokens. Keeps the project lean and inspectable.

---

## 13. Phasing (revised for prod-level scope)

| Phase | Ships | Effort |
|---|---|---|
| **0 — Foundation** | Tray icon + status + menu, settings.json + secrets via keychain, onboarding wizard, settings window (General tab only), extension heartbeat detection. **No new features yet** — just the shell. | ~6 h |
| **1 — Voice trigger** | `Ctrl+Shift+V` toggle, MediaRecorder → Whisper → Claude, recording UI in overlay, Voice settings tab. | ~3 h |
| **2 — History + power shortcuts** | In-overlay history rail + tray submenu, move/resize/opacity/font/clear shortcuts, fade animations, status pill in overlay title. | ~3 h |
| **3 — Prompt library + theme + extras** | Prompts tab + ⌃1..⌃5 mode shortcuts, light/dark/auto theme, auto-launch, About tab + License viewer, optional in-overlay text input. | ~3 h |

Total: ~15 h of focused work to reach a polished v1.0.

Each phase is a single coherent PR. Phase 0 is the largest because we're
building the shell. After Phase 0, every subsequent feature is just "render
into a window that already exists".

---

## 14. Decisions & open questions

**Decided**

1. **Icon** — placeholder. I'll generate a simple "S" monogram glyph:
   - `assets/icon-app.png` — 1024×1024 PNG, solid accent-blue background, white
     "S" in `font-sans` bold. Generated via Electron's `nativeImage` + a small
     canvas script committed alongside the asset.
   - `assets/icon-tray-Template.png` (+ `@2x`) — 16×16 monochrome "S" with alpha
     so macOS renders it correctly in both light and dark menu bars (the
     `-Template` suffix is what triggers template-image treatment).
2. **Persisted history** — opt-in toggle in Settings → General ("Remember
   answers across sessions"). Default: off. When enabled, history is written
   to `userData/history.json` with a configurable cap (default 100 entries,
   rolling). The keychain is not involved; this is plain JSON.
3. **Auto-update** — out of scope for v1.0. Manual `git pull && npm install`.
4. **Telemetry / error reporting** — none. Plain `pino` logs to the terminal
   running `npm run overlay`.
5. **Packaging** — out of scope for v1.0. Source-run only (`npm run overlay`).
   Future plan: `electron-builder` for `.dmg` (signed/notarized) and `.msi`.

**Still open**

- None blocking Phase 0. Anything that comes up during implementation can be
  noted in this file and resolved inline.

---

## 15. Out of scope for this plan

- Native installer / code signing / notarization.
- Chrome Web Store publication of the extension.
- Auto-update mechanism.
- Multi-language UI.
- Cloud sync of settings.
- Local Whisper / offline mode (deferred — Phase 1 ships with OpenAI Whisper).
- Mobile companion.
- Plugins / scripting API.
