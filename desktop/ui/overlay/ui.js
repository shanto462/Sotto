const contentEl = document.getElementById("content");
const footerEl = document.getElementById("footer");
const railEl = document.getElementById("rail");
const railListEl = document.getElementById("rail-list");
const sourceChipEl = document.getElementById("source-chip");

// ── Click-through ↔ interactive toggle ───────────────────────────────────────
let clickThrough = true;
function setClickThrough(value) {
  if (value === clickThrough) return;
  clickThrough = value;
  if (value) window.api.setIgnoreMouseEvents(true, { forward: true });
  else window.api.setIgnoreMouseEvents(false);
}
document.addEventListener("mousemove", () => setClickThrough(false));
document.addEventListener("mouseleave", () => setClickThrough(true));
window.addEventListener("blur", () => setClickThrough(true));
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

window.api.onVoiceToggle(async () => {
  if (mediaRecorder?.state === "recording") {
    stopRecording();
    return;
  }
  if (audioChunks.length > 0) return; // mid-transcription, ignore
  await startRecording();
});

async function startRecording() {
  try {
    audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    contentEl.innerHTML = `
      <div class="status status-error">
        <span>⚠ Microphone access denied. Grant it in System Settings → Privacy → Microphone.</span>
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
    audioStream?.getTracks().forEach((t) => t.stop());
    teardownWaveform();
    const blob = new Blob(audioChunks, {
      type: mediaRecorder.mimeType || "audio/webm",
    });
    const buf = await blob.arrayBuffer();
    window.api.sendAudio(buf);
  };
  mediaRecorder.start();
  recStartedAt = Date.now();
  renderRecordingUI();
  startWaveform();
  startTimer();
}

function stopRecording() {
  if (mediaRecorder?.state === "recording") mediaRecorder.stop();
  stopTimer();
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
window.api.onStatus(renderStatus);
window.api.onAnswer((data) => {
  audioChunks = []; // unblock further voice toggles
  renderAnswer(data);
});
window.api.onHistoryUpdate(renderHistory);
window.api.onHistoryToggle(toggleRail);
window.api.onContentClear(renderEmpty);
