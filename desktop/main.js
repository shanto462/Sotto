import {
  app,
  clipboard,
  desktopCapturer,
  dialog,
  ipcMain,
  Notification,
  session,
  shell,
  systemPreferences,
} from "electron";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  addHistoryEntry,
  askClaude,
  askClaudeText,
  captureChromeWindowByTitle,
  clearHistory,
  DEFAULT_PORT,
  getHistoryEntry,
  getPromptById,
  hasSecret,
  hydrateProcessEnv,
  initHistory,
  isExtensionAlive,
  listHistory,
  loadSettings,
  logger,
  PROMPT_PRESETS,
  queryActiveChromeWindow,
  renderMarkdown,
  resetSettings,
  saveSettings,
  setHistoryPersist,
  setSecret,
  subscribeHistory,
  transcribeAudio,
} from "../src/index.js";
import { createSolverServer } from "../src/server.js";

import {
  createOnboardingWindow,
} from "./windows/onboarding.js";
import {
  createOverlayWindow,
  positionOverChrome,
  showOverlay,
} from "./windows/overlay.js";
import { getSettingsWindow, openSettingsWindow } from "./windows/settings.js";
import {
  ASSETS_DIR,
  getExtensionDir,
  LICENSE_PATH,
  PROJECT_ROOT,
  syncExtensionDir,
} from "./paths.js";
import { registerShortcuts, unregisterAll } from "./shortcuts.js";
import {
  createTray,
  destroyTray,
  setTrayHistory,
  setTrayState,
} from "./tray.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS = ASSETS_DIR;
const isMac = process.platform === "darwin";

// ── Single-instance lock ──────────────────────────────────────────────────────
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

// ── .env loader (for dev convenience; keychain wins for fresh users) ─────────
const envPath = join(PROJECT_ROOT, ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["'](.*)["']$/, "$1");
    }
  }
}

// ── Renderer lockdown ────────────────────────────────────────────────────────
// Every window loads a local file and must stay on it. Links (for example in
// a rendered answer) open in the user's browser instead, and only for safe
// protocols, so file:// or custom-scheme URLs can never launch local programs.
const EXTERNAL_PROTOCOLS = new Set(["https:", "http:", "mailto:"]);

function openExternalSafe(url) {
  let parsed;
  try {
    parsed = new URL(String(url));
  } catch {
    return false;
  }
  if (!EXTERNAL_PROTOCOLS.has(parsed.protocol)) {
    logger.warn({ protocol: parsed.protocol }, "blocked external URL");
    return false;
  }
  shell.openExternal(parsed.href);
  return true;
}

app.on("web-contents-created", (_e, contents) => {
  contents.on("will-navigate", (event, url) => {
    event.preventDefault();
    openExternalSafe(url);
  });
  contents.setWindowOpenHandler(({ url }) => {
    openExternalSafe(url);
    return { action: "deny" };
  });
  contents.on("will-attach-webview", (event) => event.preventDefault());
});

// ── State ────────────────────────────────────────────────────────────────────
let overlayWin = null;
let onboardingWin = null;
let server = null;

// ── Window factories (lazy) ──────────────────────────────────────────────────
function ensureOverlay() {
  if (overlayWin && !overlayWin.isDestroyed()) return overlayWin;
  overlayWin = createOverlayWindow({
    preloadPath: join(__dirname, "preload", "overlay.cjs"),
    indexPath: join(__dirname, "ui", "overlay", "index.html"),
    isMac,
    savedBounds: loadSettings().overlay,
  });
  overlayWin.on("closed", () => {
    overlayWin = null;
  });

  // Persist user-driven move/resize. Debounced so we don't write on every
  // pixel during a drag.
  let saveTimer = null;
  const queueSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (!overlayWin || overlayWin.isDestroyed()) return;
      const [x, y] = overlayWin.getPosition();
      const [width, height] = overlayWin.getSize();
      saveSettings({ overlay: { x, y, width, height } });
    }, 400);
  };
  overlayWin.on("move", queueSave);
  overlayWin.on("resize", queueSave);

  return overlayWin;
}

