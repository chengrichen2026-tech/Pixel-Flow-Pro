export const CHATGPT_ADAPTER_VERSION = 28;

const taskTypes = new Set([
  "RUN_TASK", "RUN_TASKS", "RECOVER_TEAM_RESULT", "CANCEL_TASK", "OPEN_TASK_TAB", "CLOSE_TASK_TAB",
  "HIBERNATE_TASK_TABS", "TASK_STATUS", "TASK_RESULT", "TASK_ERROR", "DOWNLOAD_ASSET",
  "SHOW_NOTIFICATION", "CHECK_CHATGPT_ADAPTER", "RESUME_CHATGPT_RESULT", "EXECUTE_IN_CHATGPT",
  "EXECUTE_IN_CHATGPT_V2", "EXECUTE_IN_CHATGPT_V3"
]);

export function isExtensionMessage(value: unknown): value is Record<string, unknown> & { type: string } {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  if (message.type === "HIBERNATE_TASK_TABS") {
    return typeof message.projectId === "string"
      && Array.isArray(message.taskIds)
      && message.taskIds.every(taskId => typeof taskId === "string");
  }
  if (message.type === "RUN_TASKS") {
    return typeof message.projectId === "string"
      && Array.isArray(message.taskIds)
      && message.taskIds.length > 0
      && message.taskIds.every(taskId => typeof taskId === "string");
  }
  return typeof message.type === "string"
    && taskTypes.has(message.type)
    && typeof message.projectId === "string"
    && typeof message.taskId === "string";
}
