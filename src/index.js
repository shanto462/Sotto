export { captureChromeWindowByTitle } from "./capture.js";
export { askClaude, askClaudeText } from "./claude.js";
export { DEFAULT_PORT, MAX_TOKENS, MODEL } from "./config.js";
export {
  isExtensionAlive,
  lastSeenAgoMs,
  recordHeartbeat,
} from "./extension-monitor.js";
export { logger } from "./logger.js";
export { queryActiveChromeWindow } from "./os.js";
export { SYSTEM_PROMPT, VOICE_SYSTEM_PROMPT } from "./prompt.js";
export { transcribeAudio } from "./voice.js";
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
