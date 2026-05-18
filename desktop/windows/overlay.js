import { BrowserWindow, screen } from "electron";

const OVERLAY_WIDTH = 540;
const OVERLAY_MARGIN = 14;

export function createOverlayWindow({ preloadPath, indexPath, isMac }) {
  const { workArea } = screen.getPrimaryDisplay();
  const winHeight = Math.min(700, workArea.height - 60);

  const win = new BrowserWindow({
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
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // ★ Hide from screen capture (NSWindowSharingNone / WDA_EXCLUDEFROMCAPTURE).
  win.setContentProtection(true);
  win.setAlwaysOnTop(true, isMac ? "screen-saver" : undefined);
  if (isMac) win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(indexPath);
  return win;
}

export function positionOverChrome(win, bounds) {
  if (!win || !bounds) return;
  const display = screen.getDisplayMatching(bounds);
  const workArea = display.workArea;
  const winHeight = Math.min(bounds.height - 20, workArea.height - 40);
  const x = Math.max(
    workArea.x + 20,
    bounds.x + bounds.width - OVERLAY_WIDTH - OVERLAY_MARGIN,
  );
  const y = Math.max(workArea.y + 10, bounds.y + 20);
  win.setBounds({
    x: Math.round(x),
    y: Math.round(y),
    width: OVERLAY_WIDTH,
    height: Math.round(winHeight),
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
    win.setOpacity(t * (2 - t)); // ease-out quad
    if (t < 1) setTimeout(tick, 16);
  };
  tick();
}
