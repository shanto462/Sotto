// Sotto Settings window.
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));

const isMac = navigator.userAgent.includes("Mac");
if (isMac) document.documentElement.classList.add("platform-mac");

let settings = null;
let toastTimer = null;
let permTimer = null;

// ── Theme ───────────────────────────────────────────────────────────────────
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme || "dark";
}
window.api.getTheme().then(applyTheme).catch(() => applyTheme("dark"));
window.api.onThemeChange(applyTheme);

// ── Sidebar tabs ────────────────────────────────────────────────────────────
const tabs = $$(".tab");
tabs.forEach((el) => el.addEventListener("click", () => openTab(el.dataset.tab)));

// Arrow keys move through the sidebar like a source list.
$(".tabs").addEventListener("keydown", (e) => {
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
  e.preventDefault();
  const i = tabs.findIndex((t) => t.classList.contains("active"));
  const next = tabs[(i + (e.key === "ArrowDown" ? 1 : -1) + tabs.length) % tabs.length];
  openTab(next.dataset.tab);
  next.focus();
});

function openTab(name) {
  if (!tabs.some((t) => t.dataset.tab === name)) name = "general";
  tabs.forEach((el) => {
    const on = el.dataset.tab === name;
    el.classList.toggle("active", on);
    el.setAttribute("aria-selected", String(on));
    el.tabIndex = on ? 0 : -1;
  });
  $$(".pane").forEach((p) => (p.hidden = p.dataset.pane !== name));
  const pane = $(`.pane[data-pane="${name}"]`);
  $("#pane-title").textContent = pane?.dataset.title || "";
  $(".content-scroll").scrollTop = 0;

  clearInterval(permTimer);
  permTimer = null;
  if (name === "api") loadApiTab();
  if (name === "voice") loadVoiceTab();
  if (name === "prompts") loadPromptsTab();
  if (name === "permissions") {
    refreshPermissions();
    permTimer = setInterval(refreshPermissions, 2000);
  }
  if (name === "extension") loadExtensionStatus();
  if (name === "about") loadAboutInfo();
}

window.api?.onTabOpen((tab) => openTab(tab));
$$("[data-goto]").forEach((b) => b.addEventListener("click", () => openTab(b.dataset.goto)));
$$("[data-href]").forEach((b) =>
  b.addEventListener("click", () => window.api.openExternal(b.dataset.href)),
);

// ── Toast ───────────────────────────────────────────────────────────────────
function toast(text) {
  const el = $("#toast");
  el.textContent = text;
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add("show"));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => (el.hidden = true), 250);
  }, 1400);
}

// ── General ─────────────────────────────────────────────────────────────────
async function init() {
  settings = await window.api.getSettings();
  renderGeneral();
  openTab($(".tab.active")?.dataset.tab || "general");
}

function renderGeneral() {
  bindSeg("theme", settings.theme, (value) => ({ theme: value }));
  setSlider("opacity", settings.opacity, (v) => `${v}%`);
  setSlider("fontSize", settings.fontSize, (v) => `${v} px`);
  setToggle("autoLaunch", settings.autoLaunch);
  setToggle("showNotifications", settings.showNotifications);
  setToggle("positionOverChrome", settings.positionOverChrome);
  setToggle("persistHistory", settings.persistHistory);
}

function bindSeg(setting, value, toPatch) {
  const btns = $$(`.seg[data-setting="${setting}"] .seg-btn`);
  const mark = (v) =>
    btns.forEach((b) => {
      const on = b.dataset.value === v;
      b.classList.toggle("active", on);
      b.setAttribute("aria-checked", String(on));
      b.setAttribute("role", "radio");
    });
  mark(value);
  btns.forEach((b) => {
    b.onclick = () => {
      mark(b.dataset.value);
      updateSetting(toPatch(b.dataset.value));
    };
  });
}

function setSlider(id, value, format) {
  const input = document.getElementById(id);
  const val = document.getElementById(`${id}-val`);
  if (!input) return;
  input.value = value;
  val.textContent = format(value);
  input.oninput = () => (val.textContent = format(Number(input.value)));
  input.onchange = () => updateSetting({ [id]: Number(input.value) });
}

