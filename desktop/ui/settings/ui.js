const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

let settings = null;
let toastTimer = null;

// ── Tabs ────────────────────────────────────────────────────────────────────
$$(".tab").forEach((el) => {
  el.addEventListener("click", () => openTab(el.dataset.tab));
});

function openTab(name) {
  $$(".tab").forEach((el) => el.classList.toggle("active", el.dataset.tab === name));
  $$(".pane").forEach((p) => (p.hidden = p.dataset.pane !== name));
  if (name === "api") loadKeyStatuses();
  if (name === "extension") loadExtensionStatus();
  if (name === "about") loadAboutInfo();
}

window.api?.onTabOpen((tab) => openTab(tab));

// ── Toast ───────────────────────────────────────────────────────────────────
function toast(text) {
  const el = $("#toast");
  el.textContent = text;
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add("show"));
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => (el.hidden = true), 250);
  }, 1500);
}

// ── General tab bindings ────────────────────────────────────────────────────
async function init() {
  settings = await window.api.getSettings();
  renderGeneral();
}

function renderGeneral() {
  // Segmented (theme)
  $$(`.seg[data-setting="theme"] .seg-btn`).forEach((b) => {
    b.classList.toggle("active", b.dataset.value === settings.theme);
    b.onclick = () => updateSetting({ theme: b.dataset.value });
  });

  // Sliders
  setSlider("opacity", settings.opacity, (v) => `${v}%`);
  setSlider("fontSize", settings.fontSize, (v) => `${v} px`);

  // Toggles
  setToggle("autoLaunch", settings.autoLaunch);
  setToggle("showNotifications", settings.showNotifications);
  setToggle("positionOverChrome", settings.positionOverChrome);
  setToggle("persistHistory", settings.persistHistory);
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

// ── API tab ─────────────────────────────────────────────────────────────────
async function loadKeyStatuses() {
  const info = await window.api.getSecretInfo();
  setKeyChip("anthropic-status", info?.anthropic);
  setKeyChip("openai-status", info?.openai);
}

function setKeyChip(id, present) {
  const el = document.getElementById(id);
  if (!el) return;
  if (present) {
    el.className = "chip ok";
    el.textContent = "saved";
  } else {
    el.className = "chip warn";
    el.textContent = "not set";
  }
}

$$(".reveal").forEach((btn) => {
  btn.addEventListener("click", () => {
    const input = document.getElementById(btn.dataset.target);
    if (!input) return;
    input.type = input.type === "password" ? "text" : "password";
  });
});

async function saveKey(service, inputId, chipId) {
  const input = document.getElementById(inputId);
  const value = input.value.trim();
  if (!value) return;
  const chip = document.getElementById(chipId);
  chip.className = "chip accent";
  chip.textContent = "checking…";
  const r = await window.api.testSecret(service, value);
  if (!r?.ok) {
    chip.className = "chip danger";
    chip.textContent = r?.error || "invalid";
    return;
  }
  await window.api.saveSecret(service, value);
  input.value = "";
  chip.className = "chip ok";
  chip.textContent = "saved";
  toast("Saved");
}

$("#save-anthropic")?.addEventListener("click", () =>
  saveKey("anthropic", "key-anthropic-set", "anthropic-status"),
);
$("#save-openai")?.addEventListener("click", () =>
  saveKey("openai", "key-openai-set", "openai-status"),
);

// ── Extension tab ──────────────────────────────────────────────────────────
async function loadExtensionStatus() {
  const ok = await window.api.isExtensionConnected();
  const chip = $("#ext-set-chip");
  chip.className = "chip " + (ok ? "ok" : "warn");
  chip.textContent = ok ? "✓ connected" : "not detected";
}

$("#ext-open-page")?.addEventListener("click", () => window.api.openExtensionPage());
$("#ext-open-folder")?.addEventListener("click", () => window.api.openExtensionFolder());

// ── About tab ──────────────────────────────────────────────────────────────
async function loadAboutInfo() {
  const info = await window.api.getAppInfo();
  const host = $("#about-info");
  host.innerHTML = `
    <div class="about-row"><span>Version</span><span>${info?.version ?? "—"}</span></div>
    <div class="about-row"><span>Electron</span><span>${info?.electron ?? "—"}</span></div>
    <div class="about-row"><span>Node</span><span>${info?.node ?? "—"}</span></div>
    <div class="about-row"><span>Platform</span><span>${info?.platform ?? "—"}</span></div>
    <div class="about-row"><span>userData</span><span title="${info?.userData ?? ""}">${(info?.userData ?? "").slice(-44)}</span></div>
  `;
}

$("#rerun-onboarding")?.addEventListener("click", () => {
  window.api.reRunOnboarding();
});
$("#open-repo")?.addEventListener("click", () =>
  window.api.openExternal("https://github.com/shanto462/Sotto"),
);

init();
