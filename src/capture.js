import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";

const BOUNDS_SCRIPT = `
tell application "Google Chrome"
  if not running then error "Google Chrome is not running"
  if (count of windows) = 0 then error "Google Chrome has no open windows"
  activate
  delay 0.25
  set b to bounds of front window
end tell
return (item 1 of b as text) & "," & ¬
       (item 2 of b as text) & "," & ¬
       (item 3 of b as text) & "," & ¬
       (item 4 of b as text)
`.trim();

export function getChromeWindowBounds(log) {
  const start = performance.now();
  const raw = execFileSync("osascript", ["-e", BOUNDS_SCRIPT], {
    encoding: "utf8",
  }).trim();
  const parts = raw.split(",").map((s) => Number(s.trim()));
  if (parts.length !== 4 || parts.some(Number.isNaN)) {
    throw new Error(`Unexpected Chrome window bounds output: "${raw}"`);
  }
  const [x1, y1, x2, y2] = parts;
  const bounds = { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
  log?.debug(
    { bounds, durationMs: Math.round(performance.now() - start) },
    "located Chrome window",
  );
  return bounds;
}

export function captureRegion({ x, y, width, height }, outPath, log) {
  const start = performance.now();
  execFileSync("screencapture", [
    "-x",
    "-o",
    "-R",
    `${x},${y},${width},${height}`,
    outPath,
  ]);
  const { size } = statSync(outPath);
  log?.debug(
    {
      outPath,
      bytes: size,
      durationMs: Math.round(performance.now() - start),
    },
    "captured screenshot",
  );
}
