// Sotto Setup assistant (onboarding window).
// Steps: welcome → license → key → models → permissions → extension → done.

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const STEPS = $$(".page").map((el) => ({ id: el.dataset.step, title: el.dataset.title, el }));
const isMac = navigator.userAgent.includes("Mac");

let index = 0;
let furthest = 0;
let licenseAccepted = false;
let busy = false;
let permTimer = null;
let extTimer = null;
let permState = {};
let extConnected = false;

// ── Platform + theme ─────────────────────────────────────────────────────────
if (isMac) document.documentElement.classList.add("platform-mac");

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme || "dark";
}
window.api.getTheme().then(applyTheme).catch(() => applyTheme("dark"));
window.api.onThemeChange(applyTheme);

// ── Sidebar step list ────────────────────────────────────────────────────────
const stepList = $("#step-list");
STEPS.forEach((step, i) => {
  const li = document.createElement("li");
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "step-item";
  btn.innerHTML = `<span class="bullet"></span><span class="label"></span>`;
  btn.querySelector(".label").textContent = step.title;
  btn.addEventListener("click", () => goTo(i));
  li.appendChild(btn);
  stepList.appendChild(li);
  step.navBtn = btn;
});

function renderSidebar() {
  STEPS.forEach((step, i) => {
    const b = step.navBtn;
    b.classList.toggle("current", i === index);
    b.classList.toggle("complete", i !== index && i < furthest);
    b.disabled = i > furthest;
    if (i === index) b.setAttribute("aria-current", "step");
    else b.removeAttribute("aria-current");
  });
}

// ── Navigation ───────────────────────────────────────────────────────────────
const btnBack = $("#btn-back");
const btnNext = $("#btn-next");
const note = $("#bottom-note");

function current() {
  return STEPS[index].id;
}

function goTo(i, { focus = true } = {}) {
  if (i < 0 || i >= STEPS.length || i > furthest) return;
  index = i;
  STEPS.forEach((s, j) => (s.el.hidden = j !== index));
  renderSidebar();
  onEnter();
  updateFooter();
  if (focus) focusPage();
}

function focusPage() {
  const id = current();
  if (id === "key") {
    keyField.focus();
    return;
  }
  const heading = $("h1, h2", STEPS[index].el);
  heading?.focus({ preventScroll: true });
}

function onEnter() {
  const id = current();
  stopPolling();
  if (id === "permissions") {
    refreshPermissions();
    permTimer = setInterval(refreshPermissions, 1500);
  }
  if (id === "extension") {
    hydrateExtension();
    pollExtension();
    extTimer = setInterval(pollExtension, 2000);
  }
  if (id === "models") loadModels();
  if (id === "done") renderSummary();
}

function stopPolling() {
  clearInterval(permTimer);
  clearInterval(extTimer);
  permTimer = extTimer = null;
}

function updateFooter() {
  const id = current();
  btnBack.hidden = index === 0;
  btnNext.textContent =
    id === "welcome" ? "Get Started" : id === "done" ? "Start Using Sotto" : "Continue";

  let blocked = false;
  let text = "";
  if (id === "license") {
    blocked = !licenseAccepted;
    if (blocked) text = "Agree to the license to continue.";
  } else if (id === "key") {
    // Continue stays clickable while a check is pending: next() waits for it.
    const s = keyField.state;
    const pending = keyField.hasValue && (s === "typing" || s === "checking");
    blocked = !(s === "valid" || s === "saved" || pending);
    if (s === "empty") text = "An OpenRouter key is required.";
    if (s === "invalid") text = "Enter a working OpenRouter key to continue.";
    if (s === "network") text = "Check your connection, then try again.";
  } else if (id === "models") {
    blocked = !choice.model;
    if (models.error) text = "Models couldn't be loaded.";
    else if (!choice.model) text = "Choose a model to continue.";
    else if (!choice.transcriptionModel) text = "Without a transcription model, voice stays off.";
  } else if (id === "permissions") {
    const missing = ["screen", "mic", "accessibility"].filter((k) => permState[k] !== "granted");
    if (missing.length) text = "You can continue now and allow access later.";
  } else if (id === "extension") {
    if (!extConnected) text = "You can finish now and add the extension later.";
  }
  btnNext.disabled = blocked || busy;
  note.textContent = text;
}

