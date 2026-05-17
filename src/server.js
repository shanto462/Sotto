import { createServer } from "node:http";
import { captureAndAsk } from "./index.js";
import { MODEL } from "./config.js";

/**
 * Create a Solver HTTP server. The server exposes:
 *   GET  /health  → { ok, busy, model, mode }
 *   POST /ask     → triggers a capture+ask, calls hooks, returns { ok, durationMs, answerChars }
 *
 * Hooks (all optional):
 *   onPending(log)            — called as soon as a request is accepted
 *   onAnswer({ text, meta }, log) — called with the Claude response (sync or async)
 *   onError(err, log)         — called on failure
 *
 * @param {object} opts
 * @param {string} opts.imagePath  — temp file path for the screenshot
 * @param {import("pino").Logger} opts.logger
 * @param {string} [opts.mode]     — label exposed in /health
 * @param {(log)=>void} [opts.onPending]
 * @param {(result, log)=>void|Promise<void>} [opts.onAnswer]
 * @param {(err, log)=>void} [opts.onError]
 */
export function createSolverServer({
  imagePath,
  logger,
  mode = "serve",
  onPending,
  onAnswer,
  onError,
}) {
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
      const start = performance.now();
      log.info("request received");

      try {
        onPending?.(log);
        const { text, meta } = await captureAndAsk(imagePath, log);
        await onAnswer?.({ text, meta }, log);

        const durationMs = Math.round(performance.now() - start);
        log.info(
          { durationMs, answerChars: text.length },
          "request completed",
        );
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({ ok: true, durationMs, answerChars: text.length }),
        );
      } catch (err) {
        const msg =
          err?.stderr?.toString?.().trim() || err?.message || String(err);
        log.error({ err: msg }, "request failed");
        onError?.(err, log);
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
