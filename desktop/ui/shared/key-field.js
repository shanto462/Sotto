// OpenRouter API-key field, shared by the onboarding and settings windows.
// Classic script: exposes window.KeyField.mount(host, options).
//
// States: empty → (typing) → checking → valid | invalid | network, plus
// "saved" when the keychain already holds a key and the field is empty.
// The key itself only ever lives in the <input> and this closure: it is never
// logged or written into the DOM as text.

(function () {
  const EYE =
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true">' +
    '<path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8Z"/>' +
    '<circle cx="8" cy="8" r="2"/></svg>';
  const EYE_OFF =
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true">' +
    '<path d="M1.5 8s2.4-4.5 6.5-4.5c1.2 0 2.3.4 3.2.9M14.5 8s-2.4 4.5-6.5 4.5c-1.2 0-2.3-.4-3.2-.9"/>' +
    '<path d="M2.5 13.5 13.5 2.5"/></svg>';

  const DEBOUNCE_MS = 700;

  /**
   * @param {HTMLElement} host  Empty container to render into.
   * @param {object} opts
   * @param {object} opts.api            window.api (testSecret, saveSecret, getSecretInfo)
   * @param {string} [opts.service]      Secret name, default "openrouter".
   * @param {string} [opts.inputId]      id for the <input> (for <label for>).
   * @param {(state: string) => void} [opts.onState]
   */
  function mount(host, opts) {
    const api = opts.api;
    const service = opts.service || "openrouter";
    const inputId = opts.inputId || `key-${service}`;

    host.classList.add("key-field");
    host.innerHTML = `
      <div class="key-input-wrap">
        <input class="input mono" id="${inputId}" type="password"
               autocomplete="off" autocapitalize="off" autocorrect="off"
               spellcheck="false" placeholder="sk-or-v1-…"
               aria-describedby="${inputId}-status" />
        <button type="button" class="btn btn-ghost reveal" aria-label="Show key"
                title="Show key">${EYE}</button>
      </div>
      <div class="key-status" id="${inputId}-status" data-state="empty"
           role="status" aria-live="polite">
        <span class="glyph" hidden></span>
        <span class="spinner" hidden></span>
        <span class="msg"></span>
        <button type="button" class="btn btn-link retry" hidden>Try Again</button>
      </div>`;

    const input = host.querySelector("input");
    const reveal = host.querySelector(".reveal");
    const statusEl = host.querySelector(".key-status");
    const glyph = statusEl.querySelector(".glyph");
    const spin = statusEl.querySelector(".spinner");
    const msg = statusEl.querySelector(".msg");
    const retry = statusEl.querySelector(".retry");

    let state = "empty";
    let saved = false;
    let seq = 0; // drops responses from superseded checks
    let timer = null;
    let checkedValue = null; // value the current valid/invalid state refers to
    let inflight = null;

    function render(next, text, { showRetry = false } = {}) {
      state = next;
      statusEl.dataset.state = next;
      const glyphs = { valid: "✓", saved: "✓", invalid: "✕", network: "!" };
      glyph.hidden = !glyphs[next];
      glyph.textContent = glyphs[next] || "";
      spin.hidden = next !== "checking";
      msg.textContent = text || "";
      retry.hidden = !showRetry;
      input.classList.toggle("is-invalid", next === "invalid");
      opts.onState?.(next);
    }

    function idle() {
      if (saved) {
        render("saved", "A key is saved in your keychain. Paste a new one to replace it.");
      } else {
        render("empty", "Paste your OpenRouter key. It starts with sk-or-.");
      }
    }

    // Defensive: never let a server message echo the key back into the DOM.
    function scrub(text, value) {
      if (!text) return "";
      return value && text.includes(value) ? text.split(value).join("…") : text;
    }

    async function runCheck() {
      clearTimeout(timer);
      timer = null;
      const value = input.value.trim();
      if (!value) {
        checkedValue = null;
        idle();
        return state;
      }
      if (value === checkedValue && (state === "valid" || state === "invalid")) {
        return state;
      }
      const my = ++seq;
      render("checking", "Checking with OpenRouter…");
      let r;
      try {
        r = await api.testSecret(service, value);
      } catch {
        r = { ok: false, reason: "network", error: "Couldn't reach OpenRouter." };
      }
      if (my !== seq) return state; // superseded by newer input
      if (r?.ok) {
        checkedValue = value;
        let text = "Key works.";
        if (r.isFreeTier) text = "Key works (free tier).";
        if (typeof r.limitRemaining === "number") {
          text += ` $${r.limitRemaining.toFixed(2)} left on this key's limit.`;
        }
        render("valid", text);
      } else if (r?.reason === "network") {
        checkedValue = null;
        render("network", scrub(r.error, value) || "Couldn't reach OpenRouter.", {
          showRetry: true,
        });
      } else {
        checkedValue = value;
        let text = scrub(r?.error, value) || "OpenRouter rejected this key.";
        if (!value.startsWith("sk-or-")) text += " OpenRouter keys start with sk-or-.";
        render("invalid", text);
      }
      return state;
    }

    function check() {
      inflight = runCheck().finally(() => (inflight = null));
      return inflight;
    }

    input.addEventListener("input", () => {
      clearTimeout(timer);
      seq++; // invalidate any in-flight check for an older value
      if (!input.value.trim()) {
        checkedValue = null;
        idle();
        return;
      }
      render("typing", "");
      timer = setTimeout(check, DEBOUNCE_MS);
    });
    input.addEventListener("paste", () => setTimeout(check, 0));
    retry.addEventListener("click", () => {
      checkedValue = null;
      check();
    });
    reveal.addEventListener("click", () => {
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      reveal.innerHTML = show ? EYE_OFF : EYE;
      reveal.setAttribute("aria-label", show ? "Hide key" : "Show key");
      reveal.title = show ? "Hide key" : "Show key";
    });

    async function refreshSaved() {
      try {
        const info = await api.getSecretInfo();
        saved = !!info?.[service];
      } catch {
        saved = false;
      }
      if (!input.value.trim()) idle();
      return saved;
    }

    return {
      input,
      /** Current state name. */
      get state() {
        return state;
      },
      get hasSaved() {
        return saved;
      },
      get hasValue() {
        return !!input.value.trim();
      },
      /** Run (or finish) the check now; resolves to the resulting state. */
      async validate() {
        if (timer || state === "typing") return check();
        if (inflight) return inflight;
        if (input.value.trim() && state !== "valid" && state !== "invalid") return check();
        return state;
      },
      /** Save the validated key to the keychain and clear the field. */
      async save() {
        const value = input.value.trim();
        if (!value || state !== "valid" || value !== checkedValue) return false;
        await api.saveSecret(service, value);
        input.value = "";
        input.type = "password";
        reveal.innerHTML = EYE;
        checkedValue = null;
        saved = true;
        render("saved", "Saved in your keychain.");
        return true;
      },
      /** Delete the stored key. */
      async remove() {
        await api.saveSecret(service, "");
        saved = false;
        input.value = "";
        checkedValue = null;
        idle();
      },
      refreshSaved,
      focus() {
        input.focus();
      },
    };
  }

  window.KeyField = { mount };
})();
