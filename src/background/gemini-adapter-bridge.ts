export const GEMINI_ADAPTER_VERSION = 4;

type TaskMessage = { projectId: string; taskId: string; [key: string]: unknown };

const isCurrentAdapter = (value: unknown): boolean =>
  Boolean(value && typeof value === "object" && (value as { adapterVersion?: number }).adapterVersion === GEMINI_ADAPTER_VERSION);

export async function probeGeminiAdapter(
  tabs: typeof chrome.tabs,
  tabId: number,
  message: TaskMessage
): Promise<Record<string, unknown> | undefined> {
  try {
    const state: unknown = await tabs.sendMessage(tabId, {
      type: "CHECK_GEMINI_ADAPTER",
      projectId: message.projectId,
      taskId: message.taskId
    });
    return isCurrentAdapter(state) ? state as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

export async function sendWithCurrentGeminiAdapter(
  tabs: typeof chrome.tabs,
  scripting: typeof chrome.scripting,
  tabId: number,
  message: TaskMessage
): Promise<unknown> {
  if (!await probeGeminiAdapter(tabs, tabId, message)) {
    await scripting.executeScript({ target: { tabId }, files: ["geminiContentScript.js"] });
    if (!await probeGeminiAdapter(tabs, tabId, message)) {
      throw new Error("Gemini 页面脚本重新连接失败，请刷新该标签页后重试");
    }
  }
  return tabs.sendMessage(tabId, { ...message, type: "EXECUTE_IN_GEMINI" });
}
