const contentEl = document.getElementById("content");
const footerEl = document.getElementById("footer");
const railEl = document.getElementById("rail");
const railListEl = document.getElementById("rail-list");
const sourceChipEl = document.getElementById("source-chip");
const promptChipEl = document.getElementById("prompt-chip");
const promptToastEl = document.getElementById("prompt-toast");

// ── Theme ────────────────────────────────────────────────────────────────────
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme || "dark";
}
window.api.getTheme().then(applyTheme).catch(() => applyTheme("dark"));
window.api.onThemeChange(applyTheme);

// ── Active prompt ────────────────────────────────────────────────────────────
window.api
  .getActivePrompt()
  .then((p) => p && (promptChipEl.textContent = p.name))
  .catch(() => {});
window.api.onPromptActive((p) => {
  promptChipEl.textContent = p.name;
});
window.api.onPromptToast(({ name }) => {
  promptToastEl.textContent = `Prompt mode: ${name}`;
  promptToastEl.classList.add("show");
  clearTimeout(window.__promptToastTimer);
  window.__promptToastTimer = setTimeout(
    () => promptToastEl.classList.remove("show"),
    1400,
  );
});

// ── Click-through ↔ interactive toggle ───────────────────────────────────────
let clickThrough = true;
let dragging = null; // { x, y } screen point where a move/resize drag began
function setClickThrough(value) {
  if (value === clickThrough) return;
  clickThrough = value;
  if (value) window.api.setIgnoreMouseEvents(true, { forward: true });
  else window.api.setIgnoreMouseEvents(false);
}
document.addEventListener("mousemove", () => setClickThrough(false));
// Stay interactive while dragging, even when the pointer leaves the window.
document.addEventListener("mouseleave", () => {
  if (!dragging) setClickThrough(true);
});
window.addEventListener("blur", () => {
  if (!dragging) setClickThrough(true);
});

// ── Move (top strip) and resize (bottom-right grip) ─────────────────────────
// Both report the pointer offset since the drag began; main applies it to
// the window bounds captured at the start, and saves the result.
function bindWindowDrag(el, mode) {
  el.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    el.classList.add("dragging");
    dragging = { x: e.screenX, y: e.screenY };
    window.api.overlayDragStart();
  });
  el.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    window.api.overlayDragTo(mode, e.screenX - dragging.x, e.screenY - dragging.y);
  });
  const end = (e) => {
    if (!dragging) return;
    dragging = null;
    el.classList.remove("dragging");
    if (el.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId);
    window.api.overlayDragEnd();
  };
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
}
bindWindowDrag(document.getElementById("strip"), "move");
bindWindowDrag(document.getElementById("grip"), "resize");
document.addEventListener("visibilitychange", () => {
  if (document.hidden) setClickThrough(true);
});

// ── Rendering ────────────────────────────────────────────────────────────────
const EMPTY_HTML = contentEl.innerHTML;

function renderEmpty() {
  contentEl.innerHTML = EMPTY_HTML;
  footerEl.innerHTML = "";
  setSourceChip(null);
}

function renderStatus(data) {
  if (data.state === "pending") {
    contentEl.innerHTML = `
      <div class="status">
        <div class="spinner"></div>
        <span>Capturing and asking Claude…</span>
      </div>
    `;
    footerEl.innerHTML = "";
  } else if (data.state === "transcribing") {
    contentEl.innerHTML = `
      <div class="status">
        <div class="spinner"></div>
        <span>Transcribing…</span>
      </div>
    `;
    footerEl.innerHTML = "";
  } else if (data.state === "asking") {
    contentEl.innerHTML = `
      <div class="status">
        <div class="spinner"></div>
        <span>Asking Claude…</span>
      </div>
      ${data.transcript ? `<div class="transcript">"${escapeHtml(data.transcript)}"</div>` : ""}
    `;
    footerEl.innerHTML = "";
  } else if (data.state === "error") {
    contentEl.innerHTML = `
      <div class="status status-error">
        <span>⚠ ${escapeHtml(data.error || "Unknown error")}</span>
      </div>
    `;
    footerEl.innerHTML = "";
  }
}

function renderAnswer({ html, meta, source }) {
  setSourceChip(source);
  const transcript = meta?.transcript
    ? `<div class="transcript">"${escapeHtml(meta.transcript)}"</div>`
    : "";
  contentEl.innerHTML = `${transcript}<div class="md">${html}</div>`;
  contentEl.scrollTop = 0;

  const parts = [];
  if (meta?.replayed) parts.push(`<span class="replayed">replayed</span>`);
  if (meta?.inputTokens != null) parts.push(`${meta.inputTokens.toLocaleString()} in`);
  if (meta?.outputTokens != null) parts.push(`${meta.outputTokens.toLocaleString()} out`);
  if (meta?.durationMs != null) parts.push(`${(meta.durationMs / 1000).toFixed(1)}s`);
  if (meta?.model) parts.push(meta.model);
  footerEl.innerHTML = parts.join(" · ");
}

