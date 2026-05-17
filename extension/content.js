// Receives toast requests from the background service worker and displays them.
// The actual trigger lives in background.js (chrome.commands + toolbar icon).

const LOG_PREFIX = "[solver]";
const log = (...args) => console.log(LOG_PREFIX, ...args);

log(`content script loaded · href=${location.href}`);

let activeToast = null;

function showToast(text, kind = "ok") {
  if (activeToast) {
    activeToast.remove();
    activeToast = null;
  }

  const colors = {
    ok: "rgba(39, 134, 82, 0.95)",
    pending: "rgba(50, 90, 180, 0.95)",
    error: "rgba(190, 60, 60, 0.95)",
  };
  const el = document.createElement("div");
  el.textContent = text;
  Object.assign(el.style, {
    position: "fixed",
    top: "20px",
    right: "20px",
    background: colors[kind] || colors.ok,
    color: "white",
    padding: "10px 14px",
    borderRadius: "8px",
    font: '13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    zIndex: "2147483647",
    boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
    opacity: "1",
    transition: "opacity 0.3s ease",
    pointerEvents: "none",
  });
  document.documentElement.appendChild(el);
  activeToast = el;

  const ttl = kind === "pending" ? 30000 : 2000;
  setTimeout(() => {
    el.style.opacity = "0";
  }, Math.max(ttl - 300, 100));
  setTimeout(() => {
    if (el === activeToast) activeToast = null;
    el.remove();
  }, ttl);

  return el;
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type !== "toast") return false;
  log(`toast · kind=${msg.kind} · text=${msg.text}`);
  showToast(msg.text, msg.kind);
  return false;
});
