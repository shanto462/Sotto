const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (patch) => ipcRenderer.invoke("settings:save", patch),
  resetSettings: () => ipcRenderer.invoke("settings:reset"),
  getSecretInfo: () => ipcRenderer.invoke("secret:info"),
  testSecret: (service, value) =>
    ipcRenderer.invoke("secret:test", { service, value }),
  saveSecret: (service, value) =>
    ipcRenderer.invoke("secret:save", { service, value }),
  isExtensionConnected: () => ipcRenderer.invoke("extension:is-connected"),
  openExtensionFolder: () => ipcRenderer.send("extension:open-folder"),
  openExtensionPage: () => ipcRenderer.send("extension:open-page"),
  openExternal: (url) => ipcRenderer.send("open-external", url),
  getAppInfo: () => ipcRenderer.invoke("app:info"),
  reRunOnboarding: () => ipcRenderer.send("onboarding:re-run"),
  onTabOpen: (cb) =>
    ipcRenderer.on("settings:open-tab", (_e, tab) => cb(tab)),
});
