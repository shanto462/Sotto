const TOTAL_STEPS = 5;
let current = 1;
let licenseAccepted = false;
let extensionPollTimer = null;

// Theme
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme || "dark";
}
window.api.getTheme().then(applyTheme).catch(() => applyTheme("dark"));
window.api.onThemeChange(applyTheme);

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

// ── Step dots ────────────────────────────────────────────────────────────────
function renderDots() {
  const host = $("#step-dots");
  host.innerHTML = "";
  for (let i = 1; i <= TOTAL_STEPS; i++) {
    const d = document.createElement("div");
    d.className =
      "dot" + (i === current ? " active" : i < current ? " complete" : "");
    host.appendChild(d);
  }
}

function showStep(n) {
  current = Math.max(1, Math.min(TOTAL_STEPS, n));
  $$(".step").forEach((el) => {
    el.hidden = Number(el.dataset.step) !== current;
  });
  $("#btn-back").style.visibility = current === 1 ? "hidden" : "visible";
  $("#btn-skip").style.visibility =
    current === 1 || current === TOTAL_STEPS ? "hidden" : "visible";
  $("#btn-next").textContent = current === TOTAL_STEPS ? "Done" : "Continue";
  updateNextEnabled();
  renderDots();
  onStepEnter();
}

function onStepEnter() {
  if (current === 4) startExtensionPolling();
  else stopExtensionPolling();
  if (current === 3) refreshPermissions();
}

// ── Step 1: license ──────────────────────────────────────────────────────────
$("#license-accept").addEventListener("change", (e) => {
  licenseAccepted = e.target.checked;
  updateNextEnabled();
});
$("#open-license").addEventListener("click", () => window.api.openLicense());

// ── Step 2: API keys ─────────────────────────────────────────────────────────
$$(".reveal").forEach((btn) => {
  btn.addEventListener("click", () => {
    const input = $("#" + btn.dataset.target);
    input.type = input.type === "password" ? "text" : "password";
  });
});
$$("[data-href]").forEach((btn) => {
  btn.addEventListener("click", () => window.api.openExternal(btn.dataset.href));
});

async function hydrateKeys() {
  const info = await window.api.getSecretInfo();
  if (info?.anthropic) {
    $("#key-anthropic").placeholder = "•••• saved";
    setChip("#key-anthropic-status", "ok", "saved");
  }
  if (info?.openai) {
    $("#key-openai").placeholder = "•••• saved";
    setChip("#key-openai-status", "ok", "saved");
  }
}

function setChip(sel, kind, text) {
  const el = $(sel);
  el.className = "chip " + kind;
  el.textContent = text;
}

async function saveStep2() {
  const anth = $("#key-anthropic").value.trim();
  const oai = $("#key-openai").value.trim();
  const errors = [];
  if (anth) {
    setChip("#key-anthropic-status", "accent", "checking…");
    const r = await window.api.testSecret("anthropic", anth);
    if (r?.ok) {
      await window.api.saveSecret("anthropic", anth);
      setChip("#key-anthropic-status", "ok", "valid");
    } else {
      setChip("#key-anthropic-status", "danger", r?.error || "invalid");
      errors.push("anthropic");
    }
  }
  if (oai) {
    setChip("#key-openai-status", "accent", "checking…");
    const r = await window.api.testSecret("openai", oai);
    if (r?.ok) {
      await window.api.saveSecret("openai", oai);
      setChip("#key-openai-status", "ok", "valid");
    } else {
      setChip("#key-openai-status", "danger", r?.error || "invalid");
      errors.push("openai");
    }
  }
  return errors.length === 0;
}

// ── Step 3: permissions ──────────────────────────────────────────────────────
async function refreshPermissions() {
  try {
    const p = await window.api.checkPermissions();
    setPerm("screen", p?.screen);
    setPerm("mic", p?.microphone);
    setPerm("accessibility", p?.accessibility);
  } catch {
    /* ignore */
  }
}

function setPerm(name, status) {
  const el = $(`.perm-item[data-perm="${name}"]`);
  if (!el) return;
  el.classList.remove("granted", "denied");
  const btn = el.querySelector(".perm-request");
  if (status === "granted") {
    el.classList.add("granted");
    if (btn) btn.textContent = "✓ Granted";
  } else {
    if (status === "denied") el.classList.add("denied");
    if (btn) btn.textContent = "Request";
  }
}

$$(".perm-request").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const item = btn.closest(".perm-item");
    const kind = item?.dataset.kind;
    if (!kind || item.classList.contains("granted")) return;

    item.classList.add("checking");
    btn.textContent = "Requesting…";
    try {
      const res = await window.api.requestPermission(kind);
      if (res?.requiresRestart) {
        $("#perm-restart-banner").hidden = false;
      }
    } catch (e) {
      console.error(e);
    } finally {
      item.classList.remove("checking");
      await refreshPermissions();
    }
  });
});

$("#perm-restart")?.addEventListener("click", () => window.api.restartApp());

// ── Step 4: extension ────────────────────────────────────────────────────────
async function hydrateExtensionStep() {
  const info = await window.api.getExtensionInfo();
  if (info?.path) $("#ext-path").textContent = info.path;
}

async function pollExtension() {
  const connected = await window.api.isExtensionConnected();
  const chip = $("#ext-chip");
  const detail = $("#ext-detail");
  if (connected) {
    chip.className = "chip ok";
    chip.textContent = "✓ connected";
    detail.textContent = "The extension is talking to Sotto.";
  } else {
    chip.className = "chip warn";
    chip.textContent = "not detected";
    detail.textContent =
      "Polling for heartbeat every 2s. Reload your Chrome tab after installing.";
  }
}

function startExtensionPolling() {
  hydrateExtensionStep();
  pollExtension();
  if (extensionPollTimer) clearInterval(extensionPollTimer);
  extensionPollTimer = setInterval(pollExtension, 2000);
}

function stopExtensionPolling() {
  if (extensionPollTimer) {
    clearInterval(extensionPollTimer);
    extensionPollTimer = null;
  }
}

$("#ext-copy").addEventListener("click", () => {
  window.api.copyToClipboard($("#ext-path").textContent);
  $("#ext-copy").textContent = "Copied";
  setTimeout(() => ($("#ext-copy").textContent = "Copy"), 1200);
});
$("#ext-open-page").addEventListener("click", () => window.api.openExtensionPage());
$("#ext-open-folder").addEventListener("click", () => window.api.openExtensionFolder());

// ── Footer navigation ───────────────────────────────────────────────────────
$("#btn-back").addEventListener("click", () => showStep(current - 1));
$("#btn-skip").addEventListener("click", () => showStep(current + 1));
$("#btn-next").addEventListener("click", async () => {
  if (current === 2) {
    const ok = await saveStep2();
    if (!ok) return; // user must fix or clear the invalid key
  }
  if (current === TOTAL_STEPS) {
    window.api.finish();
    return;
  }
  showStep(current + 1);
});

function updateNextEnabled() {
  const btn = $("#btn-next");
  if (current === 1) {
    btn.disabled = !licenseAccepted;
  } else {
    btn.disabled = false;
  }
}

// ── Init ─────────────────────────────────────────────────────────────────────
hydrateKeys();
showStep(1);