function openOnboarding() {
  if (onboardingWin && !onboardingWin.isDestroyed()) {
    onboardingWin.show();
    onboardingWin.focus();
    return;
  }
  onboardingWin = createOnboardingWindow({
    preloadPath: join(__dirname, "preload", "onboarding.cjs"),
    indexPath: join(__dirname, "ui", "onboarding", "index.html"),
    iconPath: join(ASSETS, "icon-app.png"),
  });
  onboardingWin.on("show", updateDockVisibility);
  onboardingWin.on("hide", updateDockVisibility);
  onboardingWin.on("closed", async () => {
    onboardingWin = null;
    updateDockVisibility();
    // If user closed without finishing, start the runtime anyway so the app
    // remains usable from the tray (they can re-run setup from Preferences).
    if (!loadSettings().onboardingComplete && !server) {
      await startRuntime();
    }
  });
  setImmediate(updateDockVisibility);
}

function openSettings(initialTab) {
  const win = openSettingsWindow({
    preloadPath: join(__dirname, "preload", "settings.cjs"),
    indexPath: join(__dirname, "ui", "settings", "index.html"),
    iconPath: join(ASSETS, "icon-app.png"),
    initialTab,
  });
  if (win && !win.__sottoDockHooked) {
    win.__sottoDockHooked = true;
    win.on("show", updateDockVisibility);
    win.on("hide", updateDockVisibility);
    win.on("closed", updateDockVisibility);
  }
  setImmediate(updateDockVisibility);
}

// Dock visibility: show the dock icon whenever any real UI window is open
// (onboarding or settings). Hide when only the overlay is around — the
// overlay is intentionally invisible to the dock.
function updateDockVisibility() {
  if (!isMac || !app.dock) return;
  const visible = [
    onboardingWin && !onboardingWin.isDestroyed() && onboardingWin.isVisible(),
    (() => {
      const s = getSettingsWindow();
      return s && !s.isDestroyed() && s.isVisible();
    })(),
  ].some(Boolean);
  if (visible) {
    app.dock.show().catch(() => {});
  } else {
    app.dock.hide();
  }
}

// ── Capture + ask orchestration ──────────────────────────────────────────────
async function handleAsk(log) {
  if (!process.env.ANTHROPIC_API_KEY) {
    showOverlay(ensureOverlay(), isMac);
    overlayWin?.webContents.send("status", {
      state: "error",
      error: "ANTHROPIC_API_KEY is not set. Open Preferences → API & Models.",
    });
    throw new Error("ANTHROPIC_API_KEY missing");
  }

  const start = performance.now();
  setTrayState("busy");
  try {
    const { title, bounds } = queryActiveChromeWindow(log);
    const settings = loadSettings();
    if (bounds && settings.positionOverChrome && isMac) {
      positionOverChrome(ensureOverlay(), bounds, settings.overlay);
    }
    showOverlay(ensureOverlay(), isMac);
    overlayWin?.webContents.send("status", { state: "pending" });

    const { png, name } = await captureChromeWindowByTitle(title, log);
    const prompt = getPromptById(loadSettings().activePromptId);
    const { text, meta } = await askClaude(png, log, prompt.body);
    meta.promptName = prompt.name;
    const html = renderMarkdown(text);
    overlayWin?.webContents.send("answer", {
      html,
      text,
      meta,
      source: "text",
    });

    addHistoryEntry({
      source: "text",
      question: `[${prompt.name}] ${name || "Chrome window"}`,
      text,
      meta,
    });

    return {
      ok: true,
      durationMs: Math.round(performance.now() - start),
      answerChars: text.length,
    };
  } catch (err) {
    const msg = err?.stderr?.toString?.().trim() || err?.message || String(err);
    log?.error({ err: msg }, "handleAsk failed");
    showOverlay(ensureOverlay(), isMac);
    overlayWin?.webContents.send("status", { state: "error", error: msg });
    throw err;
  } finally {
    setTrayState(isExtensionAlive() ? "idle" : "warn");
  }
}

