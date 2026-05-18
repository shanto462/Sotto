const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  onStatus: (cb) => ipcRenderer.on("status", (_e, data) => cb(data)),
  onAnswer: (cb) => ipcRenderer.on("answer", (_e, data) => cb(data)),
  onVoiceToggle: (cb) => ipcRenderer.on("voice:toggle", () => cb()),
  onHistoryUpdate: (cb) =>
    ipcRenderer.on("history:update", (_e, list) => cb(list)),
  onHistoryToggle: (cb) => ipcRenderer.on("history:toggle", () => cb()),
  onContentClear: (cb) => ipcRenderer.on("content:clear", () => cb()),
  sendAudio: (arrayBuffer) => ipcRenderer.send("voice:audio", arrayBuffer),
  selectHistory: (id) => ipcRenderer.send("history:select", id),
  clearHistory: () => ipcRenderer.send("history:clear"),
  getHistoryList: () => ipcRenderer.invoke("history:list"),
  setIgnoreMouseEvents: (ignore, options) =>
    ipcRenderer.send("set-ignore-mouse-events", ignore, options),
});
