import { captureRegion, getChromeWindowBounds } from "./capture.js";
import { askClaude } from "./claude.js";
import { MODEL } from "./config.js";

export { askClaude } from "./claude.js";
export { captureRegion, getChromeWindowBounds } from "./capture.js";
export { MAX_TOKENS, MODEL, DEFAULT_PORT } from "./config.js";
export { logger } from "./logger.js";
export { SYSTEM_PROMPT } from "./prompt.js";

export async function captureAndAsk(imagePath, log) {
  const bounds = getChromeWindowBounds(log);
  log?.info(
    { width: bounds.width, height: bounds.height },
    "capturing Chrome window",
  );
  captureRegion(bounds, imagePath, log);

  log?.info({ model: MODEL }, "asking Claude");
  return await askClaude(imagePath, log);
}
