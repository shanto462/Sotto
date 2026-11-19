// Runtime configuration. Nothing model-specific is hard-coded: the model,
// effort, output limit and transcription model come from .env when set, and
// otherwise from what the user chose in setup or Preferences (settings.json,
// `ai` section). A value the user never set stays null; the request then
// leaves that field out (effort, max tokens) or asks the user to choose one
// (model).

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
export const DEFAULT_PORT = Number(process.env.PORT ?? 8765);

// .env variable for each `ai` setting. SOTTO_EFFORT rather than CLAUDE_EFFORT
// so it can't pick up another tool's variable.
const ENV_VARS = {
  model: "OPENROUTER_MODEL",
  effort: "SOTTO_EFFORT",
  maxTokens: "MAX_TOKENS",
  transcriptionModel: "TRANSCRIPTION_MODEL",
};

function envValue(key) {
  const raw = process.env[ENV_VARS[key]]?.trim();
  if (!raw) return null;
  if (key !== "maxTokens") return raw;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Resolve the AI configuration: .env first, then the saved settings.
 *
 * @param {{ ai?: object }} [settings]  Loaded settings (see src/settings.js).
 * @returns {{ model: string|null, effort: string|null, maxTokens: number|null,
 *   transcriptionModel: string|null,
 *   overriddenByEnv: Record<string, boolean> }}
 */
export function resolveAiConfig(settings = {}) {
  const saved = settings.ai ?? {};
  const out = { overriddenByEnv: {} };
  for (const key of Object.keys(ENV_VARS)) {
    const fromEnv = envValue(key);
    out.overriddenByEnv[key] = fromEnv != null;
    out[key] = fromEnv ?? saved[key] ?? null;
  }
  return out;
}