function setToggle(id, value) {
  const input = document.getElementById(id);
  if (!input) return;
  input.checked = !!value;
  input.onchange = () => updateSetting({ [id]: input.checked });
}

async function updateSetting(patch) {
  settings = await window.api.saveSettings(patch);
  toast("Saved");
}

// ── Prompts ─────────────────────────────────────────────────────────────────
async function loadPromptsTab() {
  if (!settings) settings = await window.api.getSettings();
  const prompts = await window.api.listPrompts();
  const host = document.getElementById("prompts-list");
  if (!host) return;
  host.innerHTML = prompts
    .map(
      (p) => `
        <button type="button" role="radio" class="prompt-card${p.id === settings.activePromptId ? " active" : ""}"
                data-id="${escapeHtml(p.id)}" aria-checked="${p.id === settings.activePromptId}">
          <div class="prompt-head">
            <span class="prompt-radio" aria-hidden="true"></span>
            <span class="prompt-name">${escapeHtml(p.name)}</span>
            ${p.hotkey ? `<kbd>${escapeHtml(p.hotkey.replace("Control+", "⌃"))}</kbd>` : ""}
          </div>
          <div class="prompt-desc">${escapeHtml(p.description || "")}</div>
          <pre class="prompt-body">${escapeHtml(p.body)}</pre>
        </button>`,
    )
    .join("");
  host.querySelectorAll(".prompt-card").forEach((card) => {
    card.addEventListener("click", () => {
      const id = card.dataset.id;
      window.api.selectPrompt(id);
      updateSetting({ activePromptId: id });
      host.querySelectorAll(".prompt-card").forEach((c) => {
        const on = c.dataset.id === id;
        c.classList.toggle("active", on);
        c.setAttribute("aria-checked", String(on));
      });
    });
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Voice ───────────────────────────────────────────────────────────────────
async function loadVoiceTab() {
  if (!settings) settings = await window.api.getSettings();
  const v = settings.voice || {};

  const enabled = document.getElementById("voice-enabled");
  enabled.checked = v.enabled !== false;
  enabled.onchange = () => updateSetting({ voice: { enabled: enabled.checked } });

  const max = document.getElementById("voice-max");
  const maxVal = document.getElementById("voice-max-val");
  max.value = v.maxRecordingSec ?? 30;
  maxVal.textContent = `${max.value} s`;
  max.oninput = () => (maxVal.textContent = `${max.value} s`);
  max.onchange = () => updateSetting({ voice: { maxRecordingSec: Number(max.value) } });

  const [info, cfg] = await Promise.all([window.api.getSecretInfo(), window.api.getAiConfig()]);
  const env = cfg?.overriddenByEnv?.transcriptionModel ? " (set by .env)" : "";
  $("#voice-transcription").textContent = cfg?.transcriptionModel
    ? cfg.transcriptionModel + env
    : "Not chosen. Voice is off until you pick one.";
  const problem = !info?.openrouter
    ? "Voice needs an OpenRouter key."
    : !cfg?.transcriptionModel
      ? "Voice isn't set up: choose a transcription model."
      : "";
  $("#voice-callout-text").textContent = problem;
  $("#voice-key-callout").hidden = !problem;
}

// ── API & Models ────────────────────────────────────────────────────────────
const saveBtn = $("#save-openrouter");
const removeBtn = $("#remove-openrouter");
let removeArmed = false;

const keyField = window.KeyField.mount($("#key-field"), {
  api: window.api,
  service: "openrouter",
  inputId: "key-openrouter-set",
  onState: (state) => {
    // Save is enabled once the typed key is valid (or still being checked).
    saveBtn.disabled = !(state === "valid" || state === "typing" || state === "checking");
    renderKeyChip();
  },
});

function renderKeyChip() {
  const chip = $("#openrouter-status");
  if (keyField.hasSaved) {
    chip.className = "chip ok";
    chip.textContent = "Saved";
  } else {
    chip.className = "chip warn";
    chip.textContent = "Not set";
  }
  removeBtn.hidden = !keyField.hasSaved;
}

keyField.input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    saveKey();
  }
});

async function saveKey() {
  saveBtn.disabled = true;
  const state = await keyField.validate();
  if (state === "valid" && (await keyField.save())) {
    toast("Key saved");
    renderKeyChip();
  }
}
saveBtn.addEventListener("click", saveKey);

