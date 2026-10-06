import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export const PROJECT_ROOT = join(here, "..");
export const ASSETS_DIR = join(PROJECT_ROOT, "assets");

// Files the OS or Chrome must open directly cannot live inside app.asar.
// Packaged builds unpack them (see "asarUnpack" in package.json); in dev
// this is a no-op because the path has no app.asar segment.
function unpacked(p) {
  return p.replace(/app\.asar(?=[\\/]|$)/, "app.asar.unpacked");
}

export const EXTENSION_DIR = unpacked(join(PROJECT_ROOT, "extension"));
export const LICENSE_PATH = unpacked(join(PROJECT_ROOT, "LICENSE"));
