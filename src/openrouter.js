// Minimal OpenRouter Chat Completions client (https://openrouter.ai/docs).
// Every model call in Sotto (Claude answers and voice transcription) goes
// through here, authenticated with OPENROUTER_API_KEY.
import { OPENROUTER_BASE_URL } from "./config.js";

const TIMEOUT_MS = 15 * 60 * 1000;

/**
 * POST /chat/completions and return the parsed response.
 * Throws with OpenRouter's error message on HTTP errors, and on errors that
 * OpenRouter reports inside an HTTP 200 body.
 *
 * @param {object} body  Chat Completions request body.
 * @returns {Promise<object>}
 */
export async function chatCompletion(body) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is not set.");

  const res = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "X-Title": "Sotto",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON body; handled below */
  }

  if (!res.ok || json?.error) {
    const msg = json?.error?.message || `HTTP ${res.status}`;
    const err = new Error(`OpenRouter: ${msg}`);
    err.status = json?.error?.code ?? res.status;
    throw err;
  }
  if (!json) throw new Error(`OpenRouter: unreadable response (HTTP ${res.status})`);
  return json;
}