async function next() {
  if (busy || btnNext.disabled) return;
  const id = current();

  if (id === "key") {
    busy = true;
    btnNext.disabled = true;
    try {
      const state = await keyField.validate();
      if (state === "valid") {
        await keyField.save();
      } else if (state !== "saved") {
        shake($("#key-field"));
        keyField.focus();
        return;
      }
    } finally {
      busy = false;
      updateFooter();
    }
  }

  if (id === "models") {
    busy = true;
    try {
      await saveModels();
    } finally {
      busy = false;
      updateFooter();
    }
  }

  if (id === "done") {
    stopPolling();
    window.api.finish();
    return;
  }

  furthest = Math.max(furthest, index + 1);
  goTo(index + 1);
}

function back() {
  if (index > 0) goTo(index - 1);
}

function shake(el) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  el.classList.remove("shake");
  void el.offsetWidth;
  el.classList.add("shake");
}

btnNext.addEventListener("click", next);
btnBack.addEventListener("click", back);

// Return = default button (Continue); ⌘[ = Go Back.
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.isComposing && !e.metaKey && !e.ctrlKey && !e.altKey) {
    const t = e.target;
    const tag = t?.tagName;
    // Buttons, links and checkboxes handle Return themselves.
    if (tag === "BUTTON" || tag === "A" || (tag === "INPUT" && t.type === "checkbox")) return;
    e.preventDefault();
    next();
  } else if (e.metaKey && e.key === "[") {
    e.preventDefault();
    back();
  }
});

// External links
$$("[data-href]").forEach((btn) => {
  btn.addEventListener("click", () => window.api.openExternal(btn.dataset.href));
});

// ── License ─────────────────────────────────────────────────────────────────
$("#license-accept").addEventListener("change", (e) => {
  licenseAccepted = e.target.checked;
  updateFooter();
});
$("#open-license").addEventListener("click", () => window.api.openLicense());

// ── OpenRouter key ──────────────────────────────────────────────────────────
const keyField = window.KeyField.mount($("#key-field"), {
  api: window.api,
  service: "openrouter",
  inputId: "key-openrouter",
  onState: () => updateFooter(),
});
keyField.refreshSaved();


// ── Models ──────────────────────────────────────────────────────────────────
// Choices come from OpenRouter's model list; nothing is hard-coded. Values set
// in .env are shown read-only.
const M = window.SottoModels;
const models = { loaded: false, loading: false, error: null, chat: [], audio: [] };
const choice = { model: null, effort: null, maxTokens: null, transcriptionModel: null };
let aiConfig = null;

const chatPicker = M.mountPicker($("#chat-picker"), {
  label: "Answer model",
  onSelect: (m) => {
    const prev = chatPicker.find(choice.model);
    choice.model = m?.id ?? null;
    choice.maxTokens = M.autoMaxTokens(prev, m, choice.maxTokens);
    if (!aiConfig?.overriddenByEnv?.effort) choice.effort = M.chooseEffort(m, choice.effort);
    renderEffortRow();
    updateFooter();
  },
});
const audioPicker = M.mountPicker($("#audio-picker"), {
  label: "Transcription model",
  noneLabel: "None (voice off)",
  onSelect: (m) => {
    choice.transcriptionModel = m?.id ?? null;
    updateFooter();
  },
});

function renderEffortRow() {
  const row = $("#effort-row");
  const lockedChip = $("#effort-locked");
  if (aiConfig?.overriddenByEnv?.effort) {
    row.hidden = false;
    $("#effort-seg").hidden = true;
    lockedChip.hidden = false;
    lockedChip.textContent = `${M.effortLabel(aiConfig.effort)} · Set by .env`;
    return;
  }
  $("#effort-seg").hidden = false;
  lockedChip.hidden = true;
  M.renderEffort($("#effort-seg"), row, chatPicker.find(choice.model), choice.effort, (v) => {
    choice.effort = v;
  });
}

