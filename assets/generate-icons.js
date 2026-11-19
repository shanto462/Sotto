// Generates Sotto's whole icon set from SVG strings via sharp. This file is the
// single source of truth: edit the geometry here, then run, from the repo root:
//
//   node assets/generate-icons.js
//
// Outputs:
//   assets/icon-app.png               1024×1024 color + alpha, dock / installer
//                                     (electron-builder derives .icns / .ico)
//   assets/icon-tray-Template.png     16×16 black + alpha (macOS template)
//   assets/icon-tray-Template@2x.png  32×32 black + alpha (macOS template, Retina)
//   assets/icon-tray-busy.png         16×16 color (in-progress states)
//   assets/icon-tray-busy@2x.png      32×32 color (in-progress states, Retina)
//   assets/icon-tray-warn.png         16×16 color (error states)
//   assets/icon-tray-warn@2x.png      32×32 color (error states, Retina)
//   extension/icons/icon-16.png       Chrome toolbar / favicon
//   extension/icons/icon-32.png       Chrome toolbar (2x)
//   extension/icons/icon-48.png       chrome://extensions
//   extension/icons/icon-128.png      Web Store / install dialog (96px art, 16px padding)
//
// The motif is "the aside": a page (your real work) with a small note card
// tucked into its right margin, separated by a hairline of empty space. One
// line of the page is tinted to show what the note is about. Every size uses
// the same glyph; the small sizes are drawn on a 16-unit pixel grid so edges
// land on whole pixels.
//
// macOS treats any file whose name ends with `Template.png` as a template image
// and recolors it for the menu bar, so those must be pure black plus alpha.

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXT_ICONS = join(__dirname, "..", "extension", "icons");
mkdirSync(EXT_ICONS, { recursive: true });

// Palette, matched to desktop/ui/shared/tokens.css.
const INK_TOP = "#2a3654";
const INK_BOTTOM = "#0c1222";
const PAPER_TOP = "#fbfcfe";
const PAPER_BOTTOM = "#dde3ee";
const RULE = "#aab3c5";
const NOTE_TOP = "#9db8ff";
const NOTE_BOTTOM = "#3b6df0";
const TRAY_PAGE = "#8e94a0"; // neutral grey readable on light and dark menu bars
const ACCENT = "#7aa2ff";
const WARN = "#ef4444";

// ---------------------------------------------------------------------------
// Shared helpers