function replayHistoryEntry(id) {
  const entry = getHistoryEntry(id);
  if (!entry) return;
  showOverlay(ensureOverlay(), isMac);
  overlayWin?.webContents.send("answer", {
    // Render again from the text: history saved by older versions may hold
    // HTML that was not escaped.
    html: renderMarkdown(entry.text || ""),
    text: entry.text,
    meta: { ...(entry.meta || {}), replayed: true },
    source: entry.source,
  });
}

function toggleOverlay() {
  if (!overlayWin) return ensureOverlay();
  if (overlayWin.isVisible()) {
    overlayWin.hide();
    logger.info("overlay hidden");
  } else {
    showOverlay(overlayWin, isMac);
    logger.info("overlay shown");
  }
}

function nudgeOverlay(dx, dy) {
  if (!overlayWin) return;
  const [x, y] = overlayWin.getPosition();
  overlayWin.setPosition(x + dx, y + dy, true);
  if (!overlayWin.isVisible()) showOverlay(overlayWin, isMac);
}

function selectPrompt(id) {
  const preset = getPromptById(id);
  saveSettings({ activePromptId: preset.id });
  broadcastPrompt(preset.id);
  showOverlay(ensureOverlay(), isMac);
  overlayWin?.webContents.send("prompt:toast", { name: preset.name });
  logger.info({ id: preset.id, name: preset.name }, "active prompt set");
}

function broadcastTheme(theme) {
  for (const w of [overlayWin, onboardingWin, getSettingsWindow()]) {
    if (w && !w.isDestroyed()) w.webContents.send("theme:changed", theme);
  }
}

function broadcastPrompt(id) {
  const p = getPromptById(id);
  if (overlayWin && !overlayWin.isDestroyed()) {
    overlayWin.webContents.send("prompt:active", { id: p.id, name: p.name });
  }
}

// ── Voice orchestration ──────────────────────────────────────────────────────
function handleVoiceToggle() {
  const settings = loadSettings();
  if (settings.voice?.enabled === false) {
    logger.info("voice trigger ignored (disabled in settings)");
    return;
  }
  if (!process.env.OPENAI_API_KEY) {
    showOverlay(ensureOverlay(), isMac);
    overlayWin?.webContents.send("status", {
      state: "error",
      error:
        "OPENAI_API_KEY is required for voice. Open Preferences → API & Models.",
    });
    return;
  }
  showOverlay(ensureOverlay(), isMac);
  overlayWin?.webContents.send("voice:toggle");
}

async function handleVoiceAudio(arrayBuffer) {
  const log = logger.child({ trigger: "voice" });
  setTrayState("busy");
  try {
    overlayWin?.webContents.send("status", { state: "transcribing" });

    const settings = loadSettings();
    const { text: transcript } = await transcribeAudio(
      Buffer.from(arrayBuffer),
      {
        model: settings.voice?.whisperModel || "whisper-1",
        log,
      },
    );

    if (!transcript || !transcript.trim()) {
      throw new Error("No speech detected. Try again, a bit louder.");
    }

    overlayWin?.webContents.send("status", {
      state: "asking",
      transcript,
    });

    const { text, meta } = await askClaudeText(transcript, log);
    const html = renderMarkdown(text);
    overlayWin?.webContents.send("answer", {
      html,
      text,
      meta: { ...meta, transcript },
      source: "voice",
    });

    addHistoryEntry({
      source: "voice",
      question: transcript,
      text,
      meta: { ...meta, transcript },
    });
  } catch (err) {
    const msg = err?.message ?? String(err);
    log.error({ err: msg }, "voice handler failed");
    overlayWin?.webContents.send("status", { state: "error", error: msg });
  } finally {
    setTrayState(isExtensionAlive() ? "idle" : "warn");
  }
}

// ── Permissions (macOS only; Windows reports "granted") ──────────────────────
function getPermissionStatus() {
  if (!isMac) {
    return { screen: "granted", microphone: "granted", accessibility: "granted" };
  }
  return {
    screen: systemPreferences.getMediaAccessStatus("screen"),
    microphone: systemPreferences.getMediaAccessStatus("microphone"),
    accessibility: systemPreferences.isTrustedAccessibilityClient(false)
      ? "granted"
      : "denied",
  };
}

