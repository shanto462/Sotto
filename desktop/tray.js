import { Menu, nativeImage, shell, Tray } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isExtensionAlive, lastSeenAgoMs } from "../src/extension-monitor.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS = join(__dirname, "..", "assets");
const EXTENSION_DIR = join(__dirname, "..", "extension");

let tray = null;
let state = "idle"; // "idle" | "busy" | "warn"
let cbs = {};
let refreshInterval = null;
let recentHistory = [];

export function createTray(callbacks) {
  cbs = callbacks || {};
  tray = new Tray(nativeImage.createFromPath(iconFor("idle")));
  tray.setToolTip("Sotto");
  rebuildMenu();

  // Refresh menu periodically so the extension-liveness label updates even
  // if state hasn't changed.
  refreshInterval = setInterval(() => {
    if (tray && state === "idle") rebuildMenu();
  }, 15_000);

  // On Windows, the menu doesn't auto-open on left-click — wire it.
  tray.on("click", () => tray?.popUpContextMenu?.());

  return tray;
}

export function setTrayState(next) {
  if (next === state) return;
  state = next;
  tray?.setImage(nativeImage.createFromPath(iconFor(state)));
  rebuildMenu();
}

export function setTrayHistory(items) {
  recentHistory = Array.isArray(items) ? items : [];
  rebuildMenu();
}

export function destroyTray() {
  if (refreshInterval) clearInterval(refreshInterval);
  refreshInterval = null;
  tray?.destroy();
  tray = null;
}

function iconFor(s) {
  if (s === "busy") return join(ASSETS, "icon-tray-busy.png");
  if (s === "warn") return join(ASSETS, "icon-tray-warn.png");
  return join(ASSETS, "icon-tray-Template.png");
}

function statusLabel() {
  if (state === "busy") return "◐  Sotto · Working…";
  if (state === "warn") return "⚠  Sotto · Needs attention";
  if (!isExtensionAlive()) return "⚠  Sotto · Extension not detected";
  return "●  Sotto · Ready";
}

function rebuildMenu() {
  if (!tray) return;
  const items = [
    { label: statusLabel(), enabled: false },
    { type: "separator" },
    {
      label: "Ask Claude",
      accelerator: "CommandOrControl+M",
      click: () => cbs.onAsk?.(),
    },
    {
      label: "Ask by voice…",
      accelerator: "CommandOrControl+Shift+V",
      click: () => cbs.onVoice?.(),
    },
    {
      label: "Show / hide overlay",
      accelerator: "CommandOrControl+B",
      click: () => cbs.onToggleOverlay?.(),
    },
    { type: "separator" },
    historyMenu(),
    { type: "separator" },
    {
      label: "Preferences…",
      accelerator: "CommandOrControl+,",
      click: () => cbs.onOpenSettings?.(),
    },
    {
      label: "Open Chrome extension folder",
      click: () => shell.openPath(EXTENSION_DIR),
    },
    { type: "separator" },
    {
      label: "About Sotto",
      click: () => cbs.onOpenAbout?.(),
    },
    {
      label: "Quit Sotto",
      accelerator: "CommandOrControl+Q",
      click: () => cbs.onQuit?.(),
    },
  ];
  tray.setContextMenu(Menu.buildFromTemplate(items));
  tray.setToolTip(statusLabel());
}

function historyMenu() {
  if (recentHistory.length === 0) {
    return { label: "History  (empty)", enabled: false };
  }
  const items = recentHistory.map((h) => ({
    label: `${formatTime(h.timestamp)}  ${truncate(h.question, 48)}`,
    click: () => cbs.onHistorySelect?.(h.id),
  }));
  items.push({ type: "separator" });
  items.push({
    label: "Clear history",
    click: () => cbs.onClearHistory?.(),
  });
  return {
    label: `History  (${recentHistory.length})`,
    submenu: items,
  };
}

function formatTime(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function truncate(s, n) {
  s = String(s || "").replace(/\s+/g, " ").trim();
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}
