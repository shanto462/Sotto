// Persistent user settings stored as JSON in userData.
// Secrets (API keys) live separately in src/secrets.js via the OS keychain.

import { app } from "electron";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deepMerge } from "./merge.js";

const DEFAULTS = {
  theme: "dark", // "dark" | "light" | "auto"
  opacity: 92, // 40 – 100
  fontSize: 14, // 11 – 18 px
  autoLaunch: false,
  showNotifications: true,
  positionOverChrome: true, // macOS only
  persistHistory: false,
  voice: {
    enabled: true,
    silenceThresholdRms: 0.02,
    maxRecordingSec: 30,
    whisperModel: "whisper-1",
  },
  shortcuts: {
    ask: "Control+M",
    voice: "Control+Shift+V",
    toggle: "Control+B",
    history: "Control+H",
    clear: "Control+L",
  },
  activePromptId: "recap",
  overlay: {
    // null means "use default placement (top-right of primary display, or over
    // Chrome if positionOverChrome is true)". After the user drags/resizes,
    // these are populated and restored on launch.
    x: null,
    y: null,
    width: 540,
    height: 600,
  },
  onboardingComplete: false,
};

let cache = null;

function path() {
  return join(app.getPath("userData"), "settings.json");
}

export function loadSettings() {
  if (cache) return cache;
  const p = path();
  if (!existsSync(p)) {
    cache = structuredClone(DEFAULTS);
    return cache;
  }
  try {
    const raw = JSON.parse(readFileSync(p, "utf8"));
    cache = deepMerge(structuredClone(DEFAULTS), raw);
  } catch {
    cache = structuredClone(DEFAULTS);
  }
  return cache;
}

export function saveSettings(patch) {
  const current = loadSettings();
  cache = deepMerge(current, patch || {});
  writeFileSync(path(), JSON.stringify(cache, null, 2));
  return cache;
}

export function resetSettings() {
  cache = structuredClone(DEFAULTS);
  writeFileSync(path(), JSON.stringify(cache, null, 2));
  return cache;
}