function openSystemSettings(pane) {
  if (!isMac) {
    shell.openExternal("ms-settings:privacy");
    return;
  }
  const urls = {
    screen:
      "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
    microphone:
      "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
    accessibility:
      "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
  };
  shell.openExternal(
    urls[pane] || "x-apple.systempreferences:com.apple.preference.security",
  );
}

/**
 * Trigger the native permission prompt for the given kind. macOS-specific;
 * on Windows we simply report granted.
 *
 * Behavior per kind:
 *  - microphone   → askForMediaAccess; returns immediately with the user's choice.
 *  - screen       → triggers the system prompt by attempting desktopCapturer.
 *                   The user is sent to System Settings → Screen Recording; the
 *                   change requires the app to restart before it takes effect.
 *  - accessibility → isTrustedAccessibilityClient(true) shows the native dialog
 *                    and offers to open System Settings.
 */
async function requestPermission(kind) {
  if (!isMac) return { ok: true, granted: true, requiresRestart: false };

  if (kind === "microphone") {
    const granted = await systemPreferences.askForMediaAccess("microphone");
    return { ok: true, granted, requiresRestart: false };
  }

  if (kind === "screen") {
    try {
      // Touching the screen-capture API surfaces the macOS prompt on first use.
      await desktopCapturer.getSources({
        types: ["screen"],
        thumbnailSize: { width: 1, height: 1 },
      });
    } catch {
      // Some Electron versions throw when status is denied; swallow — the
      // status check below is the source of truth.
    }
    // Also open the pane so the user can toggle the checkbox if needed.
    openSystemSettings("screen");
    const status = systemPreferences.getMediaAccessStatus("screen");
    return {
      ok: true,
      granted: status === "granted",
      requiresRestart: true,
    };
  }

  if (kind === "accessibility") {
    const granted = systemPreferences.isTrustedAccessibilityClient(true);
    return { ok: true, granted, requiresRestart: false };
  }

  return { ok: false, error: `Unknown permission kind: ${kind}` };
}

