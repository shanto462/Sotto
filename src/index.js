export { captureChromeWindowByTitle } from "./capture.js";
export { askClaude } from "./claude.js";
export { DEFAULT_PORT, MAX_TOKENS, MODEL } from "./config.js";
export {
  isExtensionAlive,
  lastSeenAgoMs,
  recordHeartbeat,
} from "./extension-monitor.js";
export { logger } from "./logger.js";
export { queryActiveChromeWindow } from "./os.js";
export { SYSTEM_PROMPT } from "./prompt.js";
export {
  getSecret,
  hasSecret,
  hydrateProcessEnv,
  setSecret,
} from "./secrets.js";
export {
  loadSettings,
  resetSettings,
  saveSettings,
} from "./settings.js";
