import { isTerminalRunStatus, legacyTaskStatusToRunStatus, runStatusToLegacyTaskStatus, type LegacyTaskStatus, type RunStatus } from "./task-run.ts";

export type RunEvent =
  | { type: "TASK_STATUS"; status: LegacyTaskStatus; runStatus?: RunStatus; detail?: string; apiJobId?: string; conversationUrl?: string; clearApiJobId?: boolean }
  | { type: "TASK_RESULT"; images: unknown[]; responseText?: string; conversationUrl?: string }
  | { type: "TASK_ERROR"; reason: string; detail?: string; conversationUrl?: string };

export type RunProjectionRecord = {
  status: RunStatus;
  providerJobId?: string;
  conversationUrl?: string;
  detail?: string;
};

export type LegacyRuntimeTask = {
  status: LegacyTaskStatus;
  apiJobId?: string;
  conversationUrl?: string;
  statusDetail?: string;
};

const manualActionReasons = new Set([
  "login_required",
  "verification_required",
  "usage_limited",
  "conversation_unavailable",
  "send_interaction_required"
]);

export function runEventStatus(event: RunEvent): RunStatus | undefined {
  if (event.type === "TASK_STATUS") return event.runStatus ?? legacyTaskStatusToRunStatus(event.status);
  if (event.type === "TASK_RESULT") return "completed";
  return manualActionReasons.has(event.reason) ? "needs_action" : "failed";
}

export function runEventPatch(event: RunEvent): { providerJobId?: string | null; conversationUrl?: string; detail?: string | null } {
  if (event.type === "TASK_STATUS") {
    return {
      providerJobId: event.clearApiJobId ? null : event.apiJobId,
      conversationUrl: event.conversationUrl,
      detail: event.detail ?? null
    };
  }
  if (event.type === "TASK_RESULT") {
    const hasContent = event.images.length > 0 || Boolean(event.responseText?.trim());
    return {
      conversationUrl: event.conversationUrl,
      detail: hasContent ? null : "已完成，但没有生成内容"
    };
  }
  return { conversationUrl: event.conversationUrl, detail: event.detail ?? null };
}

export function projectRunToLegacyTask(run: RunProjectionRecord): {
  status: LegacyTaskStatus;
  runtimeStatus: RunStatus;
  recoverableResult: boolean;
  statusDetail?: string;
  apiJobId?: string;
  conversationUrl?: string;
} {
  return {
    status: runStatusToLegacyTaskStatus(run.status),
    runtimeStatus: run.status,
    recoverableResult: run.status === "failed" && Boolean(run.providerJobId),
    statusDetail: run.detail,
    apiJobId: isTerminalRunStatus(run.status) ? undefined : run.providerJobId,
    conversationUrl: run.conversationUrl
  };
}

export const isDuplicateTerminalRunEvent = (current: RunStatus, target: RunStatus): boolean =>
  current === target && isTerminalRunStatus(current);

export function resolveTaskRuntime(task: LegacyRuntimeTask, run?: RunProjectionRecord): {
  status?: RunStatus;
  providerJobId?: string;
  conversationUrl?: string;
  detail?: string;
  active: boolean;
  authoritative: boolean;
} {
  const status = run?.status ?? legacyTaskStatusToRunStatus(task.status);
  return {
    status,
    providerJobId: run ? run.providerJobId : task.apiJobId,
    conversationUrl: run?.conversationUrl ?? task.conversationUrl,
    detail: run ? run.detail : task.statusDetail,
    active: Boolean(status && !isTerminalRunStatus(status)),
    authoritative: Boolean(run)
  };
}
