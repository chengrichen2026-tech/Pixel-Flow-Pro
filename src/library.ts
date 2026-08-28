export const LIBRARY_STORAGE_KEY = "pixelFlowMvpLibraryV1";
export const PROMPT_TAGS = ["模版", "构图", "背景", "功能"] as const;

export type PromptItem = { id: string; name: string; content: string; tags?: string[]; exampleAssetId?: string };
export type MediaItem = { id: string; kind: "product" | "reference"; name: string; assetId: string };
export type LibraryData = { prompts: PromptItem[]; media: MediaItem[] };

const inferTags = (item: PromptItem) => {
  if (Array.isArray(item.tags) && item.tags.length) return item.tags.filter(tag => PROMPT_TAGS.includes(tag as typeof PROMPT_TAGS[number]));
  const text = `${item.name || ""} ${item.content || ""}`;
  const tags: string[] = [];
  if (/模版|模板/.test(text)) tags.push("模版");
  if (/构图|排列|堆叠|复刻/.test(text)) tags.push("构图");
  if (/背景|场景|卧室|氛围/.test(text)) tags.push("背景");
  if (/材质|精修|生成规范|功能/.test(text)) tags.push("功能");
  return tags.length ? [...new Set(tags)] : ["功能"];
};

export function readLibrary(): LibraryData {
  try {
    const parsed = JSON.parse(localStorage.getItem(LIBRARY_STORAGE_KEY) || "null");
    return {
      prompts: (parsed?.prompts || []).map((item: PromptItem) => ({ ...item, tags: inferTags(item) })),
      media: (parsed?.media || []).filter((item: MediaItem) => item?.assetId && (item.kind === "product" || item.kind === "reference"))
    };
  } catch {
    return { prompts: [], media: [] };
  }
}

export type LibraryDragPayload =
  | { kind: "prompt"; content: string }
  | { kind: "media"; assetId: string; name: string };

export const LIBRARY_DRAG_TYPE = "application/x-pixel-flow-library";

export function readLibraryDrag(dataTransfer: DataTransfer): LibraryDragPayload | undefined {
  try {
    const payload = JSON.parse(dataTransfer.getData(LIBRARY_DRAG_TYPE) || "null");
    if (payload?.kind === "prompt" && typeof payload.content === "string") return payload;
    if (payload?.kind === "media" && typeof payload.assetId === "string" && typeof payload.name === "string") return payload;
  } catch {
    return;
  }
}
