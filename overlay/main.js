import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  screen,
  shell,
} from "electron";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import hljs from "highlight.js";
import { marked } from "marked";
import { markedHighlight } from "marked-highlight";
import {
  DEFAULT_PORT,
  getChromeWindowBounds,
  logger,
  MODEL,
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
let tempDir = null;
let imagePath = null;
let lastChromeBounds = null;

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
  mainWindow.setContentProtection(true);
  mainWindow.setAlwaysOnTop(true, "screen-saver");
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.setIgnoreMouseEvents(true, { forward: true });

  mainWindow.loadFile(join(__dirname, "index.html"));

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  logger.info(
    { contentProtection: true, clickThrough: true },
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
  if (lastChromeBounds) positionOverChrome(lastChromeBounds);
  if (!mainWindow.isVisible()) mainWindow.showInactive();
  mainWindow.setAlwaysOnTop(true, "screen-saver");
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

  tempDir = mkdtempSync(join(tmpdir(), "sotto-overlay-"));
  imagePath = join(tempDir, "chrome.png");

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
    imagePath,
    logger,
    mode: "overlay",
    onPending: () => {
      try {
        lastChromeBounds = getChromeWindowBounds(logger);
      } catch {
        /* will surface in captureAndAsk */
      }
      showOverlay();
      mainWindow?.webContents.send("status", { state: "pending" });
    },
    onAnswer: async ({ text, meta }) => {
      const html = await marked.parse(text);
      mainWindow?.webContents.send("answer", { html, text, meta });
    },
    onError: (err) => {
      const msg = err?.stderr?.toString?.().trim() || err?.message || String(err);
      showOverlay();
      mainWindow?.webContents.send("status", { state: "error", error: msg });
    },
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
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
});

app.on("window-all-closed", () => {
  // Keep alive — the overlay can be hidden but the daemon stays up for triggers.
});