// ── Secret validation (live ping against provider APIs) ──────────────────────
async function testAnthropicKey(key) {
  try {
    const r = await fetch("https://api.anthropic.com/v1/models?limit=1", {
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
    });
    if (r.status === 401 || r.status === 403)
      return { ok: false, error: "Invalid key" };
    if (r.status >= 400) return { ok: false, error: `HTTP ${r.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `Network: ${e?.message ?? e}` };
  }
}

async function testOpenAIKey(key) {
  try {
    const r = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (r.status === 401) return { ok: false, error: "Invalid key" };
    if (r.status >= 400) return { ok: false, error: `HTTP ${r.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `Network: ${e?.message ?? e}` };
  }
}

// ── IPC ──────────────────────────────────────────────────────────────────────
function registerIPC() {
  // Settings
  ipcMain.handle("settings:get", () => loadSettings());
  ipcMain.handle("settings:save", (_e, patch) => {
    const next = saveSettings(patch);
    if ("autoLaunch" in (patch || {})) applyAutoLaunch(next.autoLaunch);
    if ("persistHistory" in (patch || {})) setHistoryPersist(next.persistHistory);
    if ("theme" in (patch || {})) broadcastTheme(next.theme);
    if ("activePromptId" in (patch || {})) broadcastPrompt(next.activePromptId);
    return next;
  });
  ipcMain.handle("settings:reset", () => resetSettings());

  // Prompts
  ipcMain.handle("prompts:list", () => PROMPT_PRESETS);
  ipcMain.handle("prompts:get-active", () => {
    const p = getPromptById(loadSettings().activePromptId);
    return { id: p.id, name: p.name };
  });
  ipcMain.on("prompts:select", (_e, id) => selectPrompt(id));

  // Theme
  ipcMain.handle("theme:get", () => loadSettings().theme || "dark");

  // Secrets
  ipcMain.handle("secret:info", () => ({
    anthropic: hasSecret("anthropic") || !!process.env.ANTHROPIC_API_KEY,
    openai: hasSecret("openai") || !!process.env.OPENAI_API_KEY,
  }));
  ipcMain.handle("secret:test", async (_e, { service, value }) => {
    if (service === "anthropic") return testAnthropicKey(value);
    if (service === "openai") return testOpenAIKey(value);
    return { ok: false, error: "Unknown service" };
  });
  ipcMain.handle("secret:save", (_e, { service, value }) => {
    setSecret(service, value);
    const envKey = {
      anthropic: "ANTHROPIC_API_KEY",
      openai: "OPENAI_API_KEY",
    }[service];
    if (envKey) process.env[envKey] = value;
    return { ok: true };
  });

  // Permissions
  ipcMain.handle("permission:check", () => getPermissionStatus());
  ipcMain.handle("permission:request", (_e, { kind }) =>
    requestPermission(kind),
  );
  ipcMain.on("permission:open-system-settings", (_e, pane) =>
    openSystemSettings(pane),
  );
  ipcMain.on("app:restart", () => {
    app.relaunch();
    app.exit(0);
  });

  // Extension
  ipcMain.handle("extension:info", () => ({ path: getExtensionDir() }));
  ipcMain.handle("extension:is-connected", () => isExtensionAlive());
  ipcMain.on("extension:open-folder", () =>
    shell.openPath(getExtensionDir()),
  );
  ipcMain.on("extension:open-page", () =>
    shell.openExternal("chrome://extensions"),
  );

  // Common
  ipcMain.on("open-external", (_e, url) => openExternalSafe(url));
  ipcMain.on("clipboard:copy", (_e, text) => clipboard.writeText(text));
  ipcMain.on("app:open-license", () =>
    shell.openPath(LICENSE_PATH),
  );

  // Onboarding
  ipcMain.on("onboarding:finish", async () => {
    saveSettings({ onboardingComplete: true });
    onboardingWin?.close();
    await startRuntime();
    notify("Sotto is ready", "Press Ctrl+M in Chrome to ask Claude.");
  });
  ipcMain.on("onboarding:re-run", () => {
    saveSettings({ onboardingComplete: false });
    openOnboarding();
  });

  // App info
  ipcMain.handle("app:info", () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    node: process.versions.node,
    platform: `${process.platform} (${process.arch})`,
    userData: app.getPath("userData"),
    isPackaged: app.isPackaged,
  }));

  // Overlay click-through toggle
  ipcMain.on("set-ignore-mouse-events", (_e, ignore, options) => {
    overlayWin?.setIgnoreMouseEvents(!!ignore, options ?? undefined);
  });

  // Voice: renderer sends recorded audio buffer here
  ipcMain.on("voice:audio", (_e, arrayBuffer) => {
    handleVoiceAudio(arrayBuffer);
  });

  // History
  ipcMain.handle("history:list", () => listHistory());
  ipcMain.handle("history:get", (_e, id) => getHistoryEntry(id));
  ipcMain.on("history:clear", () => clearHistory());
  ipcMain.on("history:select", (_e, id) => replayHistoryEntry(id));
}

function notify(title, body) {
  if (!loadSettings().showNotifications) return;
  if (!Notification.isSupported()) return;
  new Notification({ title, body }).show();
}

function applyAutoLaunch(enabled) {
  try {
    const current = app.getLoginItemSettings({ openAtLogin: true });
    if (current.openAtLogin === !!enabled) return; // no-op
    app.setLoginItemSettings({ openAtLogin: !!enabled });
  } catch (e) {
    logger.warn({ err: e.message }, "could not set login item");
  }
}

