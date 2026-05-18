import { BrowserWindow } from "electron";

export function createOnboardingWindow({ preloadPath, indexPath, iconPath }) {
  const win = new BrowserWindow({
    width: 720,
    height: 620,
    minWidth: 600,
    minHeight: 520,
    title: "Welcome to Sotto",
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
  });
  return win;
}
