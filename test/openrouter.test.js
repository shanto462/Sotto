import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { askClaudeText } from "../src/claude.js";
import { resolveAiConfig } from "../src/config.js";
import { partitionModels } from "../src/models.js";
import { chatCompletion } from "../src/openrouter.js";

const realFetch = globalThis.fetch;
let lastRequest = null;

function mockFetch(status, body) {
  globalThis.fetch = async (url, init) => {
    lastRequest = { url, init, body: JSON.parse(init.body) };
    return new Response(JSON.stringify(body), { status });
  };
}

describe("openrouter client", () => {
  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "sk-or-test";
    lastRequest = null;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("sends the key as a bearer token to chat/completions", async () => {
    mockFetch(200, { choices: [{ message: { content: "hi" } }] });
    await chatCompletion({ model: "m", messages: [] });
    assert.equal(lastRequest.url, "https://openrouter.ai/api/v1/chat/completions");
    assert.equal(lastRequest.init.headers.Authorization, "Bearer sk-or-test");
  });

  it("throws OpenRouter's message on an HTTP error", async () => {
    mockFetch(401, { error: { code: 401, message: "No auth credentials found" } });
    await assert.rejects(chatCompletion({ model: "m", messages: [] }), {
      message: "OpenRouter: No auth credentials found",
      status: 401,
    });
  });

  it("throws on an error inside an HTTP 200 body", async () => {
    mockFetch(200, { error: { code: 502, message: "Provider returned error" } });
    await assert.rejects(chatCompletion({ model: "m", messages: [] }), {
      message: "OpenRouter: Provider returned error",
    });
  });

  it("refuses to send without a key", async () => {
    delete process.env.OPENROUTER_API_KEY;
    await assert.rejects(chatCompletion({ model: "m", messages: [] }), /OPENROUTER_API_KEY/);
  });
});

describe("askClaudeText", () => {
  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "sk-or-test";
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("sends effort and max tokens, and returns the answer", async () => {
    mockFetch(200, {
      model: "anthropic/claude-opus-5.5",
      choices: [{ finish_reason: "stop", message: { content: "Canberra" } }],
      usage: { prompt_tokens: 10, completion_tokens: 2 },
    });
    const ai = { model: "anthropic/x", effort: "high", maxTokens: 1000 };
    const { text, meta } = await askClaudeText("capital of Australia?", ai);
    assert.equal(text, "Canberra");
    assert.equal(meta.inputTokens, 10);
    assert.equal(lastRequest.body.model, "anthropic/x");
    assert.deepEqual(lastRequest.body.reasoning, { effort: "high", exclude: true });
    assert.equal(lastRequest.body.max_tokens, 1000);
  });

  it("leaves unset effort and max tokens to the model's defaults", async () => {
    mockFetch(200, { choices: [{ finish_reason: "stop", message: { content: "ok" } }] });
    await askClaudeText("hi", { model: "anthropic/x" });
    assert.deepEqual(lastRequest.body.reasoning, { exclude: true });
    assert.equal("max_tokens" in lastRequest.body, false);
  });

  it("asks the user to choose a model when none is set", async () => {
    mockFetch(200, {});
    await assert.rejects(askClaudeText("hi", { model: null }), /No model chosen/);
  });

  it("throws when the model declines", async () => {
    mockFetch(200, {
      choices: [{ finish_reason: "content_filter", message: { content: "" } }],
    });
    await assert.rejects(askClaudeText("...", { model: "anthropic/x" }), /declined/);
  });
});

describe("resolveAiConfig", () => {
  const saved = {
    ai: { model: "anthropic/a", effort: "low", maxTokens: 500, transcriptionModel: "g/t" },
  };
  const vars = ["OPENROUTER_MODEL", "SOTTO_EFFORT", "MAX_TOKENS", "TRANSCRIPTION_MODEL"];
  let before;
  beforeEach(() => {
    before = Object.fromEntries(vars.map((v) => [v, process.env[v]]));
    for (const v of vars) delete process.env[v];
  });
  afterEach(() => {
    for (const v of vars) {
      if (before[v] === undefined) delete process.env[v];
      else process.env[v] = before[v];
    }
  });

  it("uses the saved settings when .env sets nothing", () => {
    const c = resolveAiConfig(saved);
    assert.equal(c.model, "anthropic/a");
    assert.equal(c.maxTokens, 500);
    assert.equal(c.overriddenByEnv.model, false);
  });

  it("lets .env override each value", () => {
    process.env.OPENROUTER_MODEL = "anthropic/env";
    process.env.MAX_TOKENS = "2000";
    const c = resolveAiConfig(saved);
    assert.equal(c.model, "anthropic/env");
    assert.equal(c.maxTokens, 2000);
    assert.equal(c.effort, "low");
    assert.equal(c.overriddenByEnv.model, true);
    assert.equal(c.overriddenByEnv.effort, false);
  });

  it("returns nulls when nothing is configured", () => {
    const c = resolveAiConfig({});
    assert.deepEqual(
      [c.model, c.effort, c.maxTokens, c.transcriptionModel],
      [null, null, null, null],
    );
  });
});

describe("partitionModels", () => {
  const m = (id, inputs, created, extra = {}) => ({
    id,
    created,
    architecture: { input_modalities: inputs, output_modalities: ["text"] },
    ...extra,
  });

  it("offers Claude 5.5 models for chat and Gemini Flash for voice, newest first", () => {
    const { chat, audio } = partitionModels([
      m("anthropic/claude-haiku-5.5", ["text", "image"], 1),
      m("anthropic/claude-sonnet-5.5", ["text", "image"], 2, {
        top_provider: { max_completion_tokens: 128000 },
        reasoning: { supported_efforts: ["low", "high"], default_effort: "high" },
      }),
      m("anthropic/claude-sonnet-5.5:batch", ["text", "image"], 3),
      m("anthropic/claude-opus-5", ["text", "image"], 4),
      m("anthropic/claude-fable-5.2", ["text", "image"], 5),
      m("google/gemini-3.5-flash-lite", ["text", "audio"], 5),
      m("google/gemini-3.8-flash", ["text", "audio"], 6),
      m("google/gemini-3.1-flash-lite-preview", ["text", "audio"], 7),
      m("google/gemini-3.1-pro-preview", ["text", "audio"], 8),
      m("openai/gpt-audio", ["text", "audio"], 9),
      m("~google/gemini-flash-latest", ["text", "audio"], 10),
    ]);
    assert.deepEqual(chat.map((x) => x.id), [
      "anthropic/claude-sonnet-5.5",
      "anthropic/claude-haiku-5.5",
    ]);
    assert.equal(chat[0].maxOutput, 128000);
    assert.deepEqual(chat[0].supportedEfforts, ["low", "high"]);
    assert.equal(chat[0].defaultEffort, "high");
    assert.deepEqual(audio.map((x) => x.id), [
      "google/gemini-3.8-flash",
      "google/gemini-3.5-flash-lite",
    ]);
  });
});
