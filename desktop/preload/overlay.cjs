const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  onStatus: (cb) => ipcRenderer.on("status", (_e, data) => cb(data)),
  onAnswer: (cb) => ipcRenderer.on("answer", (_e, data) => cb(data)),
  onVoiceToggle: (cb) => ipcRenderer.on("voice:toggle", () => cb()),
  sendAudio: (arrayBuffer) => ipcRenderer.send("voice:audio", arrayBuffer),
  setIgnoreMouseEvents: (ignore, options) =>
    ipcRenderer.send("set-ignore-mouse-events", ignore, options),
});
