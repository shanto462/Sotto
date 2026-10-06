import { createServer } from "node:http";
import { MODEL } from "./config.js";
import { recordHeartbeat } from "./extension-monitor.js";

// Only loopback hostnames are valid in the Host header. Anything else means the
// request reached us through a DNS-rebinding trick or a proxy.
const ALLOWED_HOSTNAMES = new Set(["127.0.0.1", "localhost", "[::1]"]);

// The Sotto extension's ID is fixed by the "key" in extension/manifest.json,
// so it is the same on every machine and install folder. If you publish a
// build to the Chrome Web Store, add the store-assigned ID here too.
export const ALLOWED_EXTENSION_IDS = new Set(["afifinjoafbkafddmedlcjelgnfnoobg"]);

/**
 * Decide whether a request may talk to the daemon.
 *
 * Browsers attach an Origin header to every cross-origin fetch and form POST,
 * and page scripts cannot forge it. So:
 *   - Origin chrome-extension://<Sotto's ID>  → the Sotto extension (allowed)
 *   - Origin chrome-extension://<other ID>    → another extension (rejected)
 *   - no Origin, no browser fetch metadata    → a local tool such as curl
 *                                               (allowed; a local process
 *                                               already runs as the user)
 *   - no Origin, Sec-Fetch-Mode: no-cors      → a page's <script>/<img> tag
 *                                               (rejected, so a page cannot
 *                                               even detect that Sotto runs)
 *   - any other Origin                        → a web page (rejected)
 *
 * @param {import("node:http").IncomingHttpHeaders} headers
 * @returns {{ ok: true, origin: string | null } | { ok: false, reason: string }}
 */
export function checkRequestOrigin(headers) {
  const hostname = String(headers.host || "").replace(/:\d+$/, "").toLowerCase();
  if (!ALLOWED_HOSTNAMES.has(hostname)) {
    return { ok: false, reason: "host not allowed" };
  }
  const origin = headers.origin;
  if (origin == null) {
    if (headers["sec-fetch-mode"] === "no-cors") {
      return { ok: false, reason: "no-cors request" };
    }
    return { ok: true, origin: null };
  }
  const ext = /^chrome-extension:\/\/([a-p]{32})$/.exec(origin);
  if (ext && ALLOWED_EXTENSION_IDS.has(ext[1])) {
    return { ok: true, origin };
  }
  if (ext) return { ok: false, reason: "unknown extension" };
  return { ok: false, reason: "origin not allowed" };
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

/**
 * Create a small HTTP server exposing:
 *   GET  /health     → { ok, busy, model, mode }
 *   POST /heartbeat  → records extension liveness
 *   POST /ask        → invokes onAsk(log), returns its result as JSON
 *
 * The caller owns capture + AI + UI logic via onAsk. The server only handles
 * concurrency (single-flight), origin checks, and the JSON envelope.
 *
 * @param {object} opts
 * @param {import("pino").Logger} opts.logger
 * @param {string} [opts.mode]
 * @param {(log)=>Promise<object>} opts.onAsk  must return { ok, durationMs?, answerChars? }
 */
export function createSolverServer({ logger, mode = "serve", onAsk }) {
  let busy = false;
  let reqCounter = 0;

  const server = createServer(async (req, res) => {
    const access = checkRequestOrigin(req.headers);
    if (!access.ok) {
      logger.warn(
        { method: req.method, url: req.url, origin: req.headers.origin, host: req.headers.host },
        `rejected request: ${access.reason}`,
      );
      // The extension shows this text in a toast. An unknown extension ID
      // usually means an old copy of the extension is still loaded.
      const error =
        access.reason === "unknown extension"
          ? "unknown extension ID. Reload the Sotto extension at chrome://extensions"
          : "forbidden";
      sendJson(res, 403, { ok: false, error });
      return;
    }

    // The extension has host_permissions for this server, so it does not need
    // CORS. Reflect its origin anyway so it keeps working if Chrome tightens
    // that rule. Web pages never get here (rejected above).
    if (access.origin) {
      res.setHeader("Access-Control-Allow-Origin", access.origin);
      res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.setHeader("Vary", "Origin");
    }

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === "GET" && req.url === "/health") {
      sendJson(res, 200, { ok: true, busy, model: MODEL, mode });
      return;
    }

    if (req.method === "POST" && req.url === "/heartbeat") {
      recordHeartbeat();
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && req.url === "/ask") {
      const reqId = ++reqCounter;
      const log = logger.child({ reqId });

      if (busy) {
        log.warn("rejecting overlapping request");
        sendJson(res, 429, { ok: false, error: "busy" });
        return;
      }

      busy = true;
      log.info("request received");

      try {
        const result = await onAsk(log);
        log.info(result, "request completed");
        sendJson(res, 200, result);
      } catch (err) {
        const msg =
          err?.stderr?.toString?.().trim() || err?.message || String(err);
        log.error({ err: msg }, "request failed");
        sendJson(res, 500, { ok: false, error: msg });
      } finally {
        busy = false;
      }
      return;
    }

    sendJson(res, 404, { ok: false, error: "not found" });
  });

  return {
    listen(port, host = "127.0.0.1") {
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => {
          const actualPort = server.address().port;
          logger.info(
            { port: actualPort, model: MODEL, mode },
            `daemon ready — POST http://127.0.0.1:${actualPort}/ask`,
          );
          resolve(actualPort);
        });
      });
    },
    close() {
      return new Promise((resolve) => server.close(() => resolve()));
    },
    get busy() {
      return busy;
    },
  };
}
