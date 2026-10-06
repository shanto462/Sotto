import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getPromptById, PROMPT_PRESETS } from "../src/prompt.js";

describe("prompt presets", () => {
  it("have unique ids and hotkeys", () => {
    const ids = PROMPT_PRESETS.map((p) => p.id);
    const keys = PROMPT_PRESETS.map((p) => p.hotkey);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(new Set(keys).size, keys.length);
  });

  it("all have a name and a non-empty body", () => {
    for (const p of PROMPT_PRESETS) {
      assert.ok(p.name, p.id);
      assert.ok(p.body.trim().length > 20, p.id);
    }
  });

  it("falls back to the first preset for unknown ids", () => {
    assert.equal(getPromptById("tldr").id, "tldr");
    assert.equal(getPromptById("does-not-exist").id, PROMPT_PRESETS[0].id);
  });
});