/** Superellipse path, close to Apple's continuous-corner icon shape. */
function squirclePath(cx, cy, size, n = 5) {
  const a = size / 2;
  const steps = 360;
  let d = "";
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const x = cx + a * Math.sign(c) * Math.abs(c) ** (2 / n);
    const y = cy + a * Math.sign(s) * Math.abs(s) ** (2 / n);
    d += `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return `${d}Z`;
}

const svg = (w, h, body, viewBox = `0 0 ${w} ${h}`) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${viewBox}">${body}</svg>`;

// ---------------------------------------------------------------------------
// App icon artwork, authored on a 1024 canvas with an 824 squircle body.
// `shadow` adds a soft drop shadow below the body (Chrome 128 icon only; macOS
// adds its own). `detail` drops page rules at small sizes.

const APP = {
  body: { cx: 512, cy: 512, size: 824 },
  page: { x: 238, y: 226, w: 396, h: 572, r: 46 },
  note: { x: 520, y: 440, w: 286, h: 286, r: 52 },
  gap: 26, // empty band between note and page
};

function appArt({ shadow = false, detail = "full" } = {}) {
  const { body, page, note, gap } = APP;
  const bodyPath = squirclePath(body.cx, body.cy, body.size);
  const ruleX = page.x + 62;
  const ruleH = 26;
  const rules =
    detail === "full"
      ? [
          { y: 318, w: 252 },
          { y: 398, w: 296 },
          { y: 478, w: 176, hi: true },
          { y: 558, w: 196 },
          { y: 638, w: 150 },
          { y: 718, w: 186 },
        ]
      : [
          { y: 330, w: 270 },
          { y: 450, w: 190, hi: true },
          { y: 570, w: 190 },
          { y: 690, w: 150 },
        ];
  const ruleH2 = detail === "full" ? ruleH : 40;
  const ruleSvg = rules
    .map(
      (l) =>
        `<rect x="${ruleX}" y="${l.y - ruleH2 / 2}" width="${l.w}" height="${ruleH2}" rx="${ruleH2 / 2}" fill="${l.hi ? "url(#hi)" : RULE}"${l.hi ? "" : ' opacity="0.9"'}/>`,
    )
    .join("");
  const noteLines =
    detail === "full"
      ? `<rect x="${note.x + 56}" y="${note.y + 104}" width="150" height="26" rx="13" fill="#fff" opacity="0.92"/>
         <rect x="${note.x + 56}" y="${note.y + 156}" width="104" height="26" rx="13" fill="#fff" opacity="0.6"/>`
      : `<rect x="${note.x + 60}" y="${note.y + 123}" width="160" height="40" rx="20" fill="#fff" opacity="0.92"/>`;

  return `
  <defs>
    <linearGradient id="ink" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${INK_TOP}"/>
      <stop offset="1" stop-color="${INK_BOTTOM}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.3" cy="0.12" r="0.85">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.16"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="noteGlow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${ACCENT}" stop-opacity="0.45"/>
      <stop offset="1" stop-color="${ACCENT}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="rim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.28"/>
      <stop offset="0.25" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="paper" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${PAPER_TOP}"/>
      <stop offset="1" stop-color="${PAPER_BOTTOM}"/>
    </linearGradient>
    <linearGradient id="note" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0" stop-color="${NOTE_TOP}"/>
      <stop offset="1" stop-color="${NOTE_BOTTOM}"/>
    </linearGradient>
    <linearGradient id="noteSheen" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.35"/>
      <stop offset="0.5" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="hi" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${NOTE_BOTTOM}" stop-opacity="0.55"/>
      <stop offset="1" stop-color="${ACCENT}" stop-opacity="0.85"/>
    </linearGradient>
    <filter id="soft" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="22"/>
    </filter>
    <filter id="bodyShadow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="18"/>
    </filter>
    <clipPath id="bodyClip"><path d="${bodyPath}"/></clipPath>
    <mask id="pageCut" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">
      <rect width="1024" height="1024" fill="#fff"/>
      <rect x="${note.x - gap}" y="${note.y - gap}" width="${note.w + gap * 2}" height="${note.h + gap * 2}" rx="${note.r + gap}" fill="#000"/>
    </mask>
  </defs>
  ${shadow ? `<path d="${bodyPath}" transform="translate(0 24)" fill="#000" opacity="0.35" filter="url(#bodyShadow)"/>` : ""}
  <path d="${bodyPath}" fill="url(#ink)"/>
  <g clip-path="url(#bodyClip)">
    <path d="${bodyPath}" fill="url(#glow)"/>
    <rect x="${page.x + 6}" y="${page.y + 30}" width="${page.w}" height="${page.h}" rx="${page.r}" fill="#000" opacity="0.45" filter="url(#soft)"/>
    <circle cx="${note.x + note.w / 2}" cy="${note.y + note.h / 2}" r="${note.w * 0.95}" fill="url(#noteGlow)"/>
  </g>
  <g mask="url(#pageCut)">
    <rect x="${page.x}" y="${page.y}" width="${page.w}" height="${page.h}" rx="${page.r}" fill="url(#paper)"/>
    ${ruleSvg}
  </g>
  <rect x="${note.x}" y="${note.y + 18}" width="${note.w}" height="${note.h}" rx="${note.r}" fill="#000" opacity="0.4" filter="url(#soft)"/>
  <rect x="${note.x}" y="${note.y}" width="${note.w}" height="${note.h}" rx="${note.r}" fill="url(#note)"/>
  <rect x="${note.x}" y="${note.y}" width="${note.w}" height="${note.h}" rx="${note.r}" fill="url(#noteSheen)"/>
  ${noteLines}
  <path d="${bodyPath}" fill="none" stroke="url(#rim)" stroke-width="5"/>`;
}

function appSvg() {
  return svg(1024, 1024, appArt());
}

/** App artwork scaled so the squircle body is `bodyPx` wide, centred in `canvas`. */
function appSvgAt(canvas, bodyPx, opts) {
  const scale = bodyPx / APP.body.size;
  const vb = canvas / scale;
  const origin = APP.body.cx - vb / 2;
  return svg(canvas, canvas, appArt(opts), `${origin} ${origin} ${vb} ${vb}`);
}

// ---------------------------------------------------------------------------
// Tray glyph, on a 16-unit grid (1 unit = 1px at @1x, 2px at @2x).
//
//   page outline   cols 1–10, rows 1–14, 1-unit stroke
//   note card      cols 8–14, rows 6–12, solid
//   gap            1 unit cleared around the note
//   rules          short lines inside the page, left of the note

const GLYPH = {
  page: { x: 1, y: 1, w: 10, h: 14, r: 2 },
  note: { x: 8, y: 6, w: 7, h: 7, r: 1.5 },
  rules: [
    { x: 3, y: 4, w: 5 },
    { x: 3, y: 7, w: 3 },
    { x: 3, y: 10, w: 3 },
  ],
};

/** Filled rect with its four corner pixels removed: a crisp 1px "rounding". */
function notchedRect(x, y, w, h) {
  return `M${x + 1} ${y}h${w - 2}v1h1v${h - 2}h-1v1h-${w - 2}v-1h-1v-${h - 2}h1Z`;
}

/**
 * @param {number} px      output size: 16 is drawn as pixel art (notched
 *                         corners, no anti-aliasing), 32 as vector with radii
 * @param {object} colors  { page, note, mark }; mark is the knockout inside the
 *                         note ("dots" = busy, "bang" = warn)
 */
function traySvg(px, { page, note, mark = null }) {
  const { page: p, note: n, rules } = GLYPH;
  const crisp = px === 16;
  const markShapes = {
    dots: [9, 11, 13].map((x) => `<rect x="${x}" y="9" width="1" height="1" fill="#000"/>`).join(""),
    bang: `<rect x="11" y="7" width="1" height="3" fill="#000"/><rect x="11" y="11" width="1" height="1" fill="#000"/>`,
  };
  const pageOutline = crisp
    ? [
        [p.x + 1, p.y, p.w - 2, 1],
        [p.x + 1, p.y + p.h - 1, p.w - 2, 1],
        [p.x, p.y + 1, 1, p.h - 2],
        [p.x + p.w - 1, p.y + 1, 1, p.h - 2],
      ]
        .map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}"/>`)
        .join("")
    : // centre the 1-unit stroke on whole pixels
      `<rect x="${p.x + 0.5}" y="${p.y + 0.5}" width="${p.w - 1}" height="${p.h - 1}" rx="${p.r - 0.5}" fill="none" stroke="${page}" stroke-width="1"/>`;
  const noteShape = crisp
    ? `<path d="${notchedRect(n.x, n.y, n.w, n.h)}" fill="${note}" mask="url(#mark)"/>`
    : `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="${n.r}" fill="${note}" mask="url(#mark)"/>`;
  const cutShape = crisp
    ? `<rect x="${n.x - 1}" y="${n.y - 1}" width="${n.w + 2}" height="${n.h + 2}" fill="#000"/>`
    : `<rect x="${n.x - 1}" y="${n.y - 1}" width="${n.w + 2}" height="${n.h + 2}" rx="${n.r + 1}" fill="#000"/>`;
  const body = `
  <defs>
    <mask id="cut" maskUnits="userSpaceOnUse" x="0" y="0" width="16" height="16">
      <rect width="16" height="16" fill="#fff"/>
      ${cutShape}
    </mask>
    <mask id="mark" maskUnits="userSpaceOnUse" x="0" y="0" width="16" height="16">
      <rect width="16" height="16" fill="#fff"/>
      ${mark ? markShapes[mark] : ""}
    </mask>
  </defs>
  <g${crisp ? ' shape-rendering="crispEdges"' : ""}>
    <g mask="url(#cut)" fill="${page}">
      ${pageOutline}
      ${rules.map((r) => `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="1"/>`).join("")}
    </g>
    ${noteShape}
  </g>`;
  return svg(px, px, body, "0 0 16 16");
}