async function loadModels({ force = false } = {}) {
  if (models.loading || (models.loaded && !force)) return;
  models.loading = true;
  models.error = null;
  chatPicker.setLoading();
  audioPicker.setLoading();
  updateFooter();

  let list;
  try {
    [list, aiConfig] = await Promise.all([window.api.listModels(), window.api.getAiConfig()]);
  } catch (e) {
    list = { ok: false, error: e?.message };
  }
  models.loading = false;

  const env = aiConfig?.overriddenByEnv || {};
  Object.assign(choice, {
    model: aiConfig?.model ?? null,
    effort: aiConfig?.effort ?? null,
    maxTokens: aiConfig?.maxTokens ?? null,
    transcriptionModel: aiConfig?.transcriptionModel ?? null,
  });

  if (!list?.ok) {
    models.error = list?.error || "Couldn't load models from OpenRouter.";
    const retry = () => loadModels({ force: true });
    if (env.model) chatPicker.setLocked(choice.model);
    else chatPicker.setError(models.error, retry);
    if (env.transcriptionModel) audioPicker.setLocked(choice.transcriptionModel);
    else audioPicker.setError(models.error, retry);
    // A model fixed by .env still lets setup continue.
    if (env.model) models.error = null;
    updateFooter();
    return;
  }

  models.loaded = true;
  models.chat = list.chat || [];
  models.audio = list.audio || [];
  chatPicker.setItems(models.chat);
  audioPicker.setItems(models.audio);

  // Chat model: saved / .env value, else the newest Sonnet (computed).
  if (env.model) {
    chatPicker.setLocked(choice.model);
  } else {
    const savedChat = choice.model && chatPicker.find(choice.model);
    const pick = savedChat || M.defaultChat(models.chat);
    chatPicker.select(pick?.id ?? null, { silent: true });
    const prevMax = choice.maxTokens;
    choice.model = pick?.id ?? null;
    if (!savedChat) choice.maxTokens = M.autoMaxTokens(null, pick, prevMax);
  }
  if (!env.effort) choice.effort = M.chooseEffort(chatPicker.find(choice.model), choice.effort);
  renderEffortRow();

  // Transcription: saved / .env value, else the newest "flash" model.
  if (env.transcriptionModel) {
    audioPicker.setLocked(choice.transcriptionModel);
  } else {
    const savedAudio = choice.transcriptionModel && audioPicker.find(choice.transcriptionModel);
    const pick = savedAudio || M.defaultAudio(models.audio);
    audioPicker.select(pick?.id ?? null, { silent: true });
    choice.transcriptionModel = pick?.id ?? null;
  }
  updateFooter();
}

async function saveModels() {
  const env = aiConfig?.overriddenByEnv || {};
  const patch = {};
  for (const key of ["model", "effort", "maxTokens", "transcriptionModel"]) {
    if (!env[key]) patch[key] = choice[key] ?? null;
  }
  await window.api.saveSettings({ ai: patch });
}

// Prefetch: the list is public, so it can load while the user reads.
loadModels();

// ── Permissions ─────────────────────────────────────────────────────────────
const PERM_COPY = {
  granted: { chip: "Allowed", cls: "ok" },
  denied: { chip: "Not Allowed", cls: "danger" },
  restricted: { chip: "Restricted", cls: "danger" },
  "not-determined": { chip: "Not Set", cls: "warn" },
  unknown: { chip: "Unknown", cls: "" },
};

async function refreshPermissions() {
  try {
    const p = await window.api.checkPermissions();
    permState = { screen: p?.screen, mic: p?.microphone, accessibility: p?.accessibility };
    for (const [name, status] of Object.entries(permState)) setPerm(name, status);
  } catch {
    /* ignore; next poll retries */
  }
  updateFooter();
}

