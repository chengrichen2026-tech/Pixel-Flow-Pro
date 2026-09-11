export const CHUNK_CHARACTERS = 60_000;

export function normalizeTaskboxUrl(value) {
  const url = new URL(String(value || "").trim());
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("妙搭任务箱地址必须使用 HTTP 或 HTTPS");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("妙搭任务箱地址不能包含账号、查询参数或锚点");
  }
  return url.href.replace(/\/$/, "");
}

export function splitBase64(value, chunkCharacters = CHUNK_CHARACTERS) {
  const normalized = String(value || "").replace(/\s/g, "");
  if (!normalized || chunkCharacters < 4 || chunkCharacters % 4 !== 0) {
    throw new Error("Base64 或分块大小无效");
  }
  const chunks = [];
  for (let offset = 0; offset < normalized.length; offset += chunkCharacters) {
    chunks.push(normalized.slice(offset, offset + chunkCharacters));
  }
  return chunks;
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
