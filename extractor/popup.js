(async () => {
  const inputEl = document.getElementById("input");
  const extractBtn = document.getElementById("extractBtn");
  const clearBtn = document.getElementById("clearBtn");
  const resultsEl = document.getElementById("results");
  const countLabel = document.getElementById("countLabel");
  const linkListEl = document.getElementById("linkList");
  const gridEl = document.getElementById("grid");
  const copyAllBtn = document.getElementById("copyAllBtn");
  const copyLinesBtn = document.getElementById("copyLinesBtn");
  const formFeedbackEl = document.getElementById("formFeedback");
  const formFeedbackText = document.getElementById("formFeedbackText");
  const formFeedbackIcon = document.getElementById("formFeedbackIcon");
  const historyListEl = document.getElementById("historyList");
  const historyEmptyEl = document.getElementById("historyEmpty");
  const clearHistoryBtn = document.getElementById("clearHistoryBtn");

  const STORAGE_DRAFT = "scarDraft";
  const STORAGE_HISTORY = "scarHistory";
  const MAX_HISTORY = 15;
  /** @type {number} Keep under extension storage quotas for huge pastes. */
  const MAX_PASTE_CHARS = 1_200_000;

  function storageLocalArea() {
    try {
      if (typeof browser !== "undefined" && browser.storage?.local) return browser.storage.local;
      if (typeof chrome !== "undefined" && chrome.storage?.local) return chrome.storage.local;
    } catch {
      /* ignore */
    }
    return null;
  }

  function extensionRuntime() {
    try {
      if (typeof browser !== "undefined" && browser.runtime?.sendMessage) return browser.runtime;
      if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) return chrome.runtime;
    } catch {
      /* ignore */
    }
    return null;
  }

  /**
   * @param {string | string[] | Record<string, boolean> | null} keys
   */
  async function storageLocalGet(keys) {
    const area = storageLocalArea();
    if (!area) return {};
    try {
      const pending = area.get(keys);
      if (pending != null && typeof pending.then === "function") return await pending;
      return await new Promise((resolve, reject) => {
        try {
          area.get(keys, (result) => {
            if (typeof chrome !== "undefined" && chrome.runtime?.lastError?.message) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            resolve(result ?? {});
          });
        } catch (e) {
          reject(e);
        }
      });
    } catch {
      return {};
    }
  }

  /** @param {Record<string, unknown>} items */
  async function storageLocalSet(items) {
    const area = storageLocalArea();
    if (!area) return;
    try {
      const pending = area.set(items);
      if (pending != null && typeof pending.then === "function") await pending;
      else {
        await new Promise((resolve, reject) => {
          area.set(items, () => {
            if (typeof chrome !== "undefined" && chrome.runtime?.lastError?.message) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            resolve();
          });
        });
      }
    } catch {
      /* ignore */
    }
  }

  /** @param {string | string[]} keys */
  async function storageLocalRemove(keys) {
    const area = storageLocalArea();
    if (!area?.remove) return;
    try {
      const pending = area.remove(keys);
      if (pending != null && typeof pending.then === "function") await pending;
      else {
        await new Promise((resolve, reject) => {
          area.remove(keys, () => {
            if (typeof chrome !== "undefined" && chrome.runtime?.lastError?.message) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            resolve();
          });
        });
      }
    } catch {
      /* ignore */
    }
  }

  /**
   * Same behavior as background.js when messaging is unavailable (SW asleep / invalid).
   * @param {string} type
   * @param {Record<string, unknown>} payload
   */
  async function persistDirect(type, payload) {
    if (!storageLocalArea()) return { ok: false };
    try {
      if (type === "SCAR_SAVE_DRAFT") {
        await storageLocalSet({ [STORAGE_DRAFT]: payload.draft });
        return { ok: true };
      }
      if (type === "SCAR_REMOVE_DRAFT") {
        await storageLocalRemove(STORAGE_DRAFT);
        return { ok: true };
      }
      if (type === "SCAR_CLEAR_HISTORY") {
        await storageLocalSet({ [STORAGE_HISTORY]: [] });
        return { ok: true };
      }
      if (type === "SCAR_APPEND_HISTORY") {
        const entry = /** @type {{ paste: string, urls: string[], baseUrl?: string }} */ (payload.entry);
        const maxHistory = /** @type {number} */ (payload.maxHistory);
        const got = await storageLocalGet(STORAGE_HISTORY);
        const raw = got[STORAGE_HISTORY];
        const list = Array.isArray(raw) ? raw : [];
        const prev = list[0];
        if (
          prev &&
          prev.paste === entry.paste &&
          (prev.baseUrl || "") === (entry.baseUrl || "") &&
          prev.urls.join("\0") === entry.urls.join("\0")
        ) {
          return { ok: true, duplicate: true };
        }
        list.unshift(entry);
        if (typeof maxHistory === "number" && list.length > maxHistory) list.length = maxHistory;
        await storageLocalSet({ [STORAGE_HISTORY]: list });
        return { ok: true };
      }
      if (type === "SCAR_DELETE_HISTORY_ITEM") {
        const id = /** @type {string} */ (payload.id);
        const got = await storageLocalGet(STORAGE_HISTORY);
        const raw = got[STORAGE_HISTORY];
        const list = (Array.isArray(raw) ? raw : []).filter((x) => x.id !== id);
        await storageLocalSet({ [STORAGE_HISTORY]: list });
        return { ok: true };
      }
    } catch {
      return { ok: false };
    }
    return { ok: false };
  }

  /**
   * @param {string} type
   * @param {Record<string, unknown>} [payload]
   */
  async function sendToBackground(type, payload = {}) {
    const msg = { type, ...payload };
    const rt = extensionRuntime();
    if (!rt?.sendMessage) return persistDirect(type, payload);

    const useBrowserPromise =
      typeof browser !== "undefined" && rt === browser.runtime && typeof rt.sendMessage === "function";

    if (useBrowserPromise) {
      try {
        return await rt.sendMessage(msg);
      } catch {
        return persistDirect(type, payload);
      }
    }

    return await new Promise((resolve) => {
      try {
        rt.sendMessage(msg, (response) => {
          if (typeof chrome !== "undefined" && chrome.runtime.lastError) {
            void persistDirect(type, payload).then(resolve);
            return;
          }
          resolve(response ?? { ok: true });
        });
      } catch {
        void persistDirect(type, payload).then(resolve);
      }
    });
  }

  /** @type {string[]} */
  let lastUrls = [];

  /** @type {ReturnType<typeof setTimeout> | null} */
  let draftSaveTimer = null;

  /** @type {ReturnType<typeof setTimeout> | null} */
  let feedbackClearTimer = null;

  const FEEDBACK_ICONS = {
    error: `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="8" cy="8" r="6.25" stroke="currentColor" stroke-width="1.2"/><path d="M8 4.75v4.35M8 11.25h.01" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/></svg>`,
    success: `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="8" cy="8" r="6.25" stroke="currentColor" stroke-width="1.2"/><path d="M5.2 8.05l1.9 1.9 3.7-4.2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    info: `<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="8" cy="8" r="6.25" stroke="currentColor" stroke-width="1.2"/><path d="M8 7.15V11M8 5.35v.01" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/></svg>`,
  };

  /**
   * @param {"none" | "error" | "success" | "info"} kind
   * @param {string} [message]
   */
  function setFormFeedback(kind, message) {
    if (feedbackClearTimer !== null) {
      clearTimeout(feedbackClearTimer);
      feedbackClearTimer = null;
    }

    formFeedbackEl.classList.remove("form-feedback--error", "form-feedback--success", "form-feedback--info");

    if (kind === "none") {
      formFeedbackEl.classList.add("hidden");
      formFeedbackText.textContent = "";
      formFeedbackIcon.innerHTML = "";
      formFeedbackEl.removeAttribute("data-feedback");
      formFeedbackEl.setAttribute("aria-live", "polite");
      return;
    }

    if (!message) return;

    formFeedbackEl.classList.add(`form-feedback--${kind}`);
    formFeedbackIcon.innerHTML = FEEDBACK_ICONS[kind] || FEEDBACK_ICONS.info;
    formFeedbackText.textContent = message;
    formFeedbackEl.classList.remove("hidden");
    formFeedbackEl.setAttribute("data-feedback", kind);
    formFeedbackEl.setAttribute("role", kind === "error" ? "alert" : "status");
    formFeedbackEl.setAttribute("aria-live", kind === "error" ? "assertive" : "polite");

    if (kind === "success") {
      feedbackClearTimer = setTimeout(() => {
        feedbackClearTimer = null;
        try {
          setFormFeedback("none");
        } catch {
          /* popup may have been torn down */
        }
      }, 2600);
    }
  }

  function clearBlockingFeedback() {
    const k = formFeedbackEl.getAttribute("data-feedback");
    if (k === "error" || k === "info") setFormFeedback("none");
  }

  function draftPayload() {
    return {
      input: truncatePaste(inputEl.value),
      urls: lastUrls.slice(),
      updatedAt: Date.now(),
    };
  }

  /** Fire-and-forget: background if alive, else direct storage (same as persist fallback). */
  function flushDraftNow() {
    void sendToBackground("SCAR_SAVE_DRAFT", { draft: draftPayload() });
  }

  function scheduleDraftSave() {
    if (draftSaveTimer !== null) clearTimeout(draftSaveTimer);
    draftSaveTimer = setTimeout(() => {
      draftSaveTimer = null;
      void saveDraftToStorage();
    }, 450);
  }

  /**
   * @param {string} s
   */
  function truncatePaste(s) {
    if (!s || s.length <= MAX_PASTE_CHARS) return s;
    return s.slice(0, MAX_PASTE_CHARS);
  }

  /**
   * Strip BOM and leading blank lines (often added when copying from DevTools or page source).
   * @param {string} s
   */
  function normalizeLeadingSourceNoise(s) {
    if (!s) return s;
    let t = s.replace(/^\uFEFF/, "");
    t = t.replace(/^(?:[ \t\u00a0]*(?:\r\n|\r|\n))+/, "");
    return t;
  }

  /** Sync field value + caret after trimming only the beginning. */
  function trimSourceFieldIfNeeded() {
    const prev = inputEl.value;
    const next = normalizeLeadingSourceNoise(prev);
    if (next === prev) return;
    const removed = prev.length - next.length;
    const a = inputEl.selectionStart ?? 0;
    const b = inputEl.selectionEnd ?? 0;
    inputEl.value = next;
    inputEl.selectionStart = Math.max(0, a - removed);
    inputEl.selectionEnd = Math.max(0, b - removed);
    inputEl.dispatchEvent(new Event("input", { bubbles: true }));
  }

  /**
   * @param {number} ts
   */
  function formatAgo(ts) {
    const sec = Math.floor((Date.now() - ts) / 1000);
    if (sec < 45) return "just now";
    if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
    if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
    return new Date(ts).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  /**
   * @param {string} paste
   * @param {string[]} urls
   */
  function snippetFromPaste(paste, urls) {
    const line = (paste || "").trim().split(/\r?\n/)[0] || "";
    let s = line.slice(0, 88);
    if (line.length > 88) s += "…";
    if (urls && urls[0]) {
      try {
        const host = new URL(urls[0]).host;
        if (!s) return host;
        return `${s} · ${host}`;
      } catch {
        /* ignore */
      }
    }
    return s || "(empty paste)";
  }

  async function saveDraftToStorage() {
    await sendToBackground("SCAR_SAVE_DRAFT", { draft: draftPayload() });
  }

  /**
   * @param {string[]} urls
   */
  async function appendHistoryIfWorthy(urls) {
    if (!urls.length) return;
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      at: Date.now(),
      paste: truncatePaste(inputEl.value),
      urls: urls.slice(),
    };
    try {
      await sendToBackground("SCAR_APPEND_HISTORY", { entry, maxHistory: MAX_HISTORY });
    } catch {
      /* extension context invalid */
    }
    await renderHistoryPanel();
  }

  async function renderHistoryPanel() {
    const got = await storageLocalGet(STORAGE_HISTORY);
    const raw = got[STORAGE_HISTORY];
    const list = Array.isArray(raw) ? raw : [];
    historyListEl.replaceChildren();

    if (list.length === 0) {
      historyEmptyEl.classList.remove("hidden");
      clearHistoryBtn.classList.add("hidden");
      return;
    }

    historyEmptyEl.classList.add("hidden");
    clearHistoryBtn.classList.remove("hidden");

    for (const item of list) {
      const row = document.createElement("div");
      row.className = "history-row";
      row.setAttribute("role", "listitem");

      const main = document.createElement("button");
      main.type = "button";
      main.className = "history-main";
      const meta = document.createElement("span");
      meta.className = "history-meta";
      meta.textContent = `${item.urls.length} file${item.urls.length === 1 ? "" : "s"} · ${formatAgo(item.at)}`;
      const snip = document.createElement("span");
      snip.className = "history-snippet";
      snip.textContent = snippetFromPaste(item.paste, item.urls);
      main.appendChild(meta);
      main.appendChild(snip);
      main.addEventListener("click", () => restoreHistoryEntry(item));

      const del = document.createElement("button");
      del.type = "button";
      del.className = "history-del";
      del.setAttribute("aria-label", "Remove from history");
      del.innerHTML = historyDelIcon;
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        removeHistoryEntry(item.id);
      });

      row.appendChild(main);
      row.appendChild(del);
      historyListEl.appendChild(row);
    }
  }

  /**
   * @param {{ paste?: string, urls?: string[] }} item
   */
  async function restoreHistoryEntry(item) {
    inputEl.value = normalizeLeadingSourceNoise(item.paste || "");
    setFormFeedback("none");
    render(item.urls || []);
    await saveDraftToStorage();
  }

  /**
   * @param {string} id
   */
  async function removeHistoryEntry(id) {
    try {
      await sendToBackground("SCAR_DELETE_HISTORY_ITEM", { id });
    } catch {
      /* ignore */
    }
    await renderHistoryPanel();
  }

  async function hydrateFromStorage() {
    const got = await storageLocalGet(STORAGE_DRAFT);
    const draft = got[STORAGE_DRAFT];
    if (draft && typeof draft.input === "string") {
      inputEl.value = normalizeLeadingSourceNoise(draft.input);
      if (Array.isArray(draft.urls) && draft.urls.length) {
        render(draft.urls);
      }
    }
    await renderHistoryPanel();
  }

  const extIcon =
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M21 9.00001L21 3.00001M21 3.00001H15M21 3.00001L12 12M10 3H7.8C6.11984 3 5.27976 3 4.63803 3.32698C4.07354 3.6146 3.6146 4.07354 3.32698 4.63803C3 5.27976 3 6.11984 3 7.8V16.2C3 17.8802 3 18.7202 3.32698 19.362C3.6146 19.9265 4.07354 20.3854 4.63803 20.673C5.27976 21 6.11984 21 7.8 21H16.2C17.8802 21 18.7202 21 19.362 20.673C19.9265 20.3854 20.3854 19.9265 20.673 19.362C21 18.7202 21 17.8802 21 16.2V14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  const historyDelIcon =
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M17 7L7 17M7 7L17 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  const PREVIEW_BADGE_VIDEO =
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M22 8.93137C22 8.32555 22 8.02265 21.8802 7.88238C21.7763 7.76068 21.6203 7.69609 21.4608 7.70865C21.2769 7.72312 21.0627 7.93731 20.6343 8.36569L17 12L20.6343 15.6343C21.0627 16.0627 21.2769 16.2769 21.4608 16.2914C21.6203 16.3039 21.7763 16.2393 21.8802 16.1176C22 15.9774 22 15.6744 22 15.0686V8.93137Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 9.8C2 8.11984 2 7.27976 2.32698 6.63803C2.6146 6.07354 3.07354 5.6146 3.63803 5.32698C4.27976 5 5.11984 5 6.8 5H12.2C13.8802 5 14.7202 5 15.362 5.32698C15.9265 5.6146 16.3854 6.07354 16.673 6.63803C17 7.27976 17 8.11984 17 9.8V14.2C17 15.8802 17 16.7202 16.673 17.362C16.3854 17.9265 15.9265 18.3854 15.362 18.673C14.7202 19 13.8802 19 12.2 19H6.8C5.11984 19 4.27976 19 3.63803 18.673C3.07354 18.3854 2.6146 17.9265 2.32698 17.362C2 16.7202 2 15.8802 2 14.2V9.8Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  const PREVIEW_BADGE_IMAGE =
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M16.2 21H6.93137C6.32555 21 6.02265 21 5.88238 20.8802C5.76068 20.7763 5.69609 20.6203 5.70865 20.4608C5.72312 20.2769 5.93731 20.0627 6.36569 19.6343L14.8686 11.1314C15.2646 10.7354 15.4627 10.5373 15.691 10.4632C15.8918 10.3979 16.1082 10.3979 16.309 10.4632C16.5373 10.5373 16.7354 10.7354 17.1314 11.1314L21 15V16.2M16.2 21C17.8802 21 18.7202 21 19.362 20.673C19.9265 20.3854 20.3854 19.9265 20.673 19.362C21 18.7202 21 17.8802 21 16.2M16.2 21H7.8C6.11984 21 5.27976 21 4.63803 20.673C4.07354 20.3854 3.6146 19.9265 3.32698 19.362C3 18.7202 3 17.8802 3 16.2V7.8C3 6.11984 3 5.27976 3.32698 4.63803C3.6146 4.07354 4.07354 3.6146 4.63803 3.32698C5.27976 3 6.11984 3 7.8 3H16.2C17.8802 3 18.7202 3 19.362 3.32698C19.9265 3.6146 20.3854 4.07354 20.673 4.63803C21 5.27976 21 6.11984 21 7.8V16.2M10.5 8.5C10.5 9.60457 9.60457 10.5 8.5 10.5C7.39543 10.5 6.5 9.60457 6.5 8.5C6.5 7.39543 7.39543 6.5 8.5 6.5C9.60457 6.5 10.5 7.39543 10.5 8.5Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  const PREVIEW_BADGE_GIF =
    '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M9.5 8.96533C9.5 8.48805 9.5 8.24941 9.59974 8.11618C9.68666 8.00007 9.81971 7.92744 9.96438 7.9171C10.1304 7.90525 10.3311 8.03429 10.7326 8.29239L15.4532 11.3271C15.8016 11.551 15.9758 11.663 16.0359 11.8054C16.0885 11.9298 16.0885 12.0702 16.0359 12.1946C15.9758 12.337 15.8016 12.449 15.4532 12.6729L10.7326 15.7076C10.3311 15.9657 10.1304 16.0948 9.96438 16.0829C9.81971 16.0726 9.68666 15.9999 9.59974 15.8838C9.5 15.7506 9.5 15.512 9.5 15.0347V8.96533Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 7.8C3 6.11984 3 5.27976 3.32698 4.63803C3.6146 4.07354 4.07354 3.6146 4.63803 3.32698C5.27976 3 6.11984 3 7.8 3H16.2C17.8802 3 18.7202 3 19.362 3.32698C19.9265 3.6146 20.3854 4.07354 20.673 4.63803C21 5.27976 21 6.11984 21 7.8V16.2C21 17.8802 21 18.7202 20.673 19.362C20.3854 19.9265 19.9265 20.3854 19.362 20.673C18.7202 21 17.8802 21 16.2 21H7.8C6.11984 21 5.27976 21 4.63803 20.673C4.07354 20.3854 3.6146 19.9265 3.32698 19.362C3 18.7202 3 17.8802 3 16.2V7.8Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function isDataPng(s) {
    return /^data:image\/png/i.test(s);
  }

  /** @param {string} s */
  function isDataExtractableMedia(s) {
    return (
      /^data:image\/(?:png|gif|webp|jpe?g|bmp|avif)/i.test(s) ||
      /^data:video\//i.test(s)
    );
  }

  function looksLikePngUrl(href) {
    if (isDataPng(href)) return true;
    const lower = href.toLowerCase();
    if (lower.includes("format=png") || lower.includes("type=png")) return true;
    try {
      const u = new URL(href);
      const path = u.pathname.toLowerCase();
      if (path.endsWith(".png")) return true;
      if (path.includes(".png?")) return true;
    } catch {
      const path = href.split(/[?#]/)[0].toLowerCase();
      if (path.endsWith(".png")) return true;
    }
    return false;
  }

  /** Direct video file / stream URLs (paths or data). GIF stays under raster/images. */
  function looksLikeVideoUrl(href) {
    if (/^data:video\//i.test(href)) return true;
    const lower = href.toLowerCase();
    if (
      lower.includes("format=mp4") ||
      lower.includes("type=video") ||
      lower.includes("mime=video")
    ) {
      return true;
    }
    try {
      const path = new URL(href).pathname.toLowerCase();
      return /\.(mp4|webm|ogv|mov|m4v|mkv|mpeg|mpg|3gp|3g2|ts|m2ts|m3u8)(?:$|[?#])/i.test(
        path
      );
    } catch {
      const base = href.split(/[?#]/)[0].toLowerCase();
      return /\.(mp4|webm|ogv|mov|m4v|mkv|mpeg|mpg|3gp|3g2|ts|m2ts|m3u8)$/.test(base);
    }
  }

  function looksLikeGifUrl(href) {
    if (/^data:image\/gif/i.test(href)) return true;
    const lower = href.toLowerCase();
    if (lower.includes("format=gif") || lower.includes("type=gif")) return true;
    try {
      const path = new URL(href).pathname.toLowerCase();
      return /\.gif(?:$|[?#])/i.test(path);
    } catch {
      const base = href.split(/[?#]/)[0].toLowerCase();
      return /\.gif$/.test(base);
    }
  }

  /** Anything we list, preview (when possible), and open in a tab. */
  function looksLikeExtractableUrl(href) {
    if (isDataExtractableMedia(href)) return true;
    if (looksLikeRasterImageUrl(href)) return true;
    if (looksLikeVideoUrl(href)) return true;
    return false;
  }

  /** Raster URLs often used as full-quality assets (e.g. JSON `screenUrl` fields). */
  function looksLikeRasterImageUrl(href) {
    if (looksLikePngUrl(href)) return true;
    try {
      const path = new URL(href).pathname.toLowerCase();
      return /\.(webp|jpe?g|gif|avif|bmp)(?:$|[?#])/i.test(path);
    } catch {
      const base = href.split(/[?#]/)[0].toLowerCase();
      return /\.(webp|jpe?g|gif|avif|bmp)$/.test(base);
    }
  }

  /**
   * @param {string} raw
   * @param {Set<string>} out
   * @param {string | null} base
   */
  function addCandidate(raw, out, base) {
    if (!raw) return;
    let s = raw.trim().replace(/^['"]|['"]$/g, "");
    if (!s) return;

    if (isDataExtractableMedia(s)) {
      out.add(s);
      return;
    }

    if (s.startsWith("//")) {
      s = "https:" + s;
    }

    if (s.startsWith("blob:")) {
      return;
    }

    try {
      const resolved = base ? new URL(s, base).href : new URL(s).href;
      if (looksLikeExtractableUrl(resolved)) out.add(resolved);
    } catch {
      // ignore invalid
    }
  }

  /**
   * @param {string} raw
   * @param {Set<string>} out
   * @param {string | null} base
   */
  function addRasterCandidate(raw, out, base) {
    if (!raw) return;
    let s = raw.trim().replace(/^['"]|['"]$/g, "");
    if (!s || s.startsWith("blob:")) return;
    if (s.startsWith("//")) s = "https:" + s;
    try {
      const resolved = base ? new URL(s, base).href : new URL(s).href;
      if (looksLikeRasterImageUrl(resolved) || looksLikeVideoUrl(resolved)) {
        out.add(resolved);
      }
    } catch {
      // ignore invalid
    }
  }

  /**
   * @param {string | null} srcset
   * @param {Set<string>} out
   * @param {string | null} base
   */
  function consumeSrcset(srcset, out, base) {
    if (!srcset) return;
    for (const part of srcset.split(",")) {
      const url = part.trim().split(/\s+/)[0];
      if (url) addCandidate(url, out, base);
    }
  }

  /**
   * @param {string} cssText
   * @param {Set<string>} out
   * @param {string | null} base
   */
  function urlsFromCss(cssText, out, base) {
    if (!cssText) return;
    const re = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;
    let m;
    while ((m = re.exec(cssText)) !== null) {
      addCandidate(m[2], out, base);
    }
  }

  /**
   * @param {string} html
   * @param {Set<string>} out
   * @param {string | null} base
   */
  function extractFromHtml(html, out, base) {
    const doc = new DOMParser().parseFromString(html, "text/html");

    doc.querySelectorAll("img[src]").forEach((el) => {
      const src = el.getAttribute("src");
      if (src && src.trim().startsWith("blob:")) {
        out.add(src.trim());
        return;
      }
      addCandidate(src, out, base);
    });
    doc.querySelectorAll("img[srcset], source[srcset]").forEach((el) => {
      consumeSrcset(el.getAttribute("srcset"), out, base);
    });
    doc.querySelectorAll("source[src]").forEach((el) => {
      addCandidate(el.getAttribute("src"), out, base);
    });
    doc.querySelectorAll("video[src]").forEach((el) => {
      addCandidate(el.getAttribute("src"), out, base);
    });
    doc.querySelectorAll("video source[src]").forEach((el) => {
      addCandidate(el.getAttribute("src"), out, base);
    });
    doc.querySelectorAll("a[href]").forEach((el) => {
      addCandidate(el.getAttribute("href"), out, base);
    });
    doc.querySelectorAll("link[href]").forEach((el) => {
      addCandidate(el.getAttribute("href"), out, base);
    });
    doc.querySelectorAll("[style]").forEach((el) => {
      urlsFromCss(el.getAttribute("style") || "", out, base);
    });
    doc.querySelectorAll("style").forEach((el) => {
      urlsFromCss(el.textContent || "", out, base);
    });
  }

  /**
   * @param {string} text
   * @param {Set<string>} out
   * @param {string | null} base
   */
  function extractFromRawText(text, out, base) {
    const dataRe =
      /data:(?:image\/(?:png|gif|webp|jpe?g|bmp|avif)|video\/(?:mp4|webm|ogg|quicktime|mpeg|x-matroska))[^"'`\s<>]*/gi;
    let m;
    while ((m = dataRe.exec(text)) !== null) {
      addCandidate(m[0], out, base);
    }

    const httpRe = /https?:\/\/[^\s"'<>()]+/gi;
    while ((m = httpRe.exec(text)) !== null) {
      addCandidate(m[0], out, base);
    }

    const pathRe =
      /(?:^|[\s"'(=[{,:])\/[^\s"'<>()]*\.(?:png|webp|jpe?g|gif|avif|bmp|mp4|webm|ogv|mov|m4v|mkv|mpeg|mpg|3gp|m3u8)(?:[^\s"'<>()]*)?/gi;
    while ((m = pathRe.exec(text)) !== null) {
      const raw = m[0].replace(/^[\s"'(=[{,:]+/, "").trim();
      if (raw) addCandidate(raw, out, base);
    }
  }

  /**
   * Next.js / JSON payloads often carry full-quality URLs in `screenUrl` while
   * the DOM uses CDN URLs with `?enc=` (or CSS blur). Scan for the key and the
   * next image-like https URL within a short window.
   * @param {string} text
   * @param {Set<string>} out
   * @param {string | null} base
   */
  function extractScreenUrls(text, out, base) {
    const key = "screenUrl";
    const imgRe =
      /https?:\/\/[^\s"'\\<>]+?\.(?:png|webp|jpe?g|gif|avif|bmp|mp4|webm|ogv|mov|m4v|mkv|mpeg|mpg|m3u8)(?:\?[^\s"'\\<>]*)?/gi;
    let pos = 0;
    while ((pos = text.indexOf(key, pos)) !== -1) {
      const slice = text.slice(pos, pos + 4096);
      for (const m of slice.matchAll(imgRe)) {
        addRasterCandidate(m[0], out, base);
      }
      pos += key.length;
    }
  }

  /**
   * @param {string} text
   * @param {string | null} base
   * @returns {string[]}
   */
  function extractAll(text, base) {
    const out = new Set();
    if (!text.trim()) return [];

    extractFromHtml(text, out, base);
    extractFromRawText(text, out, base);
    extractScreenUrls(text, out, base);

    return Array.from(out).sort((a, b) => a.localeCompare(b));
  }

  /**
   * @param {string} url
   */
  function displayUrl(url) {
    if (url.length <= 96) return url;
    return url.slice(0, 44) + "…" + url.slice(-40);
  }

  /**
   * Short, readable label for the preview tile overlay.
   * @param {string} url
   */
  function displayUrlForTile(url) {
    const max = 36;
    if (url.startsWith("data:")) {
      const semi = url.indexOf(";");
      const head = url.slice(0, semi > 0 ? semi : Math.min(28, url.length));
      return head.length <= max ? head : `${head.slice(0, 26)}…`;
    }
    if (url.startsWith("blob:")) return "Blob";

    try {
      if (url.startsWith("http:") || url.startsWith("https:")) {
        const u = new URL(url);
        const host = u.host.replace(/^www\./i, "");
        const parts = u.pathname.split("/").filter(Boolean);
        const fileRaw = parts.length ? parts[parts.length - 1] : "";
        let file = fileRaw;
        try {
          file = decodeURIComponent(fileRaw);
        } catch {
          /* keep raw */
        }

        let label = file ? `${host}/…/${file}` : `${host}${u.pathname || "/"}`;
        if (label.length <= max) return label;

        const shortFile =
          file.length > 22 ? `${file.slice(0, 8)}…${file.slice(-10)}` : file;
        const shortHost = host.length > 14 ? `${host.slice(0, 10)}…` : host;
        label = `${shortHost}/…/${shortFile}`;
        return label.length > max + 2 ? `${label.slice(0, max - 1)}…` : label;
      }
    } catch {
      /* fall through */
    }

    if (url.length <= max) return url;
    return `${url.slice(0, 13)}…${url.slice(-10)}`;
  }

  /**
   * @param {string} url
   */
  function isOpenableInTab(url) {
    return (
      url.startsWith("http:") ||
      url.startsWith("https:") ||
      url.startsWith("data:image/") ||
      url.startsWith("data:video/")
    );
  }

  /** Use <video> in the preview grid (GIFs stay on <img>). */
  function shouldPreviewAsVideo(url) {
    return looksLikeVideoUrl(url);
  }

  /** @returns {"video"|"gif"|"image"} */
  function getPreviewMediaKind(url) {
    if (looksLikeVideoUrl(url)) return "video";
    if (looksLikeGifUrl(url)) return "gif";
    return "image";
  }

  function renderLinkList(urls) {
    linkListEl.replaceChildren();

    for (const url of urls) {
      const icon = document.createElement("span");
      icon.className = "ext";
      icon.innerHTML = extIcon;

      const text = document.createElement("span");
      text.textContent = displayUrl(url);

      if (isOpenableInTab(url)) {
        const row = document.createElement("a");
        row.className = "link-row";
        row.setAttribute("role", "listitem");
        row.href = url;
        row.target = "_blank";
        row.rel = "noopener noreferrer";
        row.title = url;
        row.appendChild(icon);
        row.appendChild(text);
        linkListEl.appendChild(row);
      } else {
        const row = document.createElement("div");
        row.className = "link-row link-row--static";
        row.setAttribute("role", "listitem");
        row.title = `${url}\n(Not openable from the extension — paste came from another context.)`;
        row.appendChild(icon);
        row.appendChild(text);
        linkListEl.appendChild(row);
      }
    }
  }

  function render(urls) {
    lastUrls = urls;
    gridEl.replaceChildren();

    if (urls.length === 0) {
      resultsEl.classList.add("hidden");
      countLabel.textContent = "";
      linkListEl.replaceChildren();
      return;
    }

    resultsEl.classList.remove("hidden");
    countLabel.textContent = `${urls.length} file${urls.length === 1 ? "" : "s"}`;

    renderLinkList(urls);

    for (const url of urls) {
      const cap = document.createElement("div");
      cap.className = "cap";
      cap.textContent = displayUrlForTile(url);

      const tile = document.createElement("div");
      tile.className = "tile";

      const wrapInLink = isOpenableInTab(url);
      const asVideo = shouldPreviewAsVideo(url) && !url.startsWith("blob:");

      const kind = getPreviewMediaKind(url);
      const badge = document.createElement("div");
      badge.className = "tile-badge";
      badge.setAttribute("aria-hidden", "true");
      if (kind === "video") badge.innerHTML = PREVIEW_BADGE_VIDEO;
      else if (kind === "gif") badge.innerHTML = PREVIEW_BADGE_GIF;
      else badge.innerHTML = PREVIEW_BADGE_IMAGE;

      if (asVideo) {
        const video = document.createElement("video");
        video.muted = true;
        video.playsInline = true;
        video.preload = "metadata";
        video.setAttribute("playsinline", "");
        video.setAttribute("aria-label", "Video preview");
        video.referrerPolicy = "no-referrer";
        video.src = url;
        video.addEventListener("error", () => {
          tile.classList.add("broken");
        });
        video.addEventListener("loadeddata", () => {
          tile.classList.remove("broken");
        });
        tile.appendChild(video);
        tile.appendChild(badge);
        tile.appendChild(cap);
      } else {
        const img = document.createElement("img");
        img.alt = "";
        img.loading = "lazy";
        img.referrerPolicy = "no-referrer";
        img.addEventListener("error", () => {
          tile.classList.add("broken");
        });
        img.addEventListener("load", () => {
          tile.classList.remove("broken");
        });
        if (url.startsWith("blob:")) {
          tile.classList.add("broken");
          tile.appendChild(img);
        } else {
          img.src = url;
          tile.appendChild(img);
        }
        tile.appendChild(badge);
        tile.appendChild(cap);
      }

      if (url.startsWith("blob:") && !asVideo) {
        gridEl.appendChild(tile);
      } else if (wrapInLink) {
        const a = document.createElement("a");
        a.className = "tile-link";
        a.href = url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.setAttribute(
          "aria-label",
          asVideo ? "Open video in new tab" : "Open image in new tab"
        );
        a.appendChild(tile);
        gridEl.appendChild(a);
      } else {
        gridEl.appendChild(tile);
      }
    }
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      setFormFeedback("success", "Copied to clipboard.");
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        setFormFeedback("success", "Copied to clipboard.");
      } catch {
        setFormFeedback(
          "error",
          "Could not copy — your browser blocked clipboard access."
        );
      }
      ta.remove();
    }
  }

  async function runExtract() {
    setFormFeedback("none");
    trimSourceFieldIfNeeded();
    if (!inputEl.value.trim()) {
      setFormFeedback("error", "Paste code into Source before extracting.");
      return;
    }
    const urls = extractAll(inputEl.value, null);
    render(urls);
    if (urls.length === 0) {
      setFormFeedback(
        "info",
        "No media links found. Try a full paste or JSON with absolute URLs and screenUrl fields."
      );
    } else {
      setFormFeedback("none");
    }
    flushDraftNow();
    try {
      await saveDraftToStorage();
      await appendHistoryIfWorthy(urls);
    } catch {
      setFormFeedback(
        "error",
        "Could not save your session. Reload Scar on the extensions page and try again."
      );
    }
  }

  extractBtn.addEventListener("click", () => {
    void runExtract();
  });

  clearBtn.addEventListener("click", async () => {
    if (draftSaveTimer !== null) {
      clearTimeout(draftSaveTimer);
      draftSaveTimer = null;
    }
    inputEl.value = "";
    render([]);
    setFormFeedback("none");
    try {
      await sendToBackground("SCAR_REMOVE_DRAFT");
    } catch {
      /* ignore */
    }
  });

  copyAllBtn.addEventListener("click", () => {
    if (lastUrls.length) copyText(lastUrls.join(" "));
  });

  copyLinesBtn.addEventListener("click", () => {
    if (lastUrls.length) copyText(lastUrls.join("\n"));
  });

  inputEl.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      void runExtract();
    }
  });

  clearHistoryBtn.addEventListener("click", async () => {
    try {
      await sendToBackground("SCAR_CLEAR_HISTORY");
    } catch {
      /* ignore */
    }
    await renderHistoryPanel();
  });

  function onSourceInput() {
    scheduleDraftSave();
    clearBlockingFeedback();
  }
  inputEl.addEventListener("input", onSourceInput);
  inputEl.addEventListener("paste", () => {
    queueMicrotask(() => trimSourceFieldIfNeeded());
  });

  window.addEventListener("pagehide", flushDraftNow);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushDraftNow();
  });

  await hydrateFromStorage();
})();