function setPerm(name, status) {
  const row = $(`.perm[data-perm="${name}"]`);
  if (!row) return;
  const copy = PERM_COPY[status] || PERM_COPY.unknown;
  const chip = $(".perm-chip", row);
  chip.className = `chip perm-chip ${copy.cls}`;
  chip.textContent = copy.chip;

  const action = $(".perm-action", row);
  if (status === "granted") {
    action.hidden = true;
  } else {
    action.hidden = false;
    // Once macOS has recorded a "no", it won't prompt again; send the user to
    // System Settings. Accessibility never prompts after the first time either.
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
      const res = await window.api.requestPermission(row.dataset.kind);
      if (res?.requiresRestart) $("#perm-restart-banner").hidden = false;
    } catch {
      /* ignore */
    } finally {
      btn.disabled = false;
      refreshPermissions();
    }
  });
});
$("#perm-restart").addEventListener("click", () => window.api.restartApp());

window.api
  .getAppInfo()
  .then((info) => {
    $("#dev-mode-banner").hidden = !!info?.isPackaged || !isMac;
  })
  .catch(() => {});
if (!isMac) {
  $("#perm-sub").textContent = "Windows doesn't need extra permissions for Sotto.";
}

// ── Chrome extension ────────────────────────────────────────────────────────
async function hydrateExtension() {
  try {
    const info = await window.api.getExtensionInfo();
    if (info?.path) {
      $("#ext-path").textContent = info.path;
      $("#ext-path").title = info.path;
    }
  } catch {
    /* ignore */
  }
}

async function pollExtension() {
  try {
    extConnected = !!(await window.api.isExtensionConnected());
  } catch {
    extConnected = false;
  }
  const chip = $("#ext-chip");
  const detail = $("#ext-detail");
  if (extConnected) {
    chip.className = "chip ok";
    chip.textContent = "Connected";
    detail.textContent = "The extension is talking to Sotto.";
  } else {
    chip.className = "chip";
    chip.innerHTML = `<span class="spinner"></span>Waiting`;
    detail.textContent = "Waiting for the extension to connect…";
  }
  updateFooter();
}

$$(".ext-seg .seg-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    $$(".ext-seg .seg-btn").forEach((b) => {
      const on = b === btn;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", String(on));
    });
    $$(".ext-pane").forEach((p) => (p.hidden = p.dataset.pane !== btn.dataset.tab));
  });
});

$("#ext-copy").addEventListener("click", () => {
  window.api.copyToClipboard($("#ext-path").textContent);
  const b = $("#ext-copy");
  b.textContent = "Copied";
  setTimeout(() => (b.textContent = "Copy"), 1200);
});
$("#ext-open-page").addEventListener("click", () => window.api.openExtensionPage());
$("#ext-open-folder").addEventListener("click", () => window.api.openExtensionFolder());
if (!isMac) $("#ext-open-folder").textContent = "Show in Explorer";

// ── Done summary ────────────────────────────────────────────────────────────
async function renderSummary() {
  const set = (key, cls, text) => {
    const chip = $(`[data-sum="${key}"] .chip`);
    chip.className = `chip ${cls}`;
    chip.textContent = text;
  };

  const saved = await keyField.refreshSaved();
  set("key", saved ? "ok" : "danger", saved ? "Connected" : "Not set");

  const chosen = chatPicker.find(choice.model);
  set("model", choice.model ? "ok" : "danger", choice.model ? chosen?.name || choice.model : "Not chosen");

  try {
    const p = await window.api.checkPermissions();
    const granted = [p?.screen, p?.microphone, p?.accessibility].filter((s) => s === "granted").length;
    set("perms", granted === 3 ? "ok" : "warn", granted === 3 ? "All allowed" : `${granted} of 3 allowed`);
  } catch {
    set("perms", "", "Unknown");
  }

  try {
    const ok = await window.api.isExtensionConnected();
    set("ext", ok ? "ok" : "warn", ok ? "Connected" : "Not detected");
  } catch {
    set("ext", "", "Unknown");
  }
}

// ── Init ────────────────────────────────────────────────────────────────────
goTo(0, { focus: false });
