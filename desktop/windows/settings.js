import { BrowserWindow } from "electron";

let win = null;

export function openSettingsWindow({ preloadPath, indexPath, iconPath, initialTab }) {
  if (win && !win.isDestroyed()) {
    win.show();
    win.focus();
    if (initialTab) win.webContents.send("settings:open-tab", initialTab);
    return win;
  }
  win = new BrowserWindow({
    width: 800,
    height: 560,
    minWidth: 640,
    minHeight: 460,
    title: "Sotto Preferences",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    backgroundColor: "#15181f",
    resizable: true,
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
