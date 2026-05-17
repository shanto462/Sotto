// OS-specific window queries. The only platform-branching code in the project.
//
// queryActiveChromeWindow():
//   macOS   → AppleScript reads Chrome's frontmost window (title + bounds).
//   Windows → PowerShell + Win32 (GetForegroundWindow, GetWindowText, GetWindowRect)
//             reads the foreground window's title (and bounds when DPI-safe).
//
// Returns: { title: string, bounds: {x,y,width,height} | null }
//   - title  is best-effort; if it can't be read, "" is returned and capture falls
//            back to picking the first Chrome window enumerated.
//   - bounds is null on Windows for now (we don't try to position the overlay over
//            Chrome there until we sort out per-monitor DPI conversion).

import { execFileSync } from "node:child_process";
import { platform } from "node:os";

const MAC_QUERY = `
tell application "Google Chrome"
  if not running then error "Google Chrome is not running"
  if (count of windows) = 0 then error "Google Chrome has no open windows"
  set b to bounds of front window
  set t to title of front window
end tell
return (item 1 of b as text) & "," & ¬
       (item 2 of b as text) & "," & ¬
       (item 3 of b as text) & "," & ¬
       (item 4 of b as text) & "|" & t
`.trim();

// PowerShell script kept as a UTF-16LE base64 blob so we don't have to fight
// double-quote escaping through child_process.
const WIN_PS_SCRIPT = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class W {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet=CharSet.Auto)]
  public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
}
"@
$sb = New-Object Text.StringBuilder 1024
[void][W]::GetWindowText([W]::GetForegroundWindow(), $sb, $sb.Capacity)
$sb.ToString()
`.trim();

function queryMacOS() {
  const raw = execFileSync("osascript", ["-e", MAC_QUERY], {
    encoding: "utf8",
    timeout: 4000,
  }).trim();

  const [boundsPart, ...titleParts] = raw.split("|");
  const title = titleParts.join("|"); // titles can contain '|'
  const parts = boundsPart.split(",").map((s) => Number(s.trim()));
  if (parts.length !== 4 || parts.some(Number.isNaN)) {
    throw new Error(`Unexpected Chrome bounds output: "${raw}"`);
  }
  const [x1, y1, x2, y2] = parts;
  return {
    title,
    bounds: { x: x1, y: y1, width: x2 - x1, height: y2 - y1 },
  };
}

function queryWindows() {
  const encoded = Buffer.from(WIN_PS_SCRIPT, "utf16le").toString("base64");
  const title = execFileSync(
    "powershell",
    ["-NoProfile", "-EncodedCommand", encoded],
    { encoding: "utf8", timeout: 6000 },
  ).trim();
  return { title, bounds: null };
}

export function queryActiveChromeWindow(log) {
  const start = performance.now();
  const p = platform();
  try {
    let result;
    if (p === "darwin") result = queryMacOS();
    else if (p === "win32") result = queryWindows();
    else throw new Error(`Unsupported platform: ${p}`);

    log?.debug(
      {
        platform: p,
        title: result.title,
        bounds: result.bounds,
        durationMs: Math.round(performance.now() - start),
      },
      "queried active window",
    );
    return result;
  } catch (err) {
    log?.warn(
      { err: err.message, platform: p },
      "could not query active window; capture will fall back to first Chrome match",
    );
    return { title: "", bounds: null };
  }
}
