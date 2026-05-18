// Regenerates the placeholder icon set from SVG strings.
// Run with:  node assets/generate-icons.js
//
// Outputs:
//   assets/icon-app.png            1024×1024 color, dock/installer
//   assets/icon-tray-Template.png   16×16 monochrome + alpha (macOS template)
//   assets/icon-tray-Template@2x.png 32×32
//   assets/icon-tray-busy.png      16×16 color (in-progress states)
//   assets/icon-tray-warn.png      16×16 color (error states)
//
// macOS treats any file whose name ends with `Template.png` as a template image
// and recolors it for the menu bar. Hence the suffix.

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
mkdirSync(__dirname, { recursive: true });

const ACCENT = "#7aa2ff";
const ACCENT_BUSY = "#9c8aff";
const WARN = "#ef4444";

function appSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${ACCENT}"/>
      <stop offset="100%" stop-color="${ACCENT_BUSY}"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" rx="220" fill="url(#g)"/>
  <text x="50%" y="56%" font-family="Helvetica, Arial, sans-serif"
        font-size="620" font-weight="700" fill="white"
        text-anchor="middle" dominant-baseline="middle">S</text>
</svg>`;
}

// Template tray icons must be solid black with alpha. macOS recolors them.
function trayTemplateSvg(px) {
  const stroke = Math.max(1, Math.round(px / 16));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 16 16">
  <circle cx="8" cy="8" r="${7 - stroke / 2}" fill="none" stroke="black" stroke-width="${stroke}"/>
  <text x="50%" y="58%" font-family="Helvetica, Arial, sans-serif"
        font-size="11" font-weight="700" fill="black"
        text-anchor="middle" dominant-baseline="middle">S</text>
</svg>`;
}

function trayBusySvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
  <circle cx="8" cy="8" r="6.5" fill="${ACCENT}"/>
  <text x="50%" y="58%" font-family="Helvetica, Arial, sans-serif"
        font-size="10" font-weight="700" fill="white"
        text-anchor="middle" dominant-baseline="middle">S</text>
</svg>`;
}

function trayWarnSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
  <circle cx="8" cy="8" r="6.5" fill="${WARN}"/>
  <text x="50%" y="58%" font-family="Helvetica, Arial, sans-serif"
        font-size="10" font-weight="700" fill="white"
        text-anchor="middle" dominant-baseline="middle">!</text>
</svg>`;
}

async function render(svgString, outName) {
  const outPath = join(__dirname, outName);
  await sharp(Buffer.from(svgString)).png().toFile(outPath);
  console.log(`✓  ${outName}`);
}

await Promise.all([
  render(appSvg(), "icon-app.png"),
  render(trayTemplateSvg(16), "icon-tray-Template.png"),
  render(trayTemplateSvg(32), "icon-tray-Template@2x.png"),
  render(trayBusySvg(), "icon-tray-busy.png"),
  render(trayWarnSvg(), "icon-tray-warn.png"),
]);
console.log("done.");
