const contentEl = document.getElementById("content");
const footerEl = document.getElementById("footer");

// ── Click-through ↔ interactive toggle ───────────────────────────────────────
// Default: window ignores mouse events with forward:true so the renderer can
// still see mousemove events for hover detection.
// When the cursor enters the overlay → switch off ignore so wheel/scroll work.
// When it leaves → switch back so clicks pass through to Chrome.
let clickThrough = true;

function setClickThrough(value) {
  if (value === clickThrough) return;
  clickThrough = value;
  if (value) {
    window.api.setIgnoreMouseEvents(true, { forward: true });
  } else {
    window.api.setIgnoreMouseEvents(false);
  }
}

document.addEventListener("mousemove", () => setClickThrough(false));
document.addEventListener("mouseleave", () => setClickThrough(true));
// Safety: if window loses focus or page is hidden, return to click-through.
window.addEventListener("blur", () => setClickThrough(true));
document.addEventListener("visibilitychange", () => {
  if (document.hidden) setClickThrough(true);
});

// ── Rendering ────────────────────────────────────────────────────────────────
function renderStatus(data) {
  if (data.state === "pending") {
    contentEl.innerHTML = `
      <div class="status">
        <div class="spinner"></div>
        <span>Capturing and asking Claude…</span>
      </div>
    `;
    footerEl.textContent = "";
  } else if (data.state === "error") {
    contentEl.innerHTML = `
      <div class="status status-error">
        <span>⚠ ${escapeHtml(data.error || "Unknown error")}</span>
      </div>
    `;
    footerEl.textContent = "";
  }
}

function renderAnswer({ html, meta }) {
  contentEl.innerHTML = `<div class="md">${html}</div>`;
  contentEl.scrollTop = 0;
  footerEl.textContent = formatMeta(meta);
}

function formatMeta(meta = {}) {
  const parts = [];
  if (meta.inputTokens != null)
    parts.push(`${meta.inputTokens.toLocaleString()} in`);
  if (meta.outputTokens != null)
    parts.push(`${meta.outputTokens.toLocaleString()} out`);
  if (meta.durationMs != null)
    parts.push(`${(meta.durationMs / 1000).toFixed(1)}s`);
  if (meta.model) parts.push(meta.model);
  return parts.join(" · ");
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

window.api.onStatus(renderStatus);
window.api.onAnswer(renderAnswer);
