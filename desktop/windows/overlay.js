import { BrowserWindow, screen } from "electron";

const DEFAULT_WIDTH = 540;
const DEFAULT_HEIGHT = 600;
const MIN_WIDTH = 320;
const MIN_HEIGHT = 200;
const MARGIN = 14;

/**
 * Create the overlay window.
 *
 * @param {object} opts
 * @param {string} opts.preloadPath
 * @param {string} opts.indexPath
 * @param {boolean} opts.isMac
 * @param {{x: number|null, y: number|null, width: number, height: number}} [opts.savedBounds]
 *   If present and finite x/y are inside a visible display, the window opens
 *   at those bounds. Otherwise it falls back to the top-right of the primary
 *   display at default size.
 */
export function createOverlayWindow({
  preloadPath,
  indexPath,
  isMac,
  savedBounds,
}) {
  const { workArea } = screen.getPrimaryDisplay();
  const width = Math.max(MIN_WIDTH, savedBounds?.width || DEFAULT_WIDTH);
  const height = Math.max(MIN_HEIGHT, savedBounds?.height || Math.min(DEFAULT_HEIGHT, workArea.height - 60));

  const fallbackX = workArea.x + workArea.width - width - MARGIN;
  const fallbackY = workArea.y + MARGIN;
  const x = pickCoord(savedBounds?.x, fallbackX);
  const y = pickCoord(savedBounds?.y, fallbackY);

  const win = new BrowserWindow({
    width,
    height,
    x,
    y,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    frame: false,
    transparent: true,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    focusable: false,
    movable: true,
    show: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Hide from screen capture (NSWindowSharingNone / WDA_EXCLUDEFROMCAPTURE).
  win.setContentProtection(true);
  win.setAlwaysOnTop(true, isMac ? "screen-saver" : undefined);
  if (isMac) win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(indexPath);
  return win;
}

function pickCoord(saved, fallback) {
  if (saved == null || !Number.isFinite(saved)) return fallback;
  // Honour saved coord only if it falls inside an existing display's workArea
  // (handles disconnected monitors gracefully).
  const inAnyDisplay = screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    return saved >= a.x - 50 && saved <= a.x + a.width + 50;
  });
  return inAnyDisplay ? saved : fallback;
}

/**
 * Re-position the overlay over the right edge of the active Chrome window.
 * Uses the user's saved width (if any) instead of forcing the default.
 */
export function positionOverChrome(win, bounds, savedBounds) {
  if (!win || !bounds) return;
  const display = screen.getDisplayMatching(bounds);
  const workArea = display.workArea;
  const width = Math.max(MIN_WIDTH, savedBounds?.width || DEFAULT_WIDTH);
  const height = Math.max(
    MIN_HEIGHT,
    savedBounds?.height || Math.min(bounds.height - 20, workArea.height - 40),
  );
  const x = Math.max(
    workArea.x + 20,
    bounds.x + bounds.width - width - MARGIN,
  );
  const y = Math.max(workArea.y + 10, bounds.y + 20);
  win.setBounds({
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
  });
}

export function showOverlay(win, isMac) {
  if (!win) return;
  if (!win.isVisible()) {
    win.setOpacity(0);
    win.showInactive();
    fadeIn(win);
  }
  win.setAlwaysOnTop(true, isMac ? "screen-saver" : undefined);
}

function fadeIn(win, durationMs = 160) {
  const start = Date.now();
  const tick = () => {
    if (!win || win.isDestroyed()) return;
    const t = Math.min(1, (Date.now() - start) / durationMs);
    win.setOpacity(t * (2 - t));
    if (t < 1) setTimeout(tick, 16);
  };
  tick();
}
