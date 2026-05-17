import { createServer } from "node:http";
import { MODEL } from "./config.js";

/**
 * Create a small HTTP server exposing:
 *   GET  /health  → { ok, busy, model, mode }
 *   POST /ask     → invokes onAsk(log), returns its result as JSON
 *
 * The caller owns capture + AI + UI logic via onAsk. The server only handles
 * concurrency (single-flight), CORS, and JSON envelope.
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
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, busy, model: MODEL, mode }));
      return;
    }

    if (req.method === "POST" && req.url === "/ask") {
      const reqId = ++reqCounter;
      const log = logger.child({ reqId });

      if (busy) {
        log.warn("rejecting overlapping request");
        res.writeHead(429, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "busy" }));
        return;
      }

      busy = true;
      log.info("request received");

      try {
        const result = await onAsk(log);
        log.info(result, "request completed");
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (err) {
        const msg =
          err?.stderr?.toString?.().trim() || err?.message || String(err);
        log.error({ err: msg }, "request failed");
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: msg }));
      } finally {
        busy = false;
      }
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "not found" }));
  });

  return {
    listen(port) {
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, "127.0.0.1", () => {
          logger.info(
            { port, model: MODEL, mode },
            `daemon ready — POST http://127.0.0.1:${port}/ask`,
          );
          resolve();
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