// ---------------------------------------------------------------------------
// Chrome toolbar icons (16 / 32). A full squircle is too busy at this size, so
// the glyph sits on a small ink tile: paper page, blue note, ink gap.

function extensionSmallSvg(px) {
  const body = `
  <defs>
    <linearGradient id="ink" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${INK_TOP}"/>
      <stop offset="1" stop-color="${INK_BOTTOM}"/>
    </linearGradient>
    <linearGradient id="note" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0" stop-color="${NOTE_TOP}"/>
      <stop offset="1" stop-color="${NOTE_BOTTOM}"/>
    </linearGradient>
    <mask id="cut" maskUnits="userSpaceOnUse" x="0" y="0" width="16" height="16">
      <rect width="16" height="16" fill="#fff"/>
      <rect x="7" y="6" width="8" height="8" rx="2" fill="#000"/>
    </mask>
  </defs>
  <rect width="16" height="16" rx="3.5" fill="url(#ink)"/>
  <rect x="3" y="2" width="7" height="12" rx="1.25" fill="${PAPER_TOP}" mask="url(#cut)"/>
  ${px >= 32 ? `<rect x="4.5" y="4" width="4" height="1" rx="0.5" fill="${RULE}"/><rect x="4.5" y="6.5" width="1.5" height="1" rx="0.5" fill="${RULE}"/><rect x="4.5" y="9" width="1.5" height="1" rx="0.5" fill="${RULE}"/>` : `<rect x="4" y="4" width="4" height="1" fill="${RULE}"/>`}
  <rect x="8" y="7" width="6" height="6" rx="1.25" fill="url(#note)"/>`;
  return svg(px, px, body, "0 0 16 16");
}

