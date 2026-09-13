const RELAY_URL_STORAGE = "pixelFlowTeamWebWorkerRelayUrl";
const DEVICE_TOKEN_STORAGE = "pixelFlowTeamWebWorkerDeviceToken";
const WORKER_ID_STORAGE = "pixelFlowTeamWebWorkerId";
const DEVICE_NAME_STORAGE = "pixelFlowTeamWebWorkerName";
const ENABLED_STORAGE = "pixelFlowTeamWebWorkerEnabled";

export type TeamWebWorkerSettings = {
  relayUrl: string;
  deviceToken: string;
  workerId: string;
  name: string;
  enabled: boolean;
};

export function normalizeWebWorkerRelayUrl(value: string) {
  const url = new URL(value.trim());
  if (url.protocol !== "https:") throw new Error("网页生图机中继地址必须使用 HTTPS");
  if (url.username || url.password || url.search || url.hash) throw new Error("中继地址不能包含账号、查询参数或锚点");
  return url.href.replace(/\/$/, "");
}

export async function readTeamWebWorker(): Promise<TeamWebWorkerSettings> {
  const value = await chrome.storage.local.get([
    RELAY_URL_STORAGE,
    DEVICE_TOKEN_STORAGE,
    WORKER_ID_STORAGE,
    DEVICE_NAME_STORAGE,
    ENABLED_STORAGE
  ]);
  return {
    relayUrl: typeof value[RELAY_URL_STORAGE] === "string" ? value[RELAY_URL_STORAGE].trim() : "",
    deviceToken: typeof value[DEVICE_TOKEN_STORAGE] === "string" ? value[DEVICE_TOKEN_STORAGE].trim() : "",
    workerId: typeof value[WORKER_ID_STORAGE] === "string" ? value[WORKER_ID_STORAGE].trim() : "",
    name: typeof value[DEVICE_NAME_STORAGE] === "string" ? value[DEVICE_NAME_STORAGE].trim() : "",
    enabled: value[ENABLED_STORAGE] === true
  };
}

export async function pairTeamWebWorker(relayValue: string, pairingValue: string, nameValue: string) {
  const relayUrl = normalizeWebWorkerRelayUrl(relayValue);
  const pairingCode = pairingValue.replace(/\s/g, "");
  const name = nameValue.trim();
  if (!/^\d{8}$/.test(pairingCode)) throw new Error("请输入 8 位一次性配对码");
  if (!name) throw new Error("请输入网页生图机名称");
  const permission = { origins: [`${new URL(relayUrl).origin}/*`] };
  const granted = await chrome.permissions.contains(permission) || await chrome.permissions.request(permission);
  if (!granted) throw new Error("未授权 Pixel Flow 访问网页生图任务中继");
  const response = await fetch(`${relayUrl}/web-worker/pair`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pairingCode, deviceName: name })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || payload.error || `配对失败（HTTP ${response.status}）`);
  if (!/^pfw_[A-Za-z0-9_-]{32,64}$/.test(payload.deviceToken || "") || !payload.workerId) throw new Error("任务箱没有返回有效的设备凭证");
  await chrome.storage.local.set({
    [RELAY_URL_STORAGE]: relayUrl,
    [DEVICE_TOKEN_STORAGE]: payload.deviceToken,
    [WORKER_ID_STORAGE]: payload.workerId,
    [DEVICE_NAME_STORAGE]: name,
    [ENABLED_STORAGE]: true
  });
  void chrome.runtime.sendMessage({ type: "TEAM_WEB_WORKER_SETTINGS_CHANGED" }).catch(() => undefined);
  return payload;
}

export async function setTeamWebWorkerEnabled(enabled: boolean) {
  const current = await readTeamWebWorker();
  if (enabled && (!current.relayUrl || !current.deviceToken || !current.workerId)) throw new Error("请先完成网页生图机配对");
  await chrome.storage.local.set({ [ENABLED_STORAGE]: enabled });
  void chrome.runtime.sendMessage({ type: "TEAM_WEB_WORKER_SETTINGS_CHANGED" }).catch(() => undefined);
}

export async function clearTeamWebWorker() {
  await chrome.storage.local.remove([
    RELAY_URL_STORAGE,
    DEVICE_TOKEN_STORAGE,
    WORKER_ID_STORAGE,
    DEVICE_NAME_STORAGE,
    ENABLED_STORAGE
  ]);
  void chrome.runtime.sendMessage({ type: "TEAM_WEB_WORKER_SETTINGS_CHANGED" }).catch(() => undefined);
}
