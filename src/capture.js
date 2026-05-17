// Cross-platform Chrome window capture using Electron's desktopCapturer.
//
// On modern macOS / Windows, desktopCapturer uses the OS's GPU-accelerated window
// capture (NSWindow snapshots / Windows.Graphics.Capture). Our own overlay window
// has setContentProtection(true), so it is automatically excluded from the result.

import { desktopCapturer, screen } from "electron";

const CHROME_NAME_RE = /google chrome|chromium/i;

/**
 * Capture the Chrome window matching `preferredTitle`, or fall back to any
 * Chrome window if the title doesn't match (e.g. focus moved mid-capture).
 *
 * @param {string} preferredTitle  Exact name to prefer (from queryActiveChromeWindow).
 * @param {import("pino").Logger} [log]
 * @returns {Promise<{png: Buffer, name: string, size: {width: number, height: number}}>}
 */
export async function captureChromeWindowByTitle(preferredTitle, log) {
  const start = performance.now();

  // Pick the largest screen-sized thumbnail across all displays so we don't
  // accidentally downscale a window on a 4K monitor.
  const displays = screen.getAllDisplays();
  const thumbnailSize = displays.reduce(
    (acc, d) => ({
      width: Math.max(acc.width, Math.round(d.bounds.width * d.scaleFactor)),
      height: Math.max(acc.height, Math.round(d.bounds.height * d.scaleFactor)),
    }),
    { width: 1920, height: 1080 },
  );

  const sources = await desktopCapturer.getSources({
    types: ["window"],
    thumbnailSize,
    fetchWindowIcons: false,
  });

  const source =
    (preferredTitle && sources.find((s) => s.name === preferredTitle)) ||
    sources.find((s) => CHROME_NAME_RE.test(s.name));

  if (!source) {
    throw new Error(
      "No Google Chrome window was found. Is Chrome running with at least one open window?",
    );
  }

  const png = source.thumbnail.toPNG();
  const size = source.thumbnail.getSize();

  log?.info(
    {
      windowName: source.name,
      matched: preferredTitle ? source.name === preferredTitle : "fallback",
      bytes: png.length,
      width: size.width,
      height: size.height,
      durationMs: Math.round(performance.now() - start),
    },
    "captured Chrome window",
  );

  return { png, name: source.name, size };
}
