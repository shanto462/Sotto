import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  screen,
  shell,
} from "electron";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import hljs from "highlight.js";
import { marked } from "marked";
import { markedHighlight } from "marked-highlight";
import {
  askClaude,
  captureChromeWindowByTitle,
  DEFAULT_PORT,
  logger,
  queryActiveChromeWindow,
} from "../src/index.js";
import { createSolverServer } from "../src/server.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");

// ── .env loader (Electron doesn't honor node's --env-file flag) ───────────────
const envPath = join(PROJECT_ROOT, ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["'](.*)["']$/, "$1");
    }
  }
}

// ── Markdown → HTML ───────────────────────────────────────────────────────────
marked.use(
  markedHighlight({
    langPrefix: "hljs language-",
    highlight(code, lang) {
      const language = hljs.getLanguage(lang) ? lang : "plaintext";
      return hljs.highlight(code, { language, ignoreIllegals: true }).value;
    },
  }),
);

// ── State ─────────────────────────────────────────────────────────────────────
let mainWindow = null;
let server = null;
const isMac = process.platform === "darwin";

const OVERLAY_WIDTH = 540;
const OVERLAY_MARGIN = 14;

// ── Overlay window ────────────────────────────────────────────────────────────
function createOverlayWindow() {
  const { workArea } = screen.getPrimaryDisplay();
  const winHeight = Math.min(700, workArea.height - 60);

  mainWindow = new BrowserWindow({
    width: OVERLAY_WIDTH,
    height: winHeight,
    x: workArea.x + workArea.width - OVERLAY_WIDTH - OVERLAY_MARGIN,
    y: workArea.y + OVERLAY_MARGIN,
    frame: false,
    transparent: true,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    show: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // ★ Hide from screen capture / screen-share APIs.
  //   macOS: NSWindowSharingNone.  Windows: WDA_EXCLUDEFROMCAPTURE (Win10 2004+).
  mainWindow.setContentProtection(true);

  // Stay above full-screen apps. "screen-saver" is a macOS window level; on
  // Windows the boolean alwaysOnTop is the effective control, the string is ignored.
  mainWindow.setAlwaysOnTop(true, isMac ? "screen-saver" : undefined);
  if (isMac) {
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }

  // Click-through by default; renderer toggles this off on hover to enable scroll.
  mainWindow.setIgnoreMouseEvents(true, { forward: true });

  mainWindow.loadFile(join(__dirname, "index.html"));

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  logger.info(
    { contentProtection: true, clickThrough: true, platform: process.platform },
    "overlay window created",
  );
}

function positionOverChrome(bounds) {
  if (!mainWindow || !bounds) return;
  const display = screen.getDisplayMatching(bounds);
  const workArea = display.workArea;
  const winHeight = Math.min(bounds.height - 20, workArea.height - 40);
  const x = Math.max(
    workArea.x + 20,
    bounds.x + bounds.width - OVERLAY_WIDTH - OVERLAY_MARGIN,
  );
  const y = Math.max(workArea.y + 10, bounds.y + 20);
  mainWindow.setBounds({ x, y, width: OVERLAY_WIDTH, height: winHeight });
}

function showOverlay() {
  if (!mainWindow) return;
  if (!mainWindow.isVisible()) mainWindow.showInactive();
  mainWindow.setAlwaysOnTop(true, isMac ? "screen-saver" : undefined);
}

function toggleOverlay() {
  if (!mainWindow) return;
  if (mainWindow.isVisible()) {
    mainWindow.hide();
    logger.info("overlay hidden (Ctrl+B)");
  } else {
    showOverlay();
    logger.info("overlay shown (Ctrl+B)");
  }
}

// ── IPC ───────────────────────────────────────────────────────────────────────
ipcMain.on("set-ignore-mouse-events", (_e, ignore, options) => {
  mainWindow?.setIgnoreMouseEvents(!!ignore, options ?? undefined);
});

// ── Single-trigger orchestrator (passed to the HTTP server) ───────────────────
async function handleAsk(log) {
  const start = performance.now();
  try {
    // 1. Figure out which Chrome window we want (title + optional bounds).
    const { title, bounds } = queryActiveChromeWindow(log);

    // 2. Position overlay over Chrome (macOS only; bounds is null on Windows for now).
    if (bounds) positionOverChrome(bounds);
    showOverlay();
    mainWindow?.webContents.send("status", { state: "pending" });

    // 3. Capture and ask.
    const { png } = await captureChromeWindowByTitle(title, log);
    const { text, meta } = await askClaude(png, log);

    // 4. Render in the overlay.
    const html = await marked.parse(text);
    mainWindow?.webContents.send("answer", { html, text, meta });

    return {
      ok: true,
      durationMs: Math.round(performance.now() - start),
      answerChars: text.length,
    };
  } catch (err) {
    const msg = err?.stderr?.toString?.().trim() || err?.message || String(err);
    showOverlay();
    mainWindow?.webContents.send("status", { state: "error", error: msg });
    throw err;
  }
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  if (
    !process.env.ANTHROPIC_API_KEY ||
    process.env.ANTHROPIC_API_KEY === "sk-ant-replace-me"
  ) {
    logger.fatal("ANTHROPIC_API_KEY is not set in .env");
    app.quit();
    return;
  }

  createOverlayWindow();

  const accelerator = "Control+B";
  const registered = globalShortcut.register(accelerator, toggleOverlay);
  if (!registered) {
    logger.warn(
      { accelerator },
      "global shortcut registration failed (already taken by another app?)",
    );
  } else {
    logger.info({ accelerator }, "global shortcut registered");
  }

  server = createSolverServer({
    logger,
    mode: "overlay",
    onAsk: handleAsk,
  });

  try {
    await server.listen(DEFAULT_PORT);
  } catch (err) {
    logger.fatal({ err: err.message }, "could not start server");
    app.quit();
  }
});

app.on("before-quit", () => {
  globalShortcut.unregisterAll();
  server?.close();
});

app.on("window-all-closed", () => {
  // Keep alive — the overlay can be hidden but the daemon stays up for triggers.
});
