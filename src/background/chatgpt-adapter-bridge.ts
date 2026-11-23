import { CHATGPT_ADAPTER_VERSION } from "./protocol.ts";

type TaskMessage = { projectId: string; taskId: string; [key: string]: unknown };
type AdapterReconnectOptions = {
  refreshTab?: () => Promise<void>;
  initialProbeMs?: number;
  injectedProbeMs?: number;
  refreshedProbeMs?: number;
  pollIntervalMs?: number;
};

export class ChatGptAdapterReconnectError extends Error {
  constructor(detail: string) {
    super(`ChatGPT 页面脚本重新连接失败（${detail}），请刷新该标签页后重试`);
    this.name = "ChatGptAdapterReconnectError";
  }
}

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
  message: TaskMessage,
  options: AdapterReconnectOptions = {}
): Promise<unknown> {
  const pollIntervalMs = options.pollIntervalMs ?? 300;
  const waitForAdapter = async (timeoutMs: number): Promise<boolean> => {
    const deadline = Date.now() + timeoutMs;
    do {
      if (await probeAdapter(tabs, tabId, message)) return true;
      const remaining = deadline - Date.now();
      if (remaining > 0) await new Promise(resolve => setTimeout(resolve, Math.min(pollIntervalMs, remaining)));
    } while (Date.now() < deadline);
    return false;
  };

  const initialProbeMs = options.initialProbeMs ?? 600;
  const injectedProbeMs = options.injectedProbeMs ?? 4_000;
  const refreshedProbeMs = options.refreshedProbeMs ?? 7_000;
  let lastError = "页面脚本未响应";

  if (!await waitForAdapter(initialProbeMs)) {
    try {
      await scripting.executeScript({ target: { tabId }, files: ["contentScript.js"] });
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    if (!await waitForAdapter(injectedProbeMs) && options.refreshTab) {
      try {
        await options.refreshTab();
        await scripting.executeScript({ target: { tabId }, files: ["contentScript.js"] });
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
      if (!await waitForAdapter(refreshedProbeMs)) lastError = "刷新标签页后页面脚本仍未响应";
    }
    if (!await waitForAdapter(0)) {
      throw new ChatGptAdapterReconnectError(lastError);
    }
  }
  return tabs.sendMessage(tabId, { ...message, type: "EXECUTE_IN_CHATGPT_V3" });
}
