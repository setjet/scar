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
  baseUrl?: string;
};

type Msg =
  | { type: "SCAR_SAVE_DRAFT"; draft: DraftState }
  | { type: "SCAR_REMOVE_DRAFT" }
  | { type: "SCAR_APPEND_HISTORY"; entry: HistoryEntry; maxHistory: number }
  | { type: "SCAR_DELETE_HISTORY_ITEM"; id: string }
  | { type: "SCAR_CLEAR_HISTORY" };

const STORAGE_DRAFT = "scarDraft";
const STORAGE_HISTORY = "scarHistory";

function respond(sendResponse: (resp: any) => void, payload: any) {
  try {
    sendResponse(payload);
  } catch {
    /* ignore */
  }
}

// MV3: keep state persistence in the service worker.
chrome.runtime.onMessage.addListener((msg: Msg, _sender, sendResponse) => {
  if (!msg || typeof (msg as any).type !== "string") return false;

  if (msg.type === "SCAR_SAVE_DRAFT") {
    chrome.storage.local.set({ [STORAGE_DRAFT]: msg.draft }, () => {
      const err = chrome.runtime.lastError;
      respond(sendResponse, { ok: !err, error: err?.message });
    });
    return true;
  }

  if (msg.type === "SCAR_REMOVE_DRAFT") {
    chrome.storage.local.remove(STORAGE_DRAFT, () => {
      const err = chrome.runtime.lastError;
      respond(sendResponse, { ok: !err });
    });
    return true;
  }

  if (msg.type === "SCAR_APPEND_HISTORY") {
    const { entry, maxHistory } = msg;
    chrome.storage.local.get(STORAGE_HISTORY, (got) => {
      const getErr = chrome.runtime.lastError;
      if (getErr) {
        respond(sendResponse, { ok: false });
        return;
      }
      const raw = (got as any)[STORAGE_HISTORY];
      const list: HistoryEntry[] = Array.isArray(raw) ? raw : [];
      const prev = list[0];
      if (
        prev &&
        prev.paste === entry.paste &&
        (prev.baseUrl || "") === (entry.baseUrl || "") &&
        prev.urls.join("\0") === entry.urls.join("\0")
      ) {
        respond(sendResponse, { ok: true, duplicate: true });
        return;
      }
      list.unshift(entry);
      if (typeof maxHistory === "number" && list.length > maxHistory) list.length = maxHistory;
      chrome.storage.local.set({ [STORAGE_HISTORY]: list }, () => {
        const err = chrome.runtime.lastError;
        respond(sendResponse, { ok: !err });
      });
    });
    return true;
  }

  if (msg.type === "SCAR_DELETE_HISTORY_ITEM") {
    chrome.storage.local.get(STORAGE_HISTORY, (got) => {
      const getErr = chrome.runtime.lastError;
      if (getErr) {
        respond(sendResponse, { ok: false });
        return;
      }
      const raw = (got as any)[STORAGE_HISTORY];
      const list = (Array.isArray(raw) ? raw : []).filter((x: HistoryEntry) => x.id !== msg.id);
      chrome.storage.local.set({ [STORAGE_HISTORY]: list }, () => {
        const err = chrome.runtime.lastError;
        respond(sendResponse, { ok: !err });
      });
    });
    return true;
  }

  if (msg.type === "SCAR_CLEAR_HISTORY") {
    chrome.storage.local.set({ [STORAGE_HISTORY]: [] }, () => {
      const err = chrome.runtime.lastError;
      respond(sendResponse, { ok: !err });
    });
    return true;
  }

  return false;
});

