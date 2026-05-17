const ENDPOINT = "http://127.0.0.1:8765/ask";
const HEALTH = "http://127.0.0.1:8765/health";
const LOG_PREFIX = "[solver-bg]";

const log = (...args) => console.log(LOG_PREFIX, ...args);
const warn = (...args) => console.warn(LOG_PREFIX, ...args);
const err = (...args) => console.error(LOG_PREFIX, ...args);

log("service worker started");

chrome.runtime.onInstalled?.addListener((details) => {
  log(`onInstalled · reason=${details.reason}`);
  pingHealth();
  logRegisteredShortcuts();
});

chrome.runtime.onStartup?.addListener(() => {
  log("onStartup");
  pingHealth();
  logRegisteredShortcuts();
});

async function pingHealth() {
  try {
    const r = await fetch(HEALTH);
    const body = await r.text();
    log(`health check · status=${r.status} · body=${body}`);
  } catch (e) {
    warn(`health check failed: ${e?.message ?? e} · is "npm run serve" running?`);
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
    warn(`getAll failed: ${e?.message ?? e}`);
  }
}

// Toast messages are sent to the active tab when possible.
async function showToastOnActiveTab(text, kind) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      log("no active tab to toast on");
      return;
    }
    // Can't message restricted URLs (chrome://, web store, etc).
    if (!/^https?:|^file:/.test(tab.url ?? "")) {
      log(`active tab is restricted (${tab.url}); skipping toast`);
      return;
    }
    await chrome.tabs.sendMessage(tab.id, { type: "toast", text, kind });
  } catch (e) {
    // Tab content script may not be loaded (e.g. tab opened before extension install).
    log(`toast skipped: ${e?.message ?? e}`);
  }
}

async function runTrigger(source) {
  log(`trigger fired · source=${source}`);
  await showToastOnActiveTab("Asking Claude…", "pending");
  const startedAt = Date.now();

  try {
    const res = await fetch(ENDPOINT, { method: "POST" });
    const text = await res.text();
    const elapsed = Date.now() - startedAt;
    log(`fetch done · status=${res.status} · elapsed=${elapsed}ms · body=${text}`);

    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      /* non-JSON */
    }

    if (!res.ok) {
      const msg = body?.error ?? text ?? `HTTP ${res.status}`;
      warn(`backend non-2xx: ${msg}`);
      await showToastOnActiveTab(`Solver failed: ${msg}`, "error");
      return;
    }

    const ms = body?.durationMs
      ? ` (${(body.durationMs / 1000).toFixed(1)}s)`
      : "";
    await showToastOnActiveTab(`Answer in terminal${ms}`, "ok");
  } catch (e) {
    err(`fetch failed: ${e?.message ?? e}`);
    await showToastOnActiveTab(
      `Daemon unreachable: ${e?.message ?? e}`,
      "error",
    );
  }
}

chrome.commands.onCommand.addListener((command) => {
  log(`onCommand · ${command}`);
  if (command === "trigger-solver") runTrigger("shortcut");
});

// Toolbar icon click also triggers (handy when the shortcut conflicts).
chrome.action.onClicked.addListener(() => runTrigger("toolbar-icon"));
