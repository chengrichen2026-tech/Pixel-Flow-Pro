const TEAM_GATEWAY_URL_STORAGE = "pixelFlowTeamGatewayUrl";
const TEAM_TOKEN_STORAGE = "pixelFlowTeamToken";
const TEAM_MEMBER_TOKEN_STORAGE = "pixelFlowTeamMemberToken";

export const DEFAULT_TEAM_RELAY_URL = "https://pixel-flow-codex-relay.pixel-flow-codex-relay.workers.dev";

export type TeamGatewaySettings = { url: string; token: string; memberToken: string };
export type TeamWebAvailability = { online: boolean; onlineCount: number };

function memberTokenPattern(value: string) {
  return /^pfm_[A-Za-z0-9_-]{32,64}$/.test(value);
}

export async function readTeamGateway(): Promise<TeamGatewaySettings> {
  if (globalThis.chrome?.storage?.local) {
    const value = await chrome.storage.local.get(TEAM_MEMBER_TOKEN_STORAGE);
    return {
      url: DEFAULT_TEAM_RELAY_URL,
      token: "",
      memberToken: typeof value[TEAM_MEMBER_TOKEN_STORAGE] === "string" ? value[TEAM_MEMBER_TOKEN_STORAGE].trim() : ""
    };
  }
  return {
    url: DEFAULT_TEAM_RELAY_URL,
    token: "",
    memberToken: localStorage.getItem(TEAM_MEMBER_TOKEN_STORAGE)?.trim() || ""
  };
}

async function teamMemberRequest(path: string, memberToken: string) {
  const response = await fetch(`${DEFAULT_TEAM_RELAY_URL}/team${path}`, {
    cache: "no-store",
    headers: { "X-Pixel-Member-Token": memberToken }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof payload?.error === "string" ? payload.error : payload?.message;
    throw new Error(message || (response.status === 401 ? "成员令牌无效、已停用或已重置" : `团队任务箱返回 HTTP ${response.status}`));
  }
  return payload;
}

export async function saveTeamGateway(memberTokenValue: string) {
  const memberToken = memberTokenValue.trim();
  if (!memberTokenPattern(memberToken)) throw new Error("请输入有效的成员令牌");
  await teamMemberRequest("/me", memberToken);
  if (globalThis.chrome?.storage?.local) {
    await chrome.storage.local.set({
      [TEAM_GATEWAY_URL_STORAGE]: DEFAULT_TEAM_RELAY_URL,
      [TEAM_MEMBER_TOKEN_STORAGE]: memberToken
    });
    await chrome.storage.local.remove(TEAM_TOKEN_STORAGE);
    return;
  }
  localStorage.setItem(TEAM_GATEWAY_URL_STORAGE, DEFAULT_TEAM_RELAY_URL);
  localStorage.setItem(TEAM_MEMBER_TOKEN_STORAGE, memberToken);
  localStorage.removeItem(TEAM_TOKEN_STORAGE);
}

export async function clearTeamGateway() {
  if (globalThis.chrome?.storage?.local) {
    await chrome.storage.local.remove([
      TEAM_GATEWAY_URL_STORAGE,
      TEAM_TOKEN_STORAGE,
      TEAM_MEMBER_TOKEN_STORAGE
    ]);
    return;
  }
  localStorage.removeItem(TEAM_GATEWAY_URL_STORAGE);
  localStorage.removeItem(TEAM_TOKEN_STORAGE);
  localStorage.removeItem(TEAM_MEMBER_TOKEN_STORAGE);
}

export async function hasTeamGateway() {
  const settings = await readTeamGateway();
  return memberTokenPattern(settings.memberToken);
}

export async function readTeamWebAvailability(): Promise<TeamWebAvailability> {
  const settings = await readTeamGateway();
  if (!memberTokenPattern(settings.memberToken)) return { online: false, onlineCount: 0 };
  const payload = await teamMemberRequest("/web-workers/availability", settings.memberToken);
  return {
    online: payload?.online === true,
    onlineCount: Number.isInteger(payload?.onlineCount) ? payload.onlineCount : 0
  };
}
