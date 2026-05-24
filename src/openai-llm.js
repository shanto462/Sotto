import OpenAI from "openai";
import { MAX_TOKENS, OPENAI_LLM_MODEL } from "./config.js";
import { SYSTEM_PROMPT, VOICE_SYSTEM_PROMPT } from "./prompt.js";

function friendlyOpenAIError(err) {
  const code = err?.error?.code ?? err?.code;
  if (code === "insufficient_quota") {
    return "OpenAI free credits exhausted. Add billing at platform.openai.com or switch to Claude.";
  }
  if (err?.status === 429) {
    return "OpenAI rate limit hit. Try again in a moment.";
  }
  return err?.message ?? String(err);
}

/**
 * Send a PNG buffer + system prompt to GPT-4o-mini (vision) and return answer + meta.
 * Interface is intentionally identical to askClaude in claude.js.
 */
export async function askOpenAI(pngBuffer, log, systemPrompt) {
  const start = performance.now();
  const client = new OpenAI();
  const b64 = pngBuffer.toString("base64");

  let response;
  try {
    response = await client.chat.completions.create({
      model: OPENAI_LLM_MODEL,
      max_tokens: MAX_TOKENS,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: `data:image/png;base64,${b64}`, detail: "high" },
            },
            { type: "text", text: systemPrompt || SYSTEM_PROMPT },
          ],
        },
      ],
    });
  } catch (err) {
    const msg = friendlyOpenAIError(err);
    const wrapped = new Error(msg);
    wrapped.status = err?.status;
    wrapped.code = err?.error?.code ?? err?.code;
    throw wrapped;
  }

  const text = response.choices[0]?.message?.content ?? "";
  const meta = {
    model: OPENAI_LLM_MODEL,
    provider: "openai",
    stopReason: response.choices[0]?.finish_reason,
    inputTokens: response.usage?.prompt_tokens,
    outputTokens: response.usage?.completion_tokens,
    durationMs: Math.round(performance.now() - start),
  };
  log?.info(meta, "openai responded");
  return { text, meta };
}

/**
 * Send a text-only question to GPT-4o and return answer + meta.
 * Interface is intentionally identical to askClaudeText in claude.js.
 */
export async function askOpenAIText(question, log) {
  const start = performance.now();
  const client = new OpenAI();

  let response;
  try {
    response = await client.chat.completions.create({
      model: OPENAI_LLM_MODEL,
      max_tokens: MAX_TOKENS,
      messages: [
        { role: "system", content: VOICE_SYSTEM_PROMPT },
        { role: "user", content: question },
      ],
    });
  } catch (err) {
    const msg = friendlyOpenAIError(err);
    const wrapped = new Error(msg);
    wrapped.status = err?.status;
    wrapped.code = err?.error?.code ?? err?.code;
    throw wrapped;
  }

  const text = response.choices[0]?.message?.content ?? "";
  const meta = {
    model: OPENAI_LLM_MODEL,
    provider: "openai",
    stopReason: response.choices[0]?.finish_reason,
    inputTokens: response.usage?.prompt_tokens,
    outputTokens: response.usage?.completion_tokens,
    durationMs: Math.round(performance.now() - start),
    source: "voice",
  };
  log?.info(meta, "openai responded (voice)");
  return { text, meta };
}
