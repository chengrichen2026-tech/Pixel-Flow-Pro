import type { RunStatus } from "../domain/task-run.ts";
import type { TaskStatus } from "../types.ts";

export const CHATGPT_ADAPTER_VERSION = 28;

export type GenerationImage = { base64: string; mimeType?: string; name?: string };

type TaskAddress = { projectId: string; taskId: string };
export type PageTaskMessage = TaskAddress & (
  | { type: "TASK_STATUS"; status: TaskStatus; runStatus?: RunStatus; detail?: string; apiJobId?: string; conversationUrl?: string; clearApiJobId?: boolean; persisted?: boolean; recovery?: boolean }
  | { type: "TASK_RESULT"; images: GenerationImage[]; responseText?: string; conversationUrl?: string; persisted?: boolean }
  | { type: "TASK_ERROR"; reason: string; detail?: string; conversationUrl?: string; persisted?: boolean; recovery?: boolean }
);

export type ExtensionMessage =
  | (TaskAddress & { type: "RUN_TASK" | "CANCEL_TASK" | "OPEN_TASK_TAB" | "CLOSE_TASK_TAB" })
  | { type: "RUN_TASKS"; projectId: string; taskIds: string[] }
  | { type: "HIBERNATE_TASK_TABS"; projectId: string; taskIds: string[] }
  | (TaskAddress & { type: "RECOVER_TEAM_RESULT"; jobId?: string })
  | (TaskAddress & { type: "DOWNLOAD_ASSET"; assetId: string; fileName?: string })
  | (TaskAddress & { type: "SHOW_NOTIFICATION"; title: string; message: string })
  | PageTaskMessage
  | (TaskAddress & { type: "CHECK_CHATGPT_ADAPTER" | "RESUME_CHATGPT_RESULT" | "EXECUTE_IN_CHATGPT" | "EXECUTE_IN_CHATGPT_V2" | "EXECUTE_IN_CHATGPT_V3"; [key: string]: unknown });

const taskTypes = new Set([
  "RUN_TASK", "RUN_TASKS", "RECOVER_TEAM_RESULT", "CANCEL_TASK", "OPEN_TASK_TAB", "CLOSE_TASK_TAB",
  "HIBERNATE_TASK_TABS", "TASK_STATUS", "TASK_RESULT", "TASK_ERROR", "DOWNLOAD_ASSET",
  "SHOW_NOTIFICATION", "CHECK_CHATGPT_ADAPTER", "RESUME_CHATGPT_RESULT", "EXECUTE_IN_CHATGPT",
  "EXECUTE_IN_CHATGPT_V2", "EXECUTE_IN_CHATGPT_V3"
]);
const taskStatuses = new Set<TaskStatus>(["idle", "queued", "waiting_page", "uploading", "sending", "generating", "completed", "failed", "manual_action"]);
const isGenerationImage = (value: unknown): value is GenerationImage => {
  if (!value || typeof value !== "object") return false;
  const image = value as Record<string, unknown>;
  return typeof image.base64 === "string"
    && (image.mimeType === undefined || typeof image.mimeType === "string")
    && (image.name === undefined || typeof image.name === "string");
};

export function isExtensionMessage(value: unknown): value is ExtensionMessage {
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
  if (message.type === "DOWNLOAD_ASSET") {
    return typeof message.projectId === "string" && typeof message.taskId === "string" && typeof message.assetId === "string";
  }
  if (message.type === "SHOW_NOTIFICATION") {
    return typeof message.projectId === "string" && typeof message.taskId === "string" && typeof message.title === "string" && typeof message.message === "string";
  }
  if (message.type === "TASK_RESULT") {
    return typeof message.projectId === "string" && typeof message.taskId === "string" && Array.isArray(message.images) && message.images.every(isGenerationImage);
  }
  if (message.type === "TASK_STATUS") {
    return typeof message.projectId === "string" && typeof message.taskId === "string" && taskStatuses.has(message.status as TaskStatus);
  }
  if (message.type === "TASK_ERROR") {
    return typeof message.projectId === "string" && typeof message.taskId === "string" && typeof message.reason === "string";
  }
  return typeof message.type === "string"
    && taskTypes.has(message.type)
    && typeof message.projectId === "string"
    && typeof message.taskId === "string";
}
