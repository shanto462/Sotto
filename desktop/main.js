import {
  app,
  clipboard,
  dialog,
  ipcMain,
  Notification,
  shell,
  systemPreferences,
} from "electron";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import hljs from "highlight.js";
import { marked } from "marked";
import { markedHighlight } from "marked-highlight";

import {
  addHistoryEntry,
  askClaude,
  askClaudeText,
  captureChromeWindowByTitle,
  clearHistory,
  DEFAULT_PORT,
  getHistoryEntry,
  hasSecret,
  hydrateProcessEnv,
  initHistory,
  isExtensionAlive,
  listHistory,
  loadSettings,
  logger,
  queryActiveChromeWindow,
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
import { openSettingsWindow } from "./windows/settings.js";
import { registerShortcuts, unregisterAll } from "./shortcuts.js";
import {
  createTray,
  destroyTray,
  setTrayHistory,
  setTrayState,
} from "./tray.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const ASSETS = join(PROJECT_ROOT, "assets");
const EXTENSION_DIR = join(PROJECT_ROOT, "extension");
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

// ── Markdown → HTML pipeline ─────────────────────────────────────────────────
marked.use(
  markedHighlight({
    langPrefix: "hljs language-",
    highlight(code, lang) {
      const language = hljs.getLanguage(lang) ? lang : "plaintext";
      return hljs.highlight(code, { language, ignoreIllegals: true }).value;
    },
  }),
);

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
  });
  overlayWin.on("closed", () => {
    overlayWin = null;
  });
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
  onboardingWin.on("closed", async () => {
    onboardingWin = null;
    // If user closed without finishing, start the runtime anyway so the app
    // remains usable from the tray (they can re-run setup from Preferences).
    if (!loadSettings().onboardingComplete && !server) {
      await startRuntime();
    }
  });
}

function openSettings(initialTab) {
  openSettingsWindow({
    preloadPath: join(__dirname, "preload", "settings.cjs"),
    indexPath: join(__dirname, "ui", "settings", "index.html"),
    iconPath: join(ASSETS, "icon-app.png"),
    initialTab,
  });
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
    if (bounds && loadSettings().positionOverChrome && isMac) {
      positionOverChrome(ensureOverlay(), bounds);
    }
    showOverlay(ensureOverlay(), isMac);
    overlayWin?.webContents.send("status", { state: "pending" });

    const { png, name } = await captureChromeWindowByTitle(title, log);
    const { text, meta } = await askClaude(png, log);
    const html = await marked.parse(text);
    overlayWin?.webContents.send("answer", { html, text, meta });

    addHistoryEntry({
      source: "text",
      question: name ? `Chrome: ${name}` : "Chrome window",
      text,
      html,
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
    const html = await marked.parse(text);
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
      html,
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
    return next;
  });
  ipcMain.handle("settings:reset", () => resetSettings());

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
  ipcMain.on("permission:open-system-settings", (_e, pane) =>
    openSystemSettings(pane),
  );

  // Extension
  ipcMain.handle("extension:info", () => ({ path: EXTENSION_DIR }));
  ipcMain.handle("extension:is-connected", () => isExtensionAlive());
  ipcMain.on("extension:open-folder", () => shell.openPath(EXTENSION_DIR));
  ipcMain.on("extension:open-page", () =>
    shell.openExternal("chrome://extensions"),
  );

  // Common
  ipcMain.on("open-external", (_e, url) => shell.openExternal(url));
  ipcMain.on("clipboard:copy", (_e, text) => clipboard.writeText(text));
  ipcMain.on("app:open-license", () =>
    shell.openPath(join(PROJECT_ROOT, "LICENSE")),
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
  ipcMain.on("history:select", (_e, id) => {
    const entry = getHistoryEntry(id);
    if (!entry) return;
    showOverlay(ensureOverlay(), isMac);
    overlayWin?.webContents.send("answer", {
      html: entry.html,
      text: entry.text,
      meta: { ...(entry.meta || {}), replayed: true },
      source: entry.source,
    });
  });
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
  const { failures } = registerShortcuts({
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
  });
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
  if (isMac) app.dock?.hide();

  hydrateProcessEnv();
  const settings = loadSettings();

  ensureOverlay();
  registerIPC();

  createTray({
    onAsk: () => handleAsk(logger).catch(() => {}),
    onVoice: handleVoiceToggle,
    onToggleOverlay: toggleOverlay,
    onOpenSettings: () => openSettings(),
    onOpenAbout: () => openSettings("about"),
    onHistorySelect: (id) => {
      const entry = getHistoryEntry(id);
      if (!entry) return;
      showOverlay(ensureOverlay(), isMac);
      overlayWin?.webContents.send("answer", {
        html: entry.html,
        text: entry.text,
        meta: { ...(entry.meta || {}), replayed: true },
        source: entry.source,
      });
    },
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
  if (onboardingWin) {
    onboardingWin.show();
    onboardingWin.focus();
  } else {
    showOverlay(ensureOverlay(), isMac);
  }
});

app.on("before-quit", () => {
  unregisterAll();
  destroyTray();
  server?.close();
});

app.on("window-all-closed", () => {
  // Tray-resident — never quit on window close.
});
