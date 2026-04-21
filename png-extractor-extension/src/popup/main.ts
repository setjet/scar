import { PREVIEW_BADGE_GIF, PREVIEW_BADGE_IMAGE, PREVIEW_BADGE_VIDEO, extIcon, historyDelIcon } from "./icons";
import { getPreviewMediaKind } from "../shared/mediaKind";
import {
  displayUrl,
  displayUrlForTile,
  extractAll,
  isOpenableInTab,
  shouldPreviewAsVideo
} from "../shared/extract";
import { extensionRuntime, storageLocalArea } from "../shared/extensionApi";
import { storageLocalGet, storageLocalRemove, storageLocalSet } from "../shared/storage";

type FeedbackKind = "none" | "error" | "success" | "info";

type DraftState = {
  input: string;
  urls: string[];
  updatedAt: number;
};

type HistoryEntry = {
  id: string;
  at: number;
  paste: string;
  urls: string[];
};

type BgResponse = { ok: boolean; duplicate?: boolean; error?: string };

const STORAGE_DRAFT = "scarDraft";
const STORAGE_HISTORY = "scarHistory";
const MAX_HISTORY = 15;
const MAX_PASTE_CHARS = 1_200_000;

function getEl<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
}

function truncatePaste(s: string): string {
  if (!s || s.length <= MAX_PASTE_CHARS) return s;
  return s.slice(0, MAX_PASTE_CHARS);
}

function normalizeLeadingSourceNoise(s: string): string {
  if (!s) return s;
  let t = s.replace(/^\uFEFF/, "");
  t = t.replace(/^(?:[ \t\u00a0]*(?:\r\n|\r|\n))+/, "");
  return t;
}

