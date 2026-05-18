const PORT = 8765;
const BASE = `http://127.0.0.1:${PORT}`;
const ASK = `${BASE}/ask`;
const HEALTH = `${BASE}/health`;
const HEARTBEAT = `${BASE}/heartbeat`;
const LOG_PREFIX = "[solver-bg]";

const log = (...args) => console.log(LOG_PREFIX, ...args);
const warn = (...args) => console.warn(LOG_PREFIX, ...args);
const err = (...args) => console.error(LOG_PREFIX, ...args);

log("service worker started");

// ── Heartbeat ───────────────────────────────────────────────────────────────
let lastHeartbeatAt = 0;
const HEARTBEAT_DEDUPE_MS = 4_000;

async function sendHeartbeat(reason = "") {
  const now = Date.now();
  if (now - lastHeartbeatAt < HEARTBEAT_DEDUPE_MS) return;
  lastHeartbeatAt = now;
  try {
    const r = await fetch(HEARTBEAT, { method: "POST" });
    if (!r.ok) warn(`heartbeat non-2xx: ${r.status} (${reason})`);
  } catch {
    // Sotto app not running — silent.
  }
}

async function pingHealth() {
  try {
    const r = await fetch(HEALTH);
    const body = await r.text();
    log(`health · status=${r.status} · ${body}`);
  } catch (e) {
    warn(`health failed: ${e?.message ?? e} · is Sotto running?`);
  }
}

async function logRegisteredShortcuts() {
  try {
    const all = await chrome.commands.getAll();
    for (const c of all) {
      const status = c.shortcut
        ? `bound to "${c.shortcut}"`
        : "NOT BOUND — set one at chrome://extensions/shortcuts";
      log(`command "${c.name}" · ${status}`);
    }
  } catch (e) {
    warn(`commands.getAll failed: ${e?.message ?? e}`);
  }
}

// ── Lifecycle events ────────────────────────────────────────────────────────
chrome.runtime.onInstalled?.addListener((d) => {
  log(`onInstalled · reason=${d.reason}`);
  sendHeartbeat("onInstalled");
  pingHealth();
  logRegisteredShortcuts();
});
chrome.runtime.onStartup?.addListener(() => {
  log("onStartup");
  sendHeartbeat("onStartup");
  pingHealth();
  logRegisteredShortcuts();
});

// Periodic heartbeat — works even when the SW is dormant (alarms wake it).
chrome.alarms?.create("heartbeat", { periodInMinutes: 0.5 });
chrome.alarms?.onAlarm.addListener((a) => {
  if (a.name === "heartbeat") sendHeartbeat("alarm");
});

// Tab activity wakes the SW and doubles as an "alive" signal.
chrome.tabs?.onActivated?.addListener(() => sendHeartbeat("tab-activated"));
chrome.tabs?.onUpdated?.addListener((_id, info) => {
  if (info.status === "complete") sendHeartbeat("tab-loaded");
});

// Content scripts ping us on every page load.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "heartbeat-trigger") {
    sendHeartbeat("content-script");
    try {
      sendResponse?.({ ok: true });
    } catch {
      /* ignore */
    }
    return false;
  }
  return false;
});

// ── Toast helper ────────────────────────────────────────────────────────────
async function showToastOnActiveTab(text, kind) {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!tab?.id) return;
    if (!/^https?:|^file:/.test(tab.url ?? "")) return; // chrome://, web store, etc.
    await chrome.tabs.sendMessage(tab.id, { type: "toast", text, kind });
  } catch {
    // Tab may not have the content script (loaded before install). Silent.
  }
}

// ── Ask trigger ─────────────────────────────────────────────────────────────
async function runTrigger(source) {
  log(`trigger · source=${source}`);
  await showToastOnActiveTab("Asking Claude…", "pending");
  const startedAt = Date.now();

  try {
    const r = await fetch(ASK, { method: "POST" });
    const text = await r.text();
    const elapsed = Date.now() - startedAt;
    log(`fetch · status=${r.status} · elapsed=${elapsed}ms`);

    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      /* non-JSON */
    }

    if (!r.ok) {
      const msg = body?.error ?? text ?? `HTTP ${r.status}`;
      warn(`backend ${r.status}: ${msg}`);
      await showToastOnActiveTab(`Sotto: ${msg}`, "error");
      return;
    }

    const ms = body?.durationMs
      ? ` (${(body.durationMs / 1000).toFixed(1)}s)`
      : "";
    await showToastOnActiveTab(`Answer in overlay${ms}`, "ok");
  } catch (e) {
    err(`fetch failed: ${e?.message ?? e}`);
    await showToastOnActiveTab(
      "Sotto app not reachable — is it running?",
      "error",
    );
  }
}

chrome.commands.onCommand.addListener((command) => {
  log(`onCommand · ${command}`);
  if (command === "trigger-solver") runTrigger("shortcut");
});

chrome.action.onClicked.addListener(() => runTrigger("toolbar-icon"));
