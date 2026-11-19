// Model choice helpers and a searchable model picker, shared by the
// onboarding and settings windows. Classic script: exposes window.SottoModels.
//
// Model entries come from window.api.listModels():
//   { id, name, created, contextLength, maxOutput, supportedEfforts: string[] }
// Nothing here names a specific model: defaults are computed from the list.

(function () {
  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /** 1000000 → "1M", 128000 → "128K". */
  function tokens(n) {
    if (typeof n !== "number" || !isFinite(n) || n <= 0) return "";
    if (n >= 1e6) return `${+(n / 1e6).toFixed(n % 1e6 ? 1 : 0)}M`;
    if (n >= 1e3) return `${Math.round(n / 1e3)}K`;
    return String(n);
  }

  function meta(m) {
    const parts = [];
    if (m?.contextLength) parts.push(`${tokens(m.contextLength)} context`);
    if (m?.maxOutput) parts.push(`${tokens(m.maxOutput)} output`);
    return parts.join(" · ");
  }

  const byNewest = (a, b) => (b.created ?? 0) - (a.created ?? 0);
  // Prefer plain ids over routing variants such as ":batch" for defaults.
  const plainFirst = (list) => {
    const plain = list.filter((m) => !m.id.includes(":"));
    return plain.length ? plain : list;
  };

  /** Default chat model: the newest Sonnet, else the newest model in the list. */
  function defaultChat(chat) {
    const list = plainFirst([...(chat || [])].sort(byNewest));
    return list.find((m) => /sonnet/i.test(m.id)) || list[0] || null;
  }

  /** Default transcription model: the newest "-flash-lite", else the newest. */
  function defaultAudio(audio) {
    const list = plainFirst([...(audio || [])].sort(byNewest));
    return list.find((m) => /-flash-lite$/i.test(m.id)) || list[0] || null;
  }

  /** Keep `current` if the model supports it; otherwise the model's default. */
  function chooseEffort(model, current) {
    const efforts = model?.supportedEfforts || [];
    if (!efforts.length) return null;
    if (current && efforts.includes(current)) return current;
    if (model.defaultEffort && efforts.includes(model.defaultEffort)) return model.defaultEffort;
    return efforts[Math.floor((efforts.length - 1) / 2)];
  }

  /** Display label for an effort value ("none" means thinking off). */
  function effortLabel(e) {
    if (e === "none") return "Off";
    return e === "xhigh" ? "Extra High" : e[0].toUpperCase() + e.slice(1);
  }

  /**
   * Max tokens after switching models: follow the new model's maximum unless
   * the saved value was a custom one (anything other than unset or the
   * previous model's maximum).
   */
  function autoMaxTokens(prevModel, nextModel, savedMax) {
    const followsModel = savedMax == null || (prevModel && savedMax === prevModel.maxOutput);
    return followsModel ? (nextModel?.maxOutput ?? null) : savedMax;
  }

  const SEARCH_ICON =
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">' +
    '<circle cx="7" cy="7" r="4.5"/><path d="m10.5 10.5 3 3"/></svg>';

  /**
   * Searchable single-choice list.
   *
   * @param {HTMLElement} host
   * @param {object} opts
   * @param {string} opts.label            Accessible name of the list.
   * @param {string} [opts.noneLabel]      Adds a "none" row (selects null).
   * @param {(model: object|null) => void} [opts.onSelect]
   */
  function mountPicker(host, opts) {
    host.classList.add("picker");
    host.innerHTML = `
      <div class="picker-search">
        ${SEARCH_ICON}
        <input type="search" class="input" placeholder="Search" aria-label="Search ${esc(opts.label)}"
               autocomplete="off" spellcheck="false" />
      </div>
      <div class="picker-list" role="listbox" tabindex="0" aria-label="${esc(opts.label)}"></div>
      <div class="picker-state" hidden></div>
      <div class="picker-locked" hidden></div>`;

    const search = host.querySelector("input");
    const listEl = host.querySelector(".picker-list");
    const stateEl = host.querySelector(".picker-state");
    const lockedEl = host.querySelector(".picker-locked");

    let items = [];
    let selectedId = null;
    let locked = false;

    function visible() {
      const q = search.value.trim().toLowerCase();
      const rows = items.filter(
        (m) => !q || m.id.toLowerCase().includes(q) || (m.name || "").toLowerCase().includes(q),
      );
      return opts.noneLabel && !q ? [null, ...rows] : rows;
    }

    function render() {
      const rows = visible();
      if (!rows.length) {
        listEl.innerHTML = `<div class="picker-empty">No models match “${esc(search.value.trim())}”.</div>`;
        return;
      }
      listEl.innerHTML = rows
        .map((m) => {
          const id = m ? m.id : "";
          const sel = (m ? m.id : null) === selectedId;
          const name = m ? m.name || m.id : opts.noneLabel;
          return `
            <div class="picker-row${sel ? " selected" : ""}${m ? "" : " none"}" role="option"
                 aria-selected="${sel}" data-id="${esc(id)}">
              <span class="picker-check" aria-hidden="true">${sel ? "✓" : ""}</span>
              <div class="picker-main">
                <div class="picker-name">${esc(name)}</div>
                ${m ? `<div class="picker-id">${esc(m.id)}</div>` : ""}
              </div>
              ${m ? `<div class="picker-meta">${esc(meta(m))}</div>` : ""}
            </div>`;
        })
        .join("");
      listEl.querySelector(".selected")?.scrollIntoView({ block: "nearest" });
    }

    function choose(id, { silent = false } = {}) {
      if (locked) return;
      const model = id ? items.find((m) => m.id === id) || null : null;
      selectedId = model ? model.id : null;
      render();
      if (!silent) opts.onSelect?.(model);
    }

    function move(delta) {
      const rows = visible();
      if (!rows.length) return;
      const ids = rows.map((m) => (m ? m.id : null));
      let i = ids.indexOf(selectedId);
      i = i < 0 ? (delta > 0 ? 0 : ids.length - 1) : Math.min(ids.length - 1, Math.max(0, i + delta));
      choose(ids[i]);
    }

    listEl.addEventListener("click", (e) => {
      const row = e.target.closest(".picker-row");
      if (row) choose(row.dataset.id || null);
    });
    const onArrows = (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        move(e.key === "ArrowDown" ? 1 : -1);
      }
    };
    listEl.addEventListener("keydown", onArrows);
    search.addEventListener("keydown", onArrows);
    search.addEventListener("input", render);

    return {
      setItems(list) {
        items = [...(list || [])].sort(byNewest);
        stateEl.hidden = true;
        listEl.hidden = locked;
        render();
      },
      select(id, o) {
        choose(id, o);
      },
      get selected() {
        return selectedId ? items.find((m) => m.id === selectedId) || null : null;
      },
      get selectedId() {
        return selectedId;
      },
      find(id) {
        return items.find((m) => m.id === id) || null;
      },
      setLoading() {
        listEl.hidden = true;
        stateEl.hidden = false;
        stateEl.innerHTML = `<span class="spinner"></span><span>Loading models from OpenRouter…</span>`;
      },
      setError(message, onRetry) {
        listEl.hidden = true;
        stateEl.hidden = false;
        stateEl.innerHTML = `<span class="picker-err">${esc(message || "Couldn't load models.")}</span>
          <button type="button" class="btn btn-sm">Try Again</button>`;
        stateEl.querySelector("button").addEventListener("click", onRetry);
      },
      /** Show a value fixed by .env instead of the list. */
      setLocked(value, note) {
        locked = true;
        selectedId = value;
        host.querySelector(".picker-search").hidden = true;
        listEl.hidden = true;
        stateEl.hidden = true;
        lockedEl.hidden = false;
        lockedEl.innerHTML = `<code>${esc(value)}</code><span class="chip">${esc(note || "Set by .env")}</span>`;
      },
      get locked() {
        return locked;
      },
    };
  }

  /** Render effort choices into a .seg container; hides `row` when none apply. */
  function renderEffort(seg, row, model, current, onPick) {
    const efforts = model?.supportedEfforts || [];
    row.hidden = !efforts.length;
    seg.innerHTML = efforts
      .map(
        (e) =>
          `<button type="button" class="seg-btn${e === current ? " active" : ""}" role="radio"
                   aria-checked="${e === current}" data-value="${esc(e)}">${esc(effortLabel(e))}</button>`,
      )
      .join("");
    seg.querySelectorAll(".seg-btn").forEach((b) =>
      b.addEventListener("click", () => {
        seg.querySelectorAll(".seg-btn").forEach((x) => {
          const on = x === b;
          x.classList.toggle("active", on);
          x.setAttribute("aria-checked", String(on));
        });
        onPick(b.dataset.value);
      }),
    );
  }

  window.SottoModels = {
    tokens,
    meta,
    defaultChat,
    defaultAudio,
    chooseEffort,
    effortLabel,
    autoMaxTokens,
    mountPicker,
    renderEffort,
  };
})();