function formatAgo(ts: number): string {
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 45) return "just now";
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function snippetFromPaste(paste: string, urls: string[]): string {
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

async function persistDirect(type: string, payload: Record<string, unknown>): Promise<BgResponse> {
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
      const entry = payload.entry as { paste: string; urls: string[]; baseUrl?: string };
      const maxHistory = payload.maxHistory as number;
      const got = await storageLocalGet(STORAGE_HISTORY);
      const raw = got[STORAGE_HISTORY];
      const list: any[] = Array.isArray(raw) ? raw : [];
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
      const id = payload.id as string;
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

async function sendToBackground(type: string, payload: Record<string, unknown> = {}): Promise<BgResponse> {
  const msg = { type, ...payload };
  const rt = extensionRuntime();
  if (!rt?.sendMessage) return persistDirect(type, payload);

  const anyGlobal = globalThis as any;
  const useBrowserPromise = typeof anyGlobal.browser !== "undefined" && rt === anyGlobal.browser.runtime;

  if (useBrowserPromise) {
    try {
      return (await rt.sendMessage(msg)) as BgResponse;
    } catch {
      return persistDirect(type, payload);
    }
  }

  return await new Promise((resolve) => {
    try {
      rt.sendMessage(msg, (response: any) => {
        if (anyGlobal.chrome?.runtime?.lastError) {
          void persistDirect(type, payload).then(resolve);
          return;
        }
        resolve((response ?? { ok: true }) as BgResponse);
      });
    } catch {
      void persistDirect(type, payload).then(resolve);
    }
  });
}

const FEEDBACK_ICONS: Record<Exclude<FeedbackKind, "none">, string> = {
  error:
    '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="8" cy="8" r="6.25" stroke="currentColor" stroke-width="1.2"/><path d="M8 4.75v4.35M8 11.25h.01" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/></svg>',
  success:
    '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="8" cy="8" r="6.25" stroke="currentColor" stroke-width="1.2"/><path d="M5.2 8.05l1.9 1.9 3.7-4.2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  info:
    '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="8" cy="8" r="6.25" stroke="currentColor" stroke-width="1.2"/><path d="M8 7.15V11M8 5.35v.01" stroke="currentColor" stroke-width="1.35" stroke-linecap="round"/></svg>'
};

async function main() {
  const inputEl = getEl<HTMLTextAreaElement>("input");
  const extractBtn = getEl<HTMLButtonElement>("extractBtn");
  const clearBtn = getEl<HTMLButtonElement>("clearBtn");
  const resultsEl = getEl<HTMLElement>("results");
  const countLabel = getEl<HTMLElement>("countLabel");
  const linkListEl = getEl<HTMLElement>("linkList");
  const gridEl = getEl<HTMLElement>("grid");
  const copyAllBtn = getEl<HTMLButtonElement>("copyAllBtn");
  const copyLinesBtn = getEl<HTMLButtonElement>("copyLinesBtn");
  const formFeedbackEl = getEl<HTMLElement>("formFeedback");
  const formFeedbackText = getEl<HTMLElement>("formFeedbackText");
  const formFeedbackIcon = getEl<HTMLElement>("formFeedbackIcon");
  const historyListEl = getEl<HTMLElement>("historyList");
  const historyEmptyEl = getEl<HTMLElement>("historyEmpty");
  const clearHistoryBtn = getEl<HTMLButtonElement>("clearHistoryBtn");

  let lastUrls: string[] = [];
  let draftSaveTimer: ReturnType<typeof setTimeout> | null = null;
  let feedbackClearTimer: ReturnType<typeof setTimeout> | null = null;

  function setFormFeedback(kind: FeedbackKind, message?: string) {
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

  function draftPayload(): DraftState {
    return {
      input: truncatePaste(inputEl.value),
      urls: lastUrls.slice(),
      updatedAt: Date.now()
    };
  }

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

  async function saveDraftToStorage() {
    await sendToBackground("SCAR_SAVE_DRAFT", { draft: draftPayload() });
  }

  async function appendHistoryIfWorthy(urls: string[]) {
    if (!urls.length) return;
    const entry: HistoryEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      at: Date.now(),
      paste: truncatePaste(inputEl.value),
      urls: urls.slice()
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
    const list: HistoryEntry[] = Array.isArray(raw) ? raw : [];
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
        void removeHistoryEntry(item.id);
      });

      row.appendChild(main);
      row.appendChild(del);
      historyListEl.appendChild(row);
    }
  }

  async function restoreHistoryEntry(item: Partial<HistoryEntry>) {
    inputEl.value = normalizeLeadingSourceNoise(item.paste || "");
    setFormFeedback("none");
    render(item.urls || []);
    await saveDraftToStorage();
  }

  async function removeHistoryEntry(id: string) {
    try {
      await sendToBackground("SCAR_DELETE_HISTORY_ITEM", { id });
    } catch {
      /* ignore */
    }
    await renderHistoryPanel();
  }

  async function hydrateFromStorage() {
    const got = await storageLocalGet(STORAGE_DRAFT);
    const draft = got[STORAGE_DRAFT] as DraftState | undefined;
    if (draft && typeof draft.input === "string") {
      inputEl.value = normalizeLeadingSourceNoise(draft.input);
      if (Array.isArray(draft.urls) && draft.urls.length) render(draft.urls);
    }
    await renderHistoryPanel();
  }

  function renderLinkList(urls: string[]) {
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

  function render(urls: string[]) {
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
        (video as any).referrerPolicy = "no-referrer";
        video.src = url;
        video.addEventListener("error", () => tile.classList.add("broken"));
        video.addEventListener("loadeddata", () => tile.classList.remove("broken"));
        tile.appendChild(video);
        tile.appendChild(badge);
        tile.appendChild(cap);
      } else {
        const img = document.createElement("img");
        img.alt = "";
        img.loading = "lazy";
        (img as any).referrerPolicy = "no-referrer";
        img.addEventListener("error", () => tile.classList.add("broken"));
        img.addEventListener("load", () => tile.classList.remove("broken"));
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
        a.setAttribute("aria-label", asVideo ? "Open video in new tab" : "Open image in new tab");
        a.appendChild(tile);
        gridEl.appendChild(a);
      } else {
        gridEl.appendChild(tile);
      }
    }
  }

  async function copyText(text: string) {
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
        setFormFeedback("error", "Could not copy — your browser blocked clipboard access.");
      }
      ta.remove();
    }
  }

  async function runExtract() {
    setFormFeedback("none");
    trimSourceFieldIfNeeded();
    if (!inputEl.value.trim()) {
      setFormFeedback("error", "Paste HTML or text into Source before extracting.");
      return;
    }
    const urls = extractAll(inputEl.value, null);
    render(urls);
    if (urls.length === 0) {
      setFormFeedback("info", "No media links found. Try a full paste or JSON with absolute URLs and screenUrl fields.");
    } else {
      setFormFeedback("none");
    }
    flushDraftNow();
    try {
      await saveDraftToStorage();
      await appendHistoryIfWorthy(urls);
    } catch {
      setFormFeedback("error", "Could not save your session. Reload Scar on the extensions page and try again.");
    }
  }

  extractBtn.addEventListener("click", () => void runExtract());

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
    if (lastUrls.length) void copyText(lastUrls.join(" "));
  });

  copyLinesBtn.addEventListener("click", () => {
    if (lastUrls.length) void copyText(lastUrls.join("\n"));
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
  inputEl.addEventListener("paste", () => queueMicrotask(() => trimSourceFieldIfNeeded()));

  window.addEventListener("pagehide", flushDraftNow);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushDraftNow();
  });

  await hydrateFromStorage();
}

void main();