function setSourceChip(source) {
  if (!source) {
    sourceChipEl.hidden = true;
    sourceChipEl.textContent = "";
    return;
  }
  sourceChipEl.hidden = false;
  sourceChipEl.textContent = source === "voice" ? "🎙 voice" : "📷 capture";
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ── History rail ────────────────────────────────────────────────────────────
function renderHistory(list) {
  if (!list || list.length === 0) {
    railListEl.innerHTML = `<div class="rail-empty">No history yet</div>`;
    return;
  }
  railListEl.innerHTML = list
    .map(
      (h) => `
      <div class="rail-item" data-id="${h.id}">
        <div class="rail-time">${formatTime(h.timestamp)}</div>
        <div class="rail-q"><span class="rail-icon">${h.source === "voice" ? "🎙" : "📷"}</span>${escapeHtml(h.question || "(no preview)")}</div>
      </div>
    `,
    )
    .join("");
  railListEl.querySelectorAll(".rail-item").forEach((el) => {
    el.addEventListener("click", () => window.api.selectHistory(el.dataset.id));
  });
}

function formatTime(ts) {
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function toggleRail() {
  railEl.classList.toggle("collapsed");
}

// Initial load
window.api.getHistoryList().then(renderHistory).catch(() => {});

// ── Voice recording ─────────────────────────────────────────────────────────
let mediaRecorder = null;
let audioStream = null;
let audioChunks = [];
let audioCtx = null;
let analyser = null;
let waveformRAF = null;
let recStartedAt = 0;
let recTimerInterval = null;
let recLimitTimer = null;
let voiceBusy = false; // a clip is being transcribed / answered

// Share the mic instead of taking it over. Chromium's echo cancellation,
// noise suppression and auto gain switch macOS into its voice-processing
// mode, which ducks other apps' audio and alters their mic signal (a call in
// Zoom or Meet, say). Raw capture leaves other apps alone; the transcription
// model doesn't need the clean-up.
const MIC_CONSTRAINTS = {
  audio: {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    channelCount: 1,
  },
};

window.api.onVoiceToggle(async (opts) => {
  if (mediaRecorder?.state === "recording") {
    stopRecording();
    return;
  }
  if (voiceBusy) return; // mid-transcription, ignore
  await startRecording(opts?.maxSec);
});

function releaseMic() {
  audioStream?.getTracks().forEach((t) => t.stop());
  audioStream = null;
  teardownWaveform();
  stopTimer();
  if (recLimitTimer) clearTimeout(recLimitTimer);
  recLimitTimer = null;
}

async function startRecording(maxSec) {
  try {
    audioStream = await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS);
  } catch (e) {
    const busy = e?.name === "NotReadableError";
    contentEl.innerHTML = `
      <div class="status status-error">
        <span>⚠ ${
          busy
            ? "The microphone couldn't be opened. Another app may be holding it exclusively."
            : "Microphone access denied. Grant it in System Settings → Privacy &amp; Security → Microphone."
        }</span>
      </div>
    `;
    return;
  }
  audioChunks = [];
  const mime = pickAudioMime();
  mediaRecorder = mime
    ? new MediaRecorder(audioStream, { mimeType: mime })
    : new MediaRecorder(audioStream);

  mediaRecorder.ondataavailable = (e) => {
    if (e.data?.size > 0) audioChunks.push(e.data);
  };
  mediaRecorder.onstop = async () => {
    // Give the mic back the moment recording ends, before any processing.
    releaseMic();
    const blob = new Blob(audioChunks, {
      type: mediaRecorder.mimeType || "audio/webm",
    });
    audioChunks = [];
    if (blob.size === 0) return;
    voiceBusy = true;
    try {
      const wav = await toWav16kMono(await blob.arrayBuffer());
      window.api.sendAudio(wav);
    } catch (err) {
      voiceBusy = false;
      renderStatus({ state: "error", error: `Couldn't read the recording: ${err?.message ?? err}` });
    }
  };
  mediaRecorder.start();
  recStartedAt = Date.now();
  if (maxSec > 0) recLimitTimer = setTimeout(stopRecording, maxSec * 1000);
  renderRecordingUI();
  startWaveform();
  startTimer();
}

function stopRecording() {
  if (mediaRecorder?.state === "recording") mediaRecorder.stop();
  stopTimer();
}

// Decode the recording and re-encode it as 16 kHz mono 16-bit WAV, the one
// audio format OpenRouter documents for every audio-capable model. 16 kHz
// mono is plenty for speech and keeps a 30 s clip around 1 MB.
async function toWav16kMono(arrayBuffer) {
  const RATE = 16000;
  const decodeCtx = new OfflineAudioContext(1, 1, RATE);
  const decoded = await decodeCtx.decodeAudioData(arrayBuffer);
  const length = Math.ceil(decoded.duration * RATE);
  const ctx = new OfflineAudioContext(1, Math.max(length, 1), RATE);
  const src = ctx.createBufferSource();
  src.buffer = decoded;
  src.connect(ctx.destination); // downmixes to mono
  src.start();
  const samples = (await ctx.startRendering()).getChannelData(0);

  const out = new DataView(new ArrayBuffer(44 + samples.length * 2));
  const str = (o, t) => [...t].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  out.setUint32(4, 36 + samples.length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  out.setUint32(16, 16, true); // PCM chunk size
  out.setUint16(20, 1, true); // PCM
  out.setUint16(22, 1, true); // mono
  out.setUint32(24, RATE, true);
  out.setUint32(28, RATE * 2, true); // byte rate
  out.setUint16(32, 2, true); // block align
  out.setUint16(34, 16, true); // bits per sample
  str(36, "data");
  out.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    out.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
  }
  return out.buffer;
}

function pickAudioMime() {
  const cands = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  for (const m of cands) if (MediaRecorder.isTypeSupported?.(m)) return m;
  return null;
}

function renderRecordingUI() {
  contentEl.innerHTML = `
    <div class="voice-rec">
      <div class="voice-mic"><span class="rec-pulse"></span>🎙</div>
      <canvas id="waveform" width="380" height="64"></canvas>
      <div class="voice-status">
        <span id="rec-timer">0:00</span>
        <span class="voice-hint">Press <kbd>Ctrl+Shift+V</kbd> to stop</span>
      </div>
    </div>
  `;
  footerEl.textContent = "Recording…";
}

function startWaveform() {
  const canvas = document.getElementById("waveform");
  if (!canvas || !audioStream) return;
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  canvas.width = canvas.clientWidth * dpr;
  canvas.height = canvas.clientHeight * dpr;
  ctx.scale(dpr, dpr);

  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const source = audioCtx.createMediaStreamSource(audioStream);
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 1024;
  source.connect(analyser);

  const buf = new Uint8Array(analyser.frequencyBinCount);

  function draw() {
    if (!analyser) return;
    analyser.getByteTimeDomainData(buf);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);
    const bars = 48;
    const step = Math.floor(buf.length / bars);
    const barWidth = (w - bars * 2) / bars;
    ctx.fillStyle = "#7aa2ff";
    for (let i = 0; i < bars; i++) {
      let max = 0;
      for (let j = 0; j < step; j++) {
        const v = Math.abs(buf[i * step + j] - 128) / 128;
        if (v > max) max = v;
      }
      const bh = Math.max(2, max * h * 0.9);
      const x = i * (barWidth + 2);
      const y = (h - bh) / 2;
      ctx.fillRect(x, y, barWidth, bh);
    }
    waveformRAF = requestAnimationFrame(draw);
  }
  draw();
}

function teardownWaveform() {
  if (waveformRAF) cancelAnimationFrame(waveformRAF);
  waveformRAF = null;
  analyser?.disconnect?.();
  analyser = null;
  audioCtx?.close?.();
  audioCtx = null;
}

function startTimer() {
  stopTimer();
  recTimerInterval = setInterval(() => {
    const el = document.getElementById("rec-timer");
    if (!el) return;
    const s = Math.floor((Date.now() - recStartedAt) / 1000);
    el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }, 200);
}

function stopTimer() {
  if (recTimerInterval) clearInterval(recTimerInterval);
  recTimerInterval = null;
}

// ── Wire up ─────────────────────────────────────────────────────────────────
window.api.onStatus((data) => {
  if (data?.state === "error") voiceBusy = false; // unblock further voice toggles
  renderStatus(data);
});
window.api.onAnswer((data) => {
  voiceBusy = false; // unblock further voice toggles
  renderAnswer(data);
});
window.api.onHistoryUpdate(renderHistory);
window.api.onHistoryToggle(toggleRail);
window.api.onContentClear(renderEmpty);
