export const runStatuses = [
  "queued",
  "preparing",
  "uploading",
  "sending",
  "submitted",
  "generating",
  "needs_action",
  "delivering",
  "completed",
  "failed",
  "canceled"
] as const;

export type RunStatus = (typeof runStatuses)[number];

export const terminalRunStatuses = ["completed", "failed", "canceled"] as const satisfies readonly RunStatus[];

const transitions: Readonly<Record<RunStatus, readonly RunStatus[]>> = {
  queued: ["preparing", "failed", "canceled"],
  preparing: ["uploading", "sending", "submitted", "failed", "needs_action", "canceled"],
  uploading: ["sending", "failed", "needs_action", "canceled"],
  sending: ["submitted", "generating", "failed", "needs_action", "canceled"],
  submitted: ["generating", "delivering", "completed", "failed", "needs_action", "canceled"],
  generating: ["delivering", "completed", "failed", "needs_action", "canceled"],
  needs_action: ["submitted", "generating", "delivering", "completed", "failed", "canceled"],
  delivering: ["completed", "failed", "canceled"],
  completed: [],
  failed: [],
  canceled: []
};

export const isTerminalRunStatus = (status: RunStatus): boolean =>
  (terminalRunStatuses as readonly RunStatus[]).includes(status);

export const canTransitionRun = (current: RunStatus, next: RunStatus): boolean =>
  current === next || transitions[current].includes(next);

export function transitionRunStatus(current: RunStatus, next: RunStatus): RunStatus {
  if (!canTransitionRun(current, next)) {
    throw new Error(`Invalid task run transition: ${current} -> ${next}`);
  }
  return next;
}

export function resolveRunTransition(current: RunStatus, target: RunStatus): RunStatus[] {
  if (current === target) return [];
  const pending: Array<{ status: RunStatus; path: RunStatus[] }> = [{ status: current, path: [] }];
  const visited = new Set<RunStatus>([current]);
  while (pending.length) {
    const candidate = pending.shift()!;
    for (const next of transitions[candidate.status]) {
      const path = [...candidate.path, next];
      if (next === target) return path;
      if (!visited.has(next)) {
        visited.add(next);
        pending.push({ status: next, path });
      }
    }
  }
  throw new Error(`Invalid task run transition: ${current} -> ${target}`);
}

export type LegacyTaskStatus =
  | "idle"
  | "queued"
  | "waiting_page"
  | "uploading"
  | "sending"
  | "generating"
  | "manual_action"
  | "completed"
  | "failed";

const legacyToRunStatus: Readonly<Record<Exclude<LegacyTaskStatus, "idle">, RunStatus>> = {
  queued: "queued",
  waiting_page: "preparing",
  uploading: "uploading",
  sending: "sending",
  generating: "generating",
  manual_action: "needs_action",
  completed: "completed",
  failed: "failed"
};

export function legacyTaskStatusToRunStatus(status: LegacyTaskStatus): RunStatus | undefined {
  return status === "idle" ? undefined : legacyToRunStatus[status];
}

export function runStatusToLegacyTaskStatus(status: RunStatus): LegacyTaskStatus {
  if (status === "preparing" || status === "submitted" || status === "delivering") return "generating";
  if (status === "needs_action") return "manual_action";
  if (status === "canceled") return "failed";
  return status;
}
