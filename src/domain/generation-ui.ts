import { legacyTaskStatusToRunStatus, type RunStatus } from "./task-run.ts";
import type { GenerationMode, TeamImageModel } from "../types.ts";

export type GenerationProvider = "gpt_web" | "team_cloud" | "api";
export type GptWebLocation = "local" | "team";

export function generationProvider(mode: GenerationMode): GenerationProvider {
  if (mode === "browser" || mode === "team_web") return "gpt_web";
  return mode === "team" ? "team_cloud" : "api";
}

export function gptWebLocation(mode: GenerationMode): GptWebLocation {
  return mode === "team_web" ? "team" : "local";
}

export function generationModeForProvider(provider: GenerationProvider, location: GptWebLocation = "local"): GenerationMode {
  if (provider === "gpt_web") return location === "team" ? "team_web" : "browser";
  return provider === "team_cloud" ? "team" : "api";
}

export function generationModelLabel(mode: GenerationMode, teamImageModel: TeamImageModel): string {
  if (mode === "api") return "gpt-image-2";
  if (mode === "team") return teamImageModel === "sunburst" ? "Sunburst" : "Flare";
  return "ChatGPT Image";
}

const runStatusLabels: Record<RunStatus, string> = {
  queued: "排队中",
  preparing: "准备执行环境",
  uploading: "上传参考图",
  sending: "发送任务",
  submitted: "等待执行机接单",
  generating: "正在生成",
  needs_action: "等待手动处理",
  delivering: "正在写回",
  completed: "已完成",
  failed: "运行失败",
  canceled: "已取消"
};

export function taskRunStatus(task: { status: string; runtimeStatus?: RunStatus }): RunStatus | undefined {
  if (task.status === "idle") return undefined;
  if (task.runtimeStatus) return task.runtimeStatus;
  return legacyTaskStatusToRunStatus(task.status as Parameters<typeof legacyTaskStatusToRunStatus>[0]);
}

export function taskStatusLabel(task: { status: string; runtimeStatus?: RunStatus; statusDetail?: string }): string {
  const status = taskRunStatus(task);
  if (!status) return "尚未运行";
  const detail = task.statusDetail || "";
  if (status === "submitted" && /上线|在线/.test(detail)) return "等待上线";
  if (status === "submitted" && /忙/.test(detail)) return "执行机忙";
  if ((status === "generating" || status === "submitted") && /回传|写回/.test(detail)) return "正在写回";
  return runStatusLabels[status];
}

export const isActiveTaskRun = (task: { status: string; runtimeStatus?: RunStatus }): boolean => {
  const status = taskRunStatus(task);
  return Boolean(status && !["completed", "failed", "canceled"].includes(status));
};
