const TEAM_GATEWAY_URL_STORAGE = "pixelFlowTeamGatewayUrl";
const TEAM_TOKEN_STORAGE = "pixelFlowTeamToken";

export type TeamGatewaySettings = { url: string; token: string };

export function normalizeTeamGatewayUrl(value: string) {
  const url = new URL(value.trim());
  if (!/^https?:$/.test(url.protocol)) throw new Error("团队网关只支持 HTTP 或 HTTPS");
  if (url.username || url.password || url.search || url.hash) throw new Error("团队网关地址不能包含账号、查询参数或锚点");
  return url.href.replace(/\/$/, "");
}

export function teamGatewayOriginPattern(value: string) {
  const url = new URL(normalizeTeamGatewayUrl(value));
  return `${url.origin}/*`;
}

export async function readTeamGateway(): Promise<TeamGatewaySettings> {
  if (globalThis.chrome?.storage?.local) {
    const value = await chrome.storage.local.get([TEAM_GATEWAY_URL_STORAGE, TEAM_TOKEN_STORAGE]);
    return {
      url: typeof value[TEAM_GATEWAY_URL_STORAGE] === "string" ? value[TEAM_GATEWAY_URL_STORAGE].trim() : "",
      token: typeof value[TEAM_TOKEN_STORAGE] === "string" ? value[TEAM_TOKEN_STORAGE].trim() : ""
    };
  }
  return {
    url: localStorage.getItem(TEAM_GATEWAY_URL_STORAGE)?.trim() || "",
    token: localStorage.getItem(TEAM_TOKEN_STORAGE)?.trim() || ""
  };
}

export async function saveTeamGateway(urlValue: string, tokenValue: string) {
  const url = normalizeTeamGatewayUrl(urlValue);
  const token = tokenValue.trim();
  if (!token) throw new Error("请输入团队令牌");
  if (globalThis.chrome?.runtime?.id) {
    const permission = { origins: [teamGatewayOriginPattern(url)] };
    const granted = await chrome.permissions.contains(permission) || await chrome.permissions.request(permission);
    if (!granted) throw new Error("未授权 Pixel Flow 访问该团队网关");
  }
  if (globalThis.chrome?.storage?.local) {
    await chrome.storage.local.set({ [TEAM_GATEWAY_URL_STORAGE]: url, [TEAM_TOKEN_STORAGE]: token });
    return;
  }
  localStorage.setItem(TEAM_GATEWAY_URL_STORAGE, url);
  localStorage.setItem(TEAM_TOKEN_STORAGE, token);
}

export async function clearTeamGateway() {
  const current = await readTeamGateway();
  if (globalThis.chrome?.storage?.local) {
    await chrome.storage.local.remove([TEAM_GATEWAY_URL_STORAGE, TEAM_TOKEN_STORAGE]);
    if (current.url) {
      await chrome.permissions.remove({ origins: [teamGatewayOriginPattern(current.url)] }).catch(() => false);
    }
    return;
  }
  localStorage.removeItem(TEAM_GATEWAY_URL_STORAGE);
  localStorage.removeItem(TEAM_TOKEN_STORAGE);
}

export async function hasTeamGateway() {
  const settings = await readTeamGateway();
  return Boolean(settings.url && settings.token);
}
