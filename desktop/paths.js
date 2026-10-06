import { app } from "electron";
import { cpSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export const PROJECT_ROOT = join(here, "..");
export const ASSETS_DIR = join(PROJECT_ROOT, "assets");

// Files the OS or Chrome must open directly cannot live inside app.asar.
// Packaged builds unpack them (see "asarUnpack" in package.json); in dev
// this is a no-op because the path has no app.asar segment.
function unpacked(p) {
  return p.replace(/(^|[\\/])app\.asar(?=[\\/]|$)/, "$1app.asar.unpacked");
}

const BUNDLED_EXTENSION_DIR = unpacked(join(PROJECT_ROOT, "extension"));
export const LICENSE_PATH = unpacked(join(PROJECT_ROOT, "LICENSE"));

/**
 * The folder the user loads in Chrome ("Load unpacked"). Chrome remembers
 * this path, so packaged builds use a copy in userData: the path stays the
 * same across app updates and outlives the app (the Windows portable build
 * runs from a temp folder that is deleted on quit). Dev runs use the repo's
 * extension/ folder directly.
 */
export function getExtensionDir() {
  return app.isPackaged
    ? join(app.getPath("userData"), "extension")
    : BUNDLED_EXTENSION_DIR;
}

/** Refresh the userData copy from the bundled extension (packaged builds only). */
export function syncExtensionDir() {
  const target = getExtensionDir();
  if (target === BUNDLED_EXTENSION_DIR) return;
  cpSync(BUNDLED_EXTENSION_DIR, target, { recursive: true, force: true });
}
