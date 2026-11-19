// scripts/sign-mac.mjs — Re-sign a local macOS build with the stable
// "Sotto Local Signing" identity (see scripts/make-cert.sh).
//
// An ad-hoc signature changes on every build, and macOS forgets the Screen
// Recording / Microphone / Accessibility grants each time. A stable identity
// keeps them. Runs after electron-builder, which has already flipped the
// Electron fuses, so the signature covers the final binary.
//
// Usage: node scripts/sign-mac.mjs [path/to/Sotto.app]

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { signAsync } from "@electron/osx-sign";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const NAME = process.env.CERT_NAME || "Sotto Local Signing";
const entitlements = join(root, "assets", "entitlements.mac.plist");

const app = resolve(
  process.argv[2] ||
    [
      join(root, "dist", "mac-arm64", "Sotto.app"),
      join(root, "dist", "mac", "Sotto.app"),
    ].find(existsSync) ||
    "",
);
if (!app.endsWith(".app") || !existsSync(app)) {
  console.error("sign-mac: no Sotto.app found; build it first.");
  process.exit(1);
}

// Not -v: a self-signed identity is listed as CSSMERR_TP_NOT_TRUSTED, which
// is fine for local signing (Gatekeeper trust isn't needed for your own build).
const listing = execFileSync(
  "/usr/bin/security",
  ["find-identity", "-p", "codesigning"],
  { encoding: "utf8" },
);
const sha = listing
  .split("\n")
  .find((l) => l.includes(`"${NAME}"`))
  ?.trim()
  .split(/\s+/)[1];

if (!sha) {
  console.warn(
    `sign-mac: identity "${NAME}" not found, so the build keeps its ad-hoc\n` +
      "signature and macOS will ask for permissions again after each rebuild.\n" +
      "Create the identity once with: bash scripts/make-cert.sh",
  );
  process.exit(0);
}

await signAsync({
  app,
  platform: "darwin",
  identity: sha,
  identityValidation: false,
  optionsForFile: () => ({
    hardenedRuntime: true,
    entitlements,
    timestamp: "none",
  }),
});
console.log(`sign-mac: signed ${app} with "${NAME}" (${sha})`);
