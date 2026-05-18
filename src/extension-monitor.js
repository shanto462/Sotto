// Tracks the last time the Chrome extension pinged /heartbeat.
// Used by the tray icon to display an "extension not detected" state.

const HEARTBEAT_TTL_MS = 90_000;

let lastSeenAt = 0;

export function recordHeartbeat() {
  lastSeenAt = Date.now();
}

export function isExtensionAlive() {
  return lastSeenAt > 0 && Date.now() - lastSeenAt < HEARTBEAT_TTL_MS;
}

export function lastSeenAgoMs() {
  return lastSeenAt > 0 ? Date.now() - lastSeenAt : Infinity;
}
