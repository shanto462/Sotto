import Anthropic from "@anthropic-ai/sdk";
import { MAX_TOKENS, MODEL } from "./config.js";
import { SYSTEM_PROMPT } from "./prompt.js";

/**
 * Send a PNG buffer + system prompt to Claude and return the answer text + usage meta.
 *
 * @param {Buffer} pngBuffer  Raw PNG bytes of the captured window.
 * @param {import("pino").Logger} [log]
 * @returns {Promise<{text: string, meta: object}>}
 */
export async function askClaude(pngBuffer, log) {
  const start = performance.now();
  const client = new Anthropic();
  const data = pngBuffer.toString("base64");

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: "image/png", data },
          },
          { type: "text", text: SYSTEM_PROMPT },
        ],
      },
    ],
  });

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  const meta = {
    model: MODEL,
    stopReason: response.stop_reason,
    inputTokens: response.usage?.input_tokens,
    outputTokens: response.usage?.output_tokens,
    durationMs: Math.round(performance.now() - start),
  };
  log?.info(meta, "claude responded");

  return { text, meta };
}
