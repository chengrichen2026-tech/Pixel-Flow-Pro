import type { ApiImageModel } from "./types";

const API_KEY_STORAGE: Record<ApiImageModel, string> = {
  "gpt-image-2": "pixelFlowApiKey",
  "gpt-image-2.5-sunburst": "pixelFlowSunburstApiKey",
  "gpt-image-2.5-flare": "pixelFlowFlareApiKey"
};

export async function readApiKey(model?: ApiImageModel): Promise<string> {
  if (!model) {
    for (const candidate of Object.keys(API_KEY_STORAGE) as ApiImageModel[]) {
      const value: string = await readApiKey(candidate);
      if (value) return value;
    }
    return "";
  }
  const storageKey = API_KEY_STORAGE[model];
  if (globalThis.chrome?.storage?.local) {
    const value = await chrome.storage.local.get(storageKey);
    return typeof value[storageKey] === "string" ? value[storageKey].trim() : "";
  }
  return localStorage.getItem(storageKey)?.trim() || "";
}

export async function saveApiKey(apiKey: string, model: ApiImageModel = "gpt-image-2") {
  const value = apiKey.trim();
  if (!value) return;
  const storageKey = API_KEY_STORAGE[model];
  if (globalThis.chrome?.storage?.local) {
    await chrome.storage.local.set({ [storageKey]: value });
    return;
  }
  localStorage.setItem(storageKey, value);
}

export async function clearApiKey(model: ApiImageModel = "gpt-image-2") {
  const storageKey = API_KEY_STORAGE[model];
  if (globalThis.chrome?.storage?.local) {
    await chrome.storage.local.remove(storageKey);
    return;
  }
  localStorage.removeItem(storageKey);
}

export async function readApiKeyConfiguration() {
  const entries = await Promise.all((Object.keys(API_KEY_STORAGE) as ApiImageModel[]).map(async model => [model, Boolean(await readApiKey(model))] as const));
  return Object.fromEntries(entries) as Record<ApiImageModel, boolean>;
}

export async function apiBackgroundSupports(model: ApiImageModel): Promise<boolean> {
  try {
    const response = await chrome.runtime.sendMessage({ type: "GET_API_CAPABILITIES" });
    return response?.accepted === true && Array.isArray(response.apiModels) && response.apiModels.includes(model);
  } catch {
    return false;
  }
}
