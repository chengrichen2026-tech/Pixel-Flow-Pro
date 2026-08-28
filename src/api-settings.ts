const API_KEY_STORAGE = "pixelFlowApiKey";

export async function readApiKey() {
  if (globalThis.chrome?.storage?.local) {
    const value = await chrome.storage.local.get(API_KEY_STORAGE);
    return typeof value[API_KEY_STORAGE] === "string" ? value[API_KEY_STORAGE].trim() : "";
  }
  return localStorage.getItem(API_KEY_STORAGE)?.trim() || "";
}

export async function saveApiKey(apiKey: string) {
  const value = apiKey.trim();
  if (!value) return;
  if (globalThis.chrome?.storage?.local) {
    await chrome.storage.local.set({ [API_KEY_STORAGE]: value });
    return;
  }
  localStorage.setItem(API_KEY_STORAGE, value);
}

export async function clearApiKey() {
  if (globalThis.chrome?.storage?.local) {
    await chrome.storage.local.remove(API_KEY_STORAGE);
    return;
  }
  localStorage.removeItem(API_KEY_STORAGE);
}
