import { BrowserWindow } from "electron";

const isMac = process.platform === "darwin";

// Setup assistant window: fixed size like Installer.app, with the traffic
// lights inset over a translucent sidebar on macOS.
export function createOnboardingWindow({ preloadPath, indexPath, iconPath }) {
  const win = new BrowserWindow({
    width: 780,
    height: 560,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    title: "Set Up Sotto",
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
  });
  return win;
}
