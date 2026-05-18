// API key storage backed by Electron's safeStorage (OS keychain on macOS/Windows).
// Plaintext is never written to disk — the encrypted blob is a single file in
// userData. Reads gracefully return null if decryption fails (e.g. user has
// reset their login keychain).

import { app, safeStorage } from "electron";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function path() {
  return join(app.getPath("userData"), "secrets.enc");
}

function loadAll() {
  const p = path();
  if (!existsSync(p)) return {};
  try {
    const blob = readFileSync(p);
    if (blob.length === 0) return {};
    return JSON.parse(safeStorage.decryptString(blob));
  } catch {
    return {};
  }
}

function saveAll(secrets) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("OS keychain encryption is not available on this system");
  }
  const encrypted = safeStorage.encryptString(JSON.stringify(secrets));
  writeFileSync(path(), encrypted);
}

export function getSecret(service) {
  const v = loadAll()[service];
  return typeof v === "string" && v.length > 0 ? v : null;
}

export function setSecret(service, value) {
  const all = loadAll();
  if (value == null || value === "") {
    delete all[service];
  } else {
    all[service] = String(value);
  }
  if (Object.keys(all).length === 0) {
    if (existsSync(path())) unlinkSync(path());
  } else {
    saveAll(all);
  }
}

export function hasSecret(service) {
  return getSecret(service) != null;
}

// Hydrate process.env from the keychain so existing code paths
// (Anthropic/OpenAI SDKs read from env) keep working unchanged.
// Env vars from a real .env take precedence; the keychain is a fallback.
export function hydrateProcessEnv() {
  const map = {
    anthropic: "ANTHROPIC_API_KEY",
    openai: "OPENAI_API_KEY",
  };
  for (const [service, envKey] of Object.entries(map)) {
    if (process.env[envKey]) continue;
    const v = getSecret(service);
    if (v) process.env[envKey] = v;
  }
}
