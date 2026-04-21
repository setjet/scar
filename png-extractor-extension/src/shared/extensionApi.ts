export type StorageAreaLike = {
  get: (keys: any, cb?: (items: Record<string, unknown>) => void) => any;
  set: (items: Record<string, unknown>, cb?: () => void) => any;
  remove?: (keys: any, cb?: () => void) => any;
};

export function storageLocalArea(): StorageAreaLike | null {
  try {
    const anyGlobal = globalThis as any;
    if (anyGlobal.browser?.storage?.local) return anyGlobal.browser.storage.local;
    if (anyGlobal.chrome?.storage?.local) return anyGlobal.chrome.storage.local;
  } catch {
    /* ignore */
  }
  return null;
}

export function extensionRuntime(): any | null {
  try {
    const anyGlobal = globalThis as any;
    if (anyGlobal.browser?.runtime?.sendMessage) return anyGlobal.browser.runtime;
    if (anyGlobal.chrome?.runtime?.sendMessage) return anyGlobal.chrome.runtime;
  } catch {
    /* ignore */
  }
  return null;
}

export function chromeLastErrorMessage(): string | null {
  try {
    const anyGlobal = globalThis as any;
    return anyGlobal.chrome?.runtime?.lastError?.message ?? null;
  } catch {
    return null;
  }
}

