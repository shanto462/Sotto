// Live model catalogue from OpenRouter, for the model pickers in setup and
// Preferences. The list is public, so no key is needed. Which models are
// offered is decided here; what each one supports (effort levels, output
// limit) always comes from OpenRouter.
import { OPENROUTER_BASE_URL } from "./config.js";

// Chat: the Claude 5.5 family only (Opus, Sonnet, Haiku).
const CHAT_MODEL = /^anthropic\/claude-[a-z]+-5\.5$/;
// Voice: released Gemini Flash / Flash Lite models. They take WAV directly,
// transcribe quickly, and cost little per audio token. Previews, routers
// and aliases are left out.
const VOICE_MODEL = /^google\/gemini-[\d.]+-flash(-lite)?$/;

function toEntry(m) {
  return {
    id: m.id,
    name: m.name ?? m.id,
    created: m.created ?? 0,
    contextLength: m.context_length ?? null,
    maxOutput: m.top_provider?.max_completion_tokens ?? null,
    supportedEfforts: Array.isArray(m.reasoning?.supported_efforts)
      ? m.reasoning.supported_efforts
      : [],
    defaultEffort: m.reasoning?.default_effort ?? null,
  };
}

/**
 * Split OpenRouter's catalogue into the two lists Sotto needs.
 * Exported for tests.
 *
 * @param {object[]} data  `data` array from GET /models.
 */
export function partitionModels(data) {
  const inputs = (m) => m.architecture?.input_modalities ?? [];
  const byNewest = (a, b) => b.created - a.created;
  const chat = data
    .filter((m) => CHAT_MODEL.test(m.id) && inputs(m).includes("image"))
    .map(toEntry)
    .sort(byNewest);
  const audio = data
    .filter((m) => VOICE_MODEL.test(m.id) && inputs(m).includes("audio"))
    .map(toEntry)
    .sort(byNewest);
  return { chat, audio };
}

/**
 * @returns {Promise<{ ok: true, chat: object[], audio: object[] } |
 *   { ok: false, error: string }>}
 */
export async function listModels() {
  try {
    const res = await fetch(`${OPENROUTER_BASE_URL}/models`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const { data } = await res.json();
    return { ok: true, ...partitionModels(data ?? []) };
  } catch (e) {
    return { ok: false, error: `Network: ${e?.message ?? e}` };
  }
}
