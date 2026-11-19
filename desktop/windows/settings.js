import { BrowserWindow } from "electron";

const isMac = process.platform === "darwin";
let win = null;

// Preferences window in the style of macOS System Settings: translucent
// sidebar (window vibrancy) with the traffic lights inset above it.
export function openSettingsWindow({ preloadPath, indexPath, iconPath, initialTab }) {
  if (win && !win.isDestroyed()) {
    win.show();
    win.focus();
    if (initialTab) win.webContents.send("settings:open-tab", initialTab);
    return win;
  }
  win = new BrowserWindow({
    width: 800,
    height: 580,
    minWidth: 680,
    minHeight: 460,
    fullscreenable: false,
    title: "Sotto Settings",
    titleBarStyle: isMac ? "hiddenInset" : "default",
    trafficLightPosition: isMac ? { x: 18, y: 18 } : undefined,
    vibrancy: isMac ? "sidebar" : undefined,
    visualEffectState: isMac ? "followWindow" : undefined,
    backgroundColor: isMac ? "#00000000" : "#1e1e1e",
    show: false,
    icon: iconPath,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadFile(indexPath);
  win.once("ready-to-show", () => {
    win.show();
    win.focus();
    if (initialTab) win.webContents.send("settings:open-tab", initialTab);
  });
  win.on("closed", () => {
    win = null;
  });
  return win;
}

export function getSettingsWindow() {
  return win && !win.isDestroyed() ? win : null;
}
