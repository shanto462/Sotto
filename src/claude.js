// Claude via OpenRouter's Chat Completions API.
import { chatCompletion } from "./openrouter.js";
import { SYSTEM_PROMPT, VOICE_SYSTEM_PROMPT } from "./prompt.js";

export { SYSTEM_PROMPT, VOICE_SYSTEM_PROMPT };

/**
 * Send one chat completion to Claude and return the answer text + usage meta.
 * Throws on errors and refusals.
 *
 * @param {object[]} messages
 * @param {{ model: string|null, effort?: string|null, maxTokens?: number|null }} ai
 *   Resolved AI config (src/config.js resolveAiConfig). Unset effort or max
 *   tokens are left out so the model's own defaults apply.
 */
async function send(messages, ai, log, extraMeta = {}) {
  if (!ai?.model) {
    throw new Error("No model chosen. Open Preferences → API & Models.");
  }
  const start = performance.now();

  const body = { model: ai.model, messages };
  if (ai.maxTokens) body.max_tokens = ai.maxTokens;
  // The model still reasons; exclude just leaves the reasoning text out of
  // the response, since the overlay only shows the answer.
  body.reasoning = ai.effort
    ? { effort: ai.effort, exclude: true }
    : { exclude: true };

  const response = await chatCompletion(body);

  const choice = response.choices?.[0];
  const meta = {
    model: response.model ?? ai.model,
    effort: ai.effort ?? undefined,
    stopReason: choice?.finish_reason,
    inputTokens: response.usage?.prompt_tokens,
    outputTokens: response.usage?.completion_tokens,
    durationMs: Math.round(performance.now() - start),
    ...extraMeta,
  };

  if (choice?.finish_reason === "content_filter" || choice?.message?.refusal) {
    log?.warn(meta, "claude declined");
    throw new Error("Claude declined this request.");
  }
  if (choice?.finish_reason === "error") {
    throw new Error("OpenRouter: the model stopped with an error.");
  }

  log?.info(meta, "claude responded");
  return { text: choice?.message?.content ?? "", meta };
}

/**
 * Send a PNG buffer + system prompt to Claude and return the answer text + usage meta.
 *
 * @param {Buffer} pngBuffer  Raw PNG bytes of the captured window.
 * @param {object} ai  Resolved AI config.
 * @param {import("pino").Logger} [log]
 * @param {string} [systemPrompt]
 * @returns {Promise<{text: string, meta: object}>}
 */
export async function askClaude(pngBuffer, ai, log, systemPrompt) {
  const data = pngBuffer.toString("base64");
  return send(
    [
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: `data:image/png;base64,${data}` },
          },
          { type: "text", text: systemPrompt || SYSTEM_PROMPT },
        ],
      },
    ],
    ai,
    log,
  );
}

/**
 * Send a text-only question to Claude using the voice/quick-answer system prompt.
 *
 * @param {string} question  Transcribed spoken question.
 * @param {object} ai  Resolved AI config.
 * @param {import("pino").Logger} [log]
 * @returns {Promise<{ text: string, meta: object }>}
 */
export async function askClaudeText(question, ai, log) {
  return send(
    [
      { role: "system", content: VOICE_SYSTEM_PROMPT },
      { role: "user", content: question },
    ],
    ai,
    log,
    { source: "voice" },
  );
}