removeBtn.addEventListener("click", async () => {
  // Two-step confirm, in place of a modal dialog.
  if (!removeArmed) {
    removeArmed = true;
    removeBtn.textContent = "Click Again to Remove";
    setTimeout(() => {
      removeArmed = false;
      removeBtn.textContent = "Remove Key…";
    }, 3000);
    return;
  }
  removeArmed = false;
  removeBtn.textContent = "Remove Key…";
  await keyField.remove();
  renderKeyChip();
  toast("Key removed");
});

async function loadApiTab() {
  await keyField.refreshSaved();
  renderKeyChip();
  loadModels();
}

// ── Models (answers, effort, max tokens, transcription) ─────────────────────
// Everything comes from OpenRouter's list and the saved settings; values set
// in .env are shown read-only.
const M = window.SottoModels;
let aiCfg = null;
let modelsLoading = false;

const chatPicker = M.mountPicker($("#chat-picker"), {
  label: "Answer model",
  onSelect: (m) => {
    const prev = chatPicker.find(aiCfg?.model);
    const patch = { model: m?.id ?? null };
    if (!aiCfg.overriddenByEnv.effort) patch.effort = M.chooseEffort(m, aiCfg.effort);
    if (!aiCfg.overriddenByEnv.maxTokens) {
      patch.maxTokens = M.autoMaxTokens(prev, m, aiCfg.maxTokens);
    }
    saveAi(patch);
  },
});
const audioPicker = M.mountPicker($("#audio-picker"), {
  label: "Transcription model",
  noneLabel: "None (voice off)",
  onSelect: (m) => saveAi({ transcriptionModel: m?.id ?? null }),
});

async function saveAi(patch) {
  Object.assign(aiCfg, patch);
  settings = await window.api.saveSettings({ ai: patch });
  renderEffort();
  renderMaxTokens();
  toast("Saved");
}

function renderEffort() {
  const row = $("#effort-row");
  const seg = $("#effort-seg");
  const lockedChip = $("#effort-locked");
  if (aiCfg?.overriddenByEnv?.effort) {
    row.hidden = false;
    seg.hidden = true;
    lockedChip.hidden = false;
    lockedChip.textContent = `${M.effortLabel(aiCfg.effort)} · Set by .env`;
    return;
  }
  seg.hidden = false;
  lockedChip.hidden = true;
  M.renderEffort(seg, row, chatPicker.find(aiCfg?.model), aiCfg?.effort, (v) =>
    saveAi({ effort: v }),
  );
}

const maxInput = $("#max-tokens");
function renderMaxTokens() {
  const locked = aiCfg?.overriddenByEnv?.maxTokens;
  const chip = $("#max-tokens-locked");
  maxInput.hidden = !!locked;
  chip.hidden = !locked;
  if (locked) {
    chip.textContent = `${aiCfg.maxTokens.toLocaleString()} · Set by .env`;
    return;
  }
  const model = chatPicker.find(aiCfg?.model);
  maxInput.max = model?.maxOutput || "";
  maxInput.placeholder = model?.maxOutput ? `${M.tokens(model.maxOutput)} (max)` : "Model max";
  if (document.activeElement !== maxInput) {
    maxInput.value = aiCfg?.maxTokens != null ? String(aiCfg.maxTokens) : "";
  }
}
maxInput.addEventListener("change", () => {
  const raw = maxInput.value.trim();
  const n = Number(raw);
  if (raw && !(Number.isInteger(n) && n > 0)) {
    maxInput.classList.add("is-invalid");
    return;
  }
  maxInput.classList.remove("is-invalid");
  const model = chatPicker.find(aiCfg?.model);
  const value = raw ? Math.min(n, model?.maxOutput || n) : null;
  maxInput.value = value != null ? String(value) : "";
  saveAi({ maxTokens: value });
});
maxInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") maxInput.blur();
});

