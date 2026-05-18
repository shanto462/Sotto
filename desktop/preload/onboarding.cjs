const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  testSecret: (service, value) =>
    ipcRenderer.invoke("secret:test", { service, value }),
  saveSecret: (service, value) =>
    ipcRenderer.invoke("secret:save", { service, value }),
  getSecretInfo: () => ipcRenderer.invoke("secret:info"),
  checkPermissions: () => ipcRenderer.invoke("permission:check"),
  requestPermission: (kind) =>
    ipcRenderer.invoke("permission:request", { kind }),
  openSystemSettings: (pane) =>
    ipcRenderer.send("permission:open-system-settings", pane),
  restartApp: () => ipcRenderer.send("app:restart"),
  getAppInfo: () => ipcRenderer.invoke("app:info"),
  getExtensionInfo: () => ipcRenderer.invoke("extension:info"),
  isExtensionConnected: () => ipcRenderer.invoke("extension:is-connected"),
  openExtensionFolder: () => ipcRenderer.send("extension:open-folder"),
  openExtensionPage: () => ipcRenderer.send("extension:open-page"),
  openExternal: (url) => ipcRenderer.send("open-external", url),
  openLicense: () => ipcRenderer.send("app:open-license"),
  copyToClipboard: (text) => ipcRenderer.send("clipboard:copy", text),
  finish: () => ipcRenderer.send("onboarding:finish"),
  getTheme: () => ipcRenderer.invoke("theme:get"),
  onThemeChange: (cb) =>
    ipcRenderer.on("theme:changed", (_e, theme) => cb(theme)),
});