// ── Runtime (started after onboarding completes or immediately on return) ────
async function startRuntime() {
  hydrateProcessEnv();

  const settings = loadSettings();
  applyAutoLaunch(settings.autoLaunch);
  initHistory({ persist: settings.persistHistory });

  // Push history to overlay + rebuild tray on every change
  subscribeHistory((list) => {
    overlayWin?.webContents.send("history:update", list);
    setTrayHistory(list.slice(0, 10));
  });

  const sh = settings.shortcuts;
  const bindings = {
    ask: {
      accelerator: sh.ask,
      fn: () => handleAsk(logger.child({ trigger: "shortcut" })).catch(() => {}),
    },
    voice: {
      accelerator: sh.voice,
      fn: handleVoiceToggle,
    },
    toggle: {
      accelerator: sh.toggle,
      fn: toggleOverlay,
    },
    history: {
      accelerator: sh.history || "Control+H",
      fn: () => overlayWin?.webContents.send("history:toggle"),
    },
    clear: {
      accelerator: sh.clear || "Control+L",
      fn: () => overlayWin?.webContents.send("content:clear"),
    },
    nudgeUp: { accelerator: "Control+Up", fn: () => nudgeOverlay(0, -40) },
    nudgeDown: { accelerator: "Control+Down", fn: () => nudgeOverlay(0, 40) },
    nudgeLeft: { accelerator: "Control+Left", fn: () => nudgeOverlay(-40, 0) },
    nudgeRight: { accelerator: "Control+Right", fn: () => nudgeOverlay(40, 0) },
  };

  // Prompt-mode hotkeys (Ctrl+1..Ctrl+5)
  for (const preset of PROMPT_PRESETS) {
    if (!preset.hotkey) continue;
    bindings[`prompt-${preset.id}`] = {
      accelerator: preset.hotkey,
      fn: () => selectPrompt(preset.id),
    };
  }

  const { failures } = registerShortcuts(bindings);
  for (const f of failures) {
    logger.warn(f, "global shortcut registration failed");
  }

  server = createSolverServer({
    logger,
    mode: "desktop",
    onAsk: handleAsk,
  });

  try {
    await server.listen(DEFAULT_PORT);
  } catch (err) {
    logger.fatal({ err: err.message }, "could not start HTTP server");
    dialog.showErrorBox(
      "Sotto",
      `Could not start HTTP server on port ${DEFAULT_PORT}.\n\n${err.message}\n\nIs another Sotto instance running?`,
    );
    app.quit();
  }
}

// ── Lifecycle ────────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  // Renderers only need the microphone (overlay voice capture). Deny the rest.
  session.defaultSession.setPermissionRequestHandler(
    (_wc, permission, callback, details) => {
      const fromApp = String(details?.requestingUrl || "").startsWith("file://");
      callback(permission === "media" && fromApp);
    },
  );

  // Start hidden from dock; updateDockVisibility() will show it whenever
  // a real UI window (onboarding or settings) is visible.
  if (isMac) app.dock?.hide();

  // macOS: clicking the (now visible) dock icon should bring up settings
  // (or onboarding if it hasn't been completed yet).
  app.on("activate", () => {
    if (!loadSettings().onboardingComplete) openOnboarding();
    else openSettings();
  });

  hydrateProcessEnv();
  const settings = loadSettings();

  try {
    syncExtensionDir();
  } catch (err) {
    logger.error({ err: err.message }, "could not copy the Chrome extension");
  }

  ensureOverlay();
  registerIPC();

  createTray({
    onAsk: () => handleAsk(logger).catch(() => {}),
    onVoice: handleVoiceToggle,
    onToggleOverlay: toggleOverlay,
    onOpenSettings: () => openSettings(),
    onOpenAbout: () => openSettings("about"),
    onHistorySelect: replayHistoryEntry,
    onClearHistory: () => clearHistory(),
    onQuit: () => app.quit(),
  });

  if (!settings.onboardingComplete) {
    openOnboarding();
  } else {
    await startRuntime();
  }

  logger.info({ platform: process.platform }, "Sotto started");
});

app.on("second-instance", () => {
  // Someone tried to `open Sotto.app` while we were already running. Surface
  // it visibly so they don't think the launch silently failed.
  logger.info("second-instance attempted; bringing existing instance forward");
  if (onboardingWin && !onboardingWin.isDestroyed()) {
    onboardingWin.show();
    onboardingWin.focus();
  } else {
    showOverlay(ensureOverlay(), isMac);
  }
  notify(
    "Sotto is already running",
    "Look for the S icon in your menu bar — or use the tray to quit.",
  );
});

app.on("before-quit", () => {
  unregisterAll();
  destroyTray();
  server?.close();
});

app.on("window-all-closed", () => {
  // Tray-resident — never quit on window close.
});
