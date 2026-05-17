import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import { MAX_TOKENS, MODEL } from "./config.js";
import { SYSTEM_PROMPT } from "./prompt.js";

export async function askClaude(imagePath, log) {
  const start = performance.now();
  const client = new Anthropic();
  const data = readFileSync(imagePath).toString("base64");

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
    .filter((block) => block.type === "text")
    .map((block) => block.text)
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