// ---------------------------------------------------------------------------

async function render(svgString, outPath) {
  await sharp(Buffer.from(svgString)).png().toFile(outPath);
  console.log(`✓  ${outPath.replace(join(__dirname, ".."), ".")}`);
}

const asset = (name) => join(__dirname, name);
const ext = (name) => join(EXT_ICONS, name);

await Promise.all([
  render(appSvg(), asset("icon-app.png")),
  render(traySvg(16, { page: "#000", note: "#000" }), asset("icon-tray-Template.png")),
  render(traySvg(32, { page: "#000", note: "#000" }), asset("icon-tray-Template@2x.png")),
  render(traySvg(16, { page: TRAY_PAGE, note: ACCENT, mark: "dots" }), asset("icon-tray-busy.png")),
  render(traySvg(32, { page: TRAY_PAGE, note: ACCENT, mark: "dots" }), asset("icon-tray-busy@2x.png")),
  render(traySvg(16, { page: TRAY_PAGE, note: WARN, mark: "bang" }), asset("icon-tray-warn.png")),
  render(traySvg(32, { page: TRAY_PAGE, note: WARN, mark: "bang" }), asset("icon-tray-warn@2x.png")),
  render(extensionSmallSvg(16), ext("icon-16.png")),
  render(extensionSmallSvg(32), ext("icon-32.png")),
  render(appSvgAt(48, 44, { detail: "simple" }), ext("icon-48.png")),
  render(appSvgAt(128, 96, { shadow: true }), ext("icon-128.png")),
]);
console.log("done.");
