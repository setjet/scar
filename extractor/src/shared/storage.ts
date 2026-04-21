import { chromeLastErrorMessage, storageLocalArea } from "./extensionApi";

export async function storageLocalGet(keys: any): Promise<Record<string, any>> {
  const area = storageLocalArea();
  if (!area) return {};
  try {
    const pending = area.get(keys);
    if (pending != null && typeof pending.then === "function") return await pending;
    return await new Promise((resolve, reject) => {
      try {
        area.get(keys, (result: any) => {
          const err = chromeLastErrorMessage();
          if (err) {
            reject(new Error(err));
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

export async function storageLocalSet(items: Record<string, unknown>): Promise<void> {
  const area = storageLocalArea();
  if (!area) return;
  try {
    const pending = area.set(items);
    if (pending != null && typeof pending.then === "function") await pending;
    else {
      await new Promise<void>((resolve, reject) => {
        area.set(items, () => {
          const err = chromeLastErrorMessage();
          if (err) {
            reject(new Error(err));
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

export async function storageLocalRemove(keys: any): Promise<void> {
  const area = storageLocalArea();
  if (!area?.remove) return;
  try {
    const pending = area.remove(keys);
    if (pending != null && typeof pending.then === "function") await pending;
    else {
      await new Promise<void>((resolve, reject) => {
        area.remove!(keys, () => {
          const err = chromeLastErrorMessage();
          if (err) {
            reject(new Error(err));
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

