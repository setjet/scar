/** Persists Scar state; popup teardown won't cancel writes made here. */
const STORAGE_DRAFT = "scarDraft";
const STORAGE_HISTORY = "scarHistory";

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg.type !== "string") return false;

  if (msg.type === "SCAR_SAVE_DRAFT") {
    chrome.storage.local.set({ [STORAGE_DRAFT]: msg.draft }, () => {
      const err = chrome.runtime.lastError;
      sendResponse({ ok: !err, error: err?.message });
    });
    return true;
  }

  if (msg.type === "SCAR_REMOVE_DRAFT") {
    chrome.storage.local.remove(STORAGE_DRAFT, () => {
      const err = chrome.runtime.lastError;
      sendResponse({ ok: !err });
    });
    return true;
  }

  if (msg.type === "SCAR_APPEND_HISTORY") {
    const { entry, maxHistory } = msg;
    chrome.storage.local.get(STORAGE_HISTORY, (got) => {
      const getErr = chrome.runtime.lastError;
      if (getErr) {
        sendResponse({ ok: false });
        return;
      }
      const raw = got[STORAGE_HISTORY];
      const list = Array.isArray(raw) ? raw : [];
      const prev = list[0];
      if (
        prev &&
        prev.paste === entry.paste &&
        (prev.baseUrl || "") === (entry.baseUrl || "") &&
        prev.urls.join("\0") === entry.urls.join("\0")
      ) {
        sendResponse({ ok: true, duplicate: true });
        return;
      }
      list.unshift(entry);
      if (typeof maxHistory === "number" && list.length > maxHistory) {
        list.length = maxHistory;
      }
      chrome.storage.local.set({ [STORAGE_HISTORY]: list }, () => {
        const err = chrome.runtime.lastError;
        sendResponse({ ok: !err });
      });
    });
    return true;
  }

  if (msg.type === "SCAR_DELETE_HISTORY_ITEM") {
    chrome.storage.local.get(STORAGE_HISTORY, (got) => {
      const getErr = chrome.runtime.lastError;
      if (getErr) {
        sendResponse({ ok: false });
        return;
      }
      const raw = got[STORAGE_HISTORY];
      const list = (Array.isArray(raw) ? raw : []).filter((x) => x.id !== msg.id);
      chrome.storage.local.set({ [STORAGE_HISTORY]: list }, () => {
        const err = chrome.runtime.lastError;
        sendResponse({ ok: !err });
      });
    });
    return true;
  }

  if (msg.type === "SCAR_CLEAR_HISTORY") {
    chrome.storage.local.set({ [STORAGE_HISTORY]: [] }, () => {
      const err = chrome.runtime.lastError;
      sendResponse({ ok: !err });
    });
    return true;
  }

  return false;
});
