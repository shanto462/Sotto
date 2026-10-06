import assert from "node:assert/strict";
import { request } from "node:http";
import { after, before, describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { ALLOWED_EXTENSION_IDS, checkRequestOrigin, createSolverServer } from "../src/server.js";

const EXT_ORIGIN = "chrome-extension://afifinjoafbkafddmedlcjelgnfnoobg";
const OTHER_EXT_ORIGIN = "chrome-extension://abcdefghijklmnopabcdefghijklmnop";

const silentLogger = {
  info() {},
  warn() {},
  error() {},
  child() {
    return silentLogger;
  },
};

function send(port, { method = "GET", path = "/", headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = request(
      { host: "127.0.0.1", port, method, path, headers: { host: `127.0.0.1:${port}`, ...headers } },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () =>
          resolve({ status: res.statusCode, headers: res.headers, body: body ? JSON.parse(body) : null }),
        );
      },
    );
    req.on("error", reject);
    req.end();
  });
}

describe("checkRequestOrigin", () => {
  it("allows requests with no Origin (curl, local tools)", () => {
    assert.deepEqual(checkRequestOrigin({ host: "127.0.0.1:8765" }), { ok: true, origin: null });
  });

  it("allows the Chrome extension origin", () => {
    assert.equal(checkRequestOrigin({ host: "localhost:8765", origin: EXT_ORIGIN }).ok, true);
  });

  it("rejects web page origins", () => {
    for (const origin of ["https://example.com", "http://127.0.0.1:3000", "null", "file://"]) {
      assert.equal(checkRequestOrigin({ host: "127.0.0.1:8765", origin }).ok, false, origin);
    }
  });

  it("rejects other extensions", () => {
    const r = checkRequestOrigin({ host: "127.0.0.1:8765", origin: OTHER_EXT_ORIGIN });
    assert.deepEqual(r, { ok: false, reason: "unknown extension" });
  });

  it("rejects page subresource requests (script/img tags) that carry no Origin", () => {
    const r = checkRequestOrigin({ host: "127.0.0.1:8765", "sec-fetch-mode": "no-cors" });
    assert.equal(r.ok, false);
  });

  it("allows the pinned ID from extension/manifest.json", () => {
    // Chrome derives an extension ID from the manifest key: SHA-256 of the
    // public key, first 32 hex digits, mapped 0-f → a-p.
    const { key } = JSON.parse(readFileSync(new URL("../extension/manifest.json", import.meta.url), "utf8"));
    const hex = createHash("sha256").update(Buffer.from(key, "base64")).digest("hex").slice(0, 32);
    const id = [...hex].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join("");
    assert.ok(ALLOWED_EXTENSION_IDS.has(id), `manifest key gives ${id}`);
    assert.equal(EXT_ORIGIN, `chrome-extension://${id}`);
  });

  it("rejects look-alike extension origins", () => {
    for (const origin of ["chrome-extension://short", "chrome-extension://ABCDEFGHIJKLMNOPABCDEFGHIJKLMNOP", `${EXT_ORIGIN}.example.com`]) {
      assert.equal(checkRequestOrigin({ host: "127.0.0.1:8765", origin }).ok, false, origin);
    }
  });

  it("rejects non-loopback Host headers (DNS rebinding)", () => {
    assert.equal(checkRequestOrigin({ host: "attacker.example:8765" }).ok, false);
    assert.equal(checkRequestOrigin({}).ok, false);
  });
});

describe("solver server", () => {
  let server;
  let port;
  let calls = 0;
  let onAskImpl = async () => ({ ok: true, durationMs: 1, answerChars: 3 });

  before(async () => {
    server = createSolverServer({
      logger: silentLogger,
      mode: "test",
      onAsk: (log) => {
        calls++;
        return onAskImpl(log);
      },
    });
    port = await server.listen(0);
  });

  after(() => server.close());

  it("serves /health without CORS headers for local tools", async () => {
    const r = await send(port, { path: "/health" });
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
    assert.equal(r.body.mode, "test");
    assert.equal(r.headers["access-control-allow-origin"], undefined);
  });

  it("runs /ask for the extension and reflects only its origin", async () => {
    const before = calls;
    const r = await send(port, { method: "POST", path: "/ask", headers: { origin: EXT_ORIGIN } });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { ok: true, durationMs: 1, answerChars: 3 });
    assert.equal(r.headers["access-control-allow-origin"], EXT_ORIGIN);
    assert.equal(calls, before + 1);
  });

  it("refuses /ask from a web page and never calls onAsk", async () => {
    const before = calls;
    const r = await send(port, { method: "POST", path: "/ask", headers: { origin: "https://evil.example" } });
    assert.equal(r.status, 403);
    assert.equal(r.headers["access-control-allow-origin"], undefined);
    assert.equal(calls, before);
  });

  it("tells an old copy of the extension to reload", async () => {
    const r = await send(port, { method: "POST", path: "/ask", headers: { origin: OTHER_EXT_ORIGIN } });
    assert.equal(r.status, 403);
    assert.match(r.body.error, /Reload the Sotto extension/);
  });

  it("refuses CORS preflight from a web page", async () => {
    const r = await send(port, { method: "OPTIONS", path: "/ask", headers: { origin: "https://evil.example" } });
    assert.equal(r.status, 403);
  });

  it("refuses a rebound Host header", async () => {
    const r = await send(port, { path: "/health", headers: { host: `attacker.example:${port}` } });
    assert.equal(r.status, 403);
  });

  it("returns 429 while a request is in flight", async () => {
    let release;
    onAskImpl = () => new Promise((resolve) => (release = () => resolve({ ok: true })));
    const first = send(port, { method: "POST", path: "/ask" });
    while (!release) await new Promise((r) => setTimeout(r, 5));
    const second = await send(port, { method: "POST", path: "/ask" });
    assert.equal(second.status, 429);
    release();
    assert.equal((await first).status, 200);
    onAskImpl = async () => ({ ok: true });
  });

  it("returns 500 with the error message when onAsk throws", async () => {
    onAskImpl = async () => {
      throw new Error("capture failed");
    };
    const r = await send(port, { method: "POST", path: "/ask" });
    assert.equal(r.status, 500);
    assert.deepEqual(r.body, { ok: false, error: "capture failed" });
    onAskImpl = async () => ({ ok: true });
  });

  it("returns 404 for unknown routes", async () => {
    const r = await send(port, { path: "/nope" });
    assert.equal(r.status, 404);
  });
});
