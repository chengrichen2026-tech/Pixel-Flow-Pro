import { DEFAULT_TEAM_RELAY_URL } from "../team-settings";

type GatewaySettings = { baseUrl: string; memberToken: string };
type GatewayErrorPayload = { error?: string | { message?: string }; message?: string };

export async function teamGatewaySettings(): Promise<GatewaySettings> {
  const values = await chrome.storage.local.get("pixelFlowTeamMemberToken");
  const memberToken = typeof values.pixelFlowTeamMemberToken === "string" ? values.pixelFlowTeamMemberToken.trim() : "";
  if (!/^pfm_[A-Za-z0-9_-]{32,64}$/.test(memberToken)) throw new Error("请先在“生图设置”中保存成员令牌");
  return { baseUrl: DEFAULT_TEAM_RELAY_URL, memberToken };
}

function gatewayErrorMessage(payload: GatewayErrorPayload) {
  return typeof payload.error === "string" ? payload.error : payload.error?.message || payload.message || "";
}

export async function teamGatewayRequest<T = Record<string, unknown>>(path: string, options: RequestInit = {}): Promise<T> {
  const { baseUrl, memberToken } = await teamGatewaySettings();
  for (let attempt = 0; attempt < 7; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/team${path}`, { ...options, headers: { "X-Pixel-Member-Token": memberToken, ...(options.headers || {}) } });
    } catch {
      throw new Error("无法连接团队生图服务，请检查网络和服务状态");
    }
    const payload = await response.json().catch(() => ({})) as T & GatewayErrorPayload;
    if (response.ok) return payload;
    const payloadMessage = gatewayErrorMessage(payload);
    if (response.status === 429 && /额度/.test(payloadMessage)) throw new Error(payloadMessage);
    if (response.status === 401) throw new Error(payloadMessage || "成员令牌无效、已停用或已重置");
    if (response.status === 429 && attempt < 6) {
      const retryAfterSeconds = Number(response.headers.get("Retry-After"));
      const retryDelay = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 ? retryAfterSeconds * 1_000 : Math.min(30_000, 2_000 * 2 ** attempt);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
      continue;
    }
    throw new Error(payloadMessage || (response.status === 429 ? "团队生图服务请求过于频繁，自动重试后仍被限流，请稍后再试" : `团队生图网关返回 HTTP ${response.status}`));
  }
  throw new Error("团队生图服务请求失败");
}

export async function cancelTeamGatewayJob(jobId: string): Promise<unknown> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await teamGatewayRequest(`/jobs/${jobId}/cancel`, { method: "POST" });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      if (detail !== "无法连接团队生图服务，请检查网络和服务状态" || attempt === 2) throw error;
      await new Promise(resolve => setTimeout(resolve, 500 * 2 ** attempt));
    }
  }
}

export async function teamGatewayResultRequest(path: string): Promise<Response> {
  const { baseUrl, memberToken } = await teamGatewaySettings();
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/team${path}`, { cache: "no-store", headers: { "X-Pixel-Member-Token": memberToken } });
  } catch {
    throw new Error("无法通过团队任务箱下载结果");
  }
  if (!response.ok) {
    const error = new Error(`团队任务箱结果代理返回 HTTP ${response.status}`) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return response;
}
