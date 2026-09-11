import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const DEFAULT_DAILY_LIMIT = 20;
export const MAX_INPUT_BYTES = 80 * 1024 * 1024;

export function hashToken(token) {
  return createHash("sha256").update(String(token)).digest("hex");
}

export function createMemberToken() {
  return `pft_${randomBytes(24).toString("base64url")}`;
}

export function normalizeDailyLimit(value, fallback = DEFAULT_DAILY_LIMIT) {
  if (value === null || value === 0 || value === "0" || value === "unlimited" || value === "不限") return null;
  const parsed = Number(value === void 0 || value === "" ? fallback : value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error("每日额度必须是正整数或 unlimited");
  return parsed;
}

export function tokenMatches(token, expectedHash) {
  const actual = Buffer.from(hashToken(token), "hex");
  const expected = Buffer.from(String(expectedHash || ""), "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function normalizeGatewayUrl(value) {
  const url = new URL(String(value || "").trim());
  if (!/^https?:$/.test(url.protocol)) throw new Error("团队网关只支持 HTTP 或 HTTPS");
  if (url.username || url.password || url.search || url.hash) throw new Error("团队网关地址不能包含账号、查询参数或锚点");
  return url.href.replace(/\/$/, "");
}

export function validateJobInput(input) {
  if (!input || typeof input !== "object") throw new Error("任务内容必须是 JSON 对象");
  const prompt = String(input.prompt || "").trim();
  const requestId = String(input.requestId || "").trim();
  if (!prompt) throw new Error("缺少提示词");
  if (prompt.length > 32_000) throw new Error("提示词超过 32000 字符限制");
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(requestId)) throw new Error("requestId 格式无效");
  const ratio = String(input.ratio || "auto");
  const images = Array.isArray(input.images) ? input.images : [];
  if (images.length > 10) throw new Error("参考图最多 10 张");
  const normalizedImages = images.map((image, index) => {
    const base64 = String(image?.base64 || "").replace(/\s/g, "");
    const mimeType = String(image?.mimeType || "image/png").toLowerCase();
    if (!base64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new Error(`第 ${index + 1} 张参考图不是有效 Base64`);
    if (!/^image\/(png|jpeg|webp)$/.test(mimeType)) throw new Error(`第 ${index + 1} 张参考图格式不支持`);
    return { base64, mimeType, name: `reference-${index + 1}.${mimeType === "image/jpeg" ? "jpg" : mimeType.split("/")[1]}` };
  });
  return { requestId, prompt, ratio, images: normalizedImages };
}

export function sizeForRatio(ratio) {
  return ({
    "1:1": "1024x1024",
    "3:4": "768x1024",
    "4:3": "1024x768",
    "4:5": "768x960",
    "5:4": "960x768",
    "2:3": "768x1152",
    "3:2": "1152x768",
    "9:16": "720x1280",
    "16:9": "1280x720",
    "21:9": "1344x576"
  })[ratio] || "1024x1024";
}

export function dayKey(timestamp = Date.now()) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

export function publicJob(job, queuePosition = 0) {
  return {
    id: job.id,
    requestId: job.requestId,
    status: job.status,
    queuePosition: job.status === "queued" ? queuePosition : void 0,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    images: job.status === "completed" ? job.images : void 0,
    error: job.status === "failed" ? job.error : void 0
  };
}
