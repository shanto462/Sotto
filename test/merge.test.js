import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deepMerge } from "../src/merge.js";

describe("deepMerge", () => {
  it("merges nested objects", () => {
    const out = deepMerge({ a: 1, voice: { enabled: true, max: 30 } }, { voice: { max: 10 } });
    assert.deepEqual(out, { a: 1, voice: { enabled: true, max: 10 } });
  });

  it("replaces arrays and primitives instead of merging them", () => {
    assert.deepEqual(deepMerge({ list: [1, 2], n: 1 }, { list: [3], n: null }), { list: [3], n: null });
  });

  it("ignores prototype-polluting keys", () => {
    const patch = JSON.parse('{"__proto__": {"polluted": true}, "constructor": {"prototype": {"polluted": true}}, "nested": {"__proto__": {"polluted": true}}}');
    deepMerge({}, patch);
    assert.equal({}.polluted, undefined);
    assert.equal(Object.prototype.polluted, undefined);
  });

  it("ignores non-object sources", () => {
    const target = { a: 1 };
    assert.equal(deepMerge(target, null), target);
    assert.equal(deepMerge(target, "x"), target);
    assert.deepEqual(target, { a: 1 });
  });
});
