import { CHATGPT_ADAPTER_VERSION } from "./protocol.ts";

type TaskMessage = { projectId: string; taskId: string; [key: string]: unknown };

const isCurrentAdapter = (value: unknown): boolean =>
  Boolean(value && typeof value === "object" && (value as { adapterVersion?: number }).adapterVersion === CHATGPT_ADAPTER_VERSION);

export async function probeAdapter(
  tabs: typeof chrome.tabs,
  tabId: number,
  message: TaskMessage
): Promise<Record<string, unknown> | undefined> {
  try {
    const state: unknown = await tabs.sendMessage(tabId, {
      type: "CHECK_CHATGPT_ADAPTER",
      projectId: message.projectId,
      taskId: message.taskId
    });
    return isCurrentAdapter(state) ? state as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

export async function sendWithCurrentChatGptAdapter(
  tabs: typeof chrome.tabs,
  scripting: typeof chrome.scripting,
  tabId: number,
  message: TaskMessage
): Promise<unknown> {
  if (!await probeAdapter(tabs, tabId, message)) {
    await scripting.executeScript({ target: { tabId }, files: ["contentScript.js"] });
    if (!await probeAdapter(tabs, tabId, message)) {
      throw new Error("ChatGPT 页面脚本重新连接失败，请刷新该标签页后重试");
    }
  }
  return tabs.sendMessage(tabId, { ...message, type: "EXECUTE_IN_CHATGPT_V3" });
}
