export const PIXEL_FLOW_API_BASE_URL = "https://aihub.rbmanon.cn/v1";
export const PIXEL_FLOW_API_MODEL = "gpt-image-2";
export const PIXEL_FLOW_API_QUALITY = "medium";

export function sizeForRatio(ratio) {
  const sizes = {
    "3:4": "768x1024",
    "4:3": "1024x768",
    "4:5": "768x960",
    "5:4": "960x768",
    "2:3": "768x1152",
    "3:2": "1152x768",
    "9:16": "720x1280",
    "16:9": "1280x720",
    "21:9": "1344x576"
  };
  if (sizes[ratio]) return sizes[ratio];
  return "1024x1024";
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 32768;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

async function blobToImage(blob) {
  return {
    base64: bytesToBase64(new Uint8Array(await blob.arrayBuffer())),
    mimeType: blob.type || "image/png"
  };
}

async function readError(response) {
  let detail = `API 请求失败：HTTP ${response.status}`;
  try {
    const payload = await response.json();
    detail = payload?.error?.message || payload?.message || payload?.detail || detail;
  } catch {
    try {
      const text = await response.text();
      if (text.trim()) detail = `${detail}｜${text.trim().slice(0, 300)}`;
    } catch {
    }
  }
  return detail;
}

export async function requestApiImages({
  apiKey,
  prompt,
  ratio = "auto",
  imageBlobs = [],
  fetchImpl = fetch,
  baseUrl = PIXEL_FLOW_API_BASE_URL,
  timeoutMs = 7 * 60 * 1000
}) {
  if (!apiKey?.trim()) throw new Error("请先保存 API Key");
  if (!prompt?.trim()) throw new Error("任务没有可发送的文字或提示词");
  const size = sizeForRatio(ratio);
  const headers = { Authorization: `Bearer ${apiKey.trim()}` };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response;
    if (imageBlobs.length > 0) {
      const images = await Promise.all(imageBlobs.map(async (item) => ({
        image_url: `data:${item.blob.type || "image/png"};base64,${bytesToBase64(new Uint8Array(await item.blob.arrayBuffer()))}`
      })));
      response = await fetchImpl(`${baseUrl}/images/edits`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ model: PIXEL_FLOW_API_MODEL, prompt, images, size, quality: PIXEL_FLOW_API_QUALITY, output_format: "png", n: 1 }),
        signal: controller.signal
      });
    } else {
      response = await fetchImpl(`${baseUrl}/images/generations`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ model: PIXEL_FLOW_API_MODEL, prompt, size, quality: PIXEL_FLOW_API_QUALITY, output_format: "png", n: 1 }),
        signal: controller.signal
      });
    }
    if (!response.ok) throw new Error(await readError(response));
    const payload = await response.json();
    if (!Array.isArray(payload?.data) || payload.data.length === 0) throw new Error("API 返回中没有图片数据");
    const images = [];
    for (const item of payload.data) {
      if (typeof item?.b64_json === "string" && item.b64_json) {
        images.push({ base64: item.b64_json, mimeType: item.mime_type || "image/png" });
        continue;
      }
      if (typeof item?.url === "string" && item.url) {
        const imageResponse = await fetchImpl(item.url, { signal: controller.signal });
        if (!imageResponse.ok) throw new Error(`读取 API 图片失败：HTTP ${imageResponse.status}`);
        images.push(await blobToImage(await imageResponse.blob()));
      }
    }
    if (images.length === 0) throw new Error("API 返回中没有可用的 b64_json 或图片 URL");
    return images;
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`API 生图等待超过 ${Math.max(1, Math.round(timeoutMs / 60000))} 分钟，任务已停止；请先检查平台调用记录，再决定是否重试`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