async function loadModels() {
  if (modelsLoading) return;
  modelsLoading = true;
  chatPicker.setLoading();
  audioPicker.setLoading();
  let list;
  try {
    [list, aiCfg] = await Promise.all([window.api.listModels(), window.api.getAiConfig()]);
  } catch (e) {
    list = { ok: false, error: e?.message };
  } finally {
    modelsLoading = false;
  }
  aiCfg = aiCfg || { overriddenByEnv: {} };
  aiCfg.overriddenByEnv = aiCfg.overriddenByEnv || {};
  const env = aiCfg.overriddenByEnv;

  if (!list?.ok) {
    const msg = list?.error || "Couldn't load models from OpenRouter.";
    if (env.model) chatPicker.setLocked(aiCfg.model);
    else chatPicker.setError(msg, loadModels);
    if (env.transcriptionModel) audioPicker.setLocked(aiCfg.transcriptionModel);
    else audioPicker.setError(msg, loadModels);
  } else {
    chatPicker.setItems(list.chat);
    audioPicker.setItems(list.audio);
    if (env.model) chatPicker.setLocked(aiCfg.model);
    else chatPicker.select(aiCfg.model, { silent: true });
    if (env.transcriptionModel) audioPicker.setLocked(aiCfg.transcriptionModel);
    else audioPicker.select(aiCfg.transcriptionModel, { silent: true });
  }
  renderEffort();
  renderMaxTokens();
}

// ── Privacy (permissions) ───────────────────────────────────────────────────
const PERM_COPY = {
  granted: { chip: "Allowed", cls: "ok" },
  denied: { chip: "Not Allowed", cls: "danger" },
  restricted: { chip: "Restricted", cls: "danger" },
  "not-determined": { chip: "Not Set", cls: "warn" },
};

async function refreshPermissions() {
  let p;
  try {
    p = await window.api.checkPermissions();
  } catch {
    return;
  }
  const map = { screen: p?.screen, mic: p?.microphone, accessibility: p?.accessibility };
  for (const [name, status] of Object.entries(map)) {
    const row = $(`.perm[data-perm="${name}"]`);
    const copy = PERM_COPY[status] || { chip: "Unknown", cls: "" };
    const chip = $(".perm-chip", row);
    chip.className = `chip perm-chip ${copy.cls}`;
    chip.textContent = copy.chip;
    const action = $(".perm-action", row);
    action.hidden = status === "granted";
    const prompted = status === "denied" || status === "restricted";
    action.textContent = prompted ? "Open Settings…" : "Allow…";
    action.dataset.mode = prompted ? "settings" : "request";
  }
}

$$(".perm-action").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const row = btn.closest(".perm");
    if (btn.dataset.mode === "settings") {
      window.api.openSystemSettings(row.dataset.pane);
      return;
    }
    btn.disabled = true;
    try {
      await window.api.requestPermission(row.dataset.kind);
    } finally {
      btn.disabled = false;
      refreshPermissions();
    }
  });
});

// ── Extension ───────────────────────────────────────────────────────────────
async function loadExtensionStatus() {
  const ok = await window.api.isExtensionConnected();
  const chip = $("#ext-set-chip");
  chip.className = "chip " + (ok ? "ok" : "warn");
  chip.textContent = ok ? "Connected" : "Not detected";
}

$("#ext-open-page")?.addEventListener("click", () => window.api.openExtensionPage());
$("#ext-open-folder")?.addEventListener("click", () => window.api.openExtensionFolder());
if (!isMac) $("#ext-open-folder").textContent = "Show Extension Folder";

// ── About ───────────────────────────────────────────────────────────────────
async function loadAboutInfo() {
  const info = await window.api.getAppInfo();
  $("#about-version").textContent = info?.version ? `Version ${info.version}` : "";
  const rows = [
    ["Electron", info?.electron],
    ["Node", info?.node],
    ["Platform", info?.platform],
    ["Data folder", info?.userData],
  ];
  $("#about-info").innerHTML = rows
    .map(
      ([k, v]) =>
        `<div class="row-item"><span>${escapeHtml(k)}</span><span title="${escapeHtml(v ?? "")}">${escapeHtml(v ?? "—")}</span></div>`,
    )
    .join("");
}

$("#rerun-onboarding")?.addEventListener("click", () => window.api.reRunOnboarding());
$("#open-repo")?.addEventListener("click", () =>
  window.api.openExternal("https://github.com/shanto462/Sotto"),
);

init();
