import { isTerminalRunStatus, resolveRunTransition, transitionRunStatus, type RunStatus } from "../domain/task-run.ts";
import type { GenerationMode } from "../types.ts";

export type TaskRunRecord = {
  schemaVersion: 2;
  id: string;
  projectId: string;
  taskId: string;
  attempt: number;
  provider: GenerationMode;
  status: RunStatus;
  startedAt: number;
  updatedAt: number;
  terminalAt?: number;
  providerJobId?: string;
  conversationUrl?: string;
  detail?: string;
};

export type TaskRunPatch = {
  providerJobId?: string | null;
  conversationUrl?: string | null;
  detail?: string | null;
};

export interface TaskRunTable {
  toArray(): Promise<TaskRunRecord[]>;
  get(id: string): Promise<TaskRunRecord | undefined>;
  put(record: TaskRunRecord): Promise<unknown>;
}

const runId = () => `run-${crypto.randomUUID()}`;
const isCurrentRecord = (run: TaskRunRecord): boolean => run.schemaVersion === 2 && Number.isInteger(run.attempt) && typeof run.status === "string";
const applyPatch = (record: TaskRunRecord, patch: TaskRunPatch): TaskRunRecord => {
  const next = { ...record };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (value === null) delete next[key as keyof TaskRunRecord];
    else Object.assign(next, { [key]: value });
  }
  return next;
};

export class TaskRunRepository {
  private readonly table: TaskRunTable;
  private readonly now: () => number;

  constructor(table: TaskRunTable, now: () => number = Date.now) {
    this.table = table;
    this.now = now;
  }

  async list(projectId: string, taskId: string): Promise<TaskRunRecord[]> {
    return (await this.table.toArray())
      .filter(run => isCurrentRecord(run) && run.projectId === projectId && run.taskId === taskId)
      .sort((left, right) => left.attempt - right.attempt);
  }

  async latest(projectId: string, taskId: string): Promise<TaskRunRecord | undefined> {
    return (await this.list(projectId, taskId)).at(-1);
  }

  async latestByProject(projectId: string): Promise<Map<string, TaskRunRecord>> {
    const latest = new Map<string, TaskRunRecord>();
    for (const run of await this.table.toArray()) {
      if (!isCurrentRecord(run) || run.projectId !== projectId) continue;
      const current = latest.get(run.taskId);
      if (!current || run.attempt > current.attempt) latest.set(run.taskId, structuredClone(run));
    }
    return latest;
  }

  async start(projectId: string, taskId: string, provider: GenerationMode): Promise<TaskRunRecord> {
    const runs = await this.list(projectId, taskId);
    const latest = runs.at(-1);
    if (latest && !isTerminalRunStatus(latest.status)) return structuredClone(latest);
    const timestamp = this.now();
    const run: TaskRunRecord = {
      schemaVersion: 2,
      id: runId(),
      projectId,
      taskId,
      attempt: (latest?.attempt ?? 0) + 1,
      provider,
      status: "queued",
      startedAt: timestamp,
      updatedAt: timestamp
    };
    await this.table.put(run);
    return structuredClone(run);
  }

  async transition(id: string, status: RunStatus, patch: TaskRunPatch = {}): Promise<TaskRunRecord> {
    const current = await this.table.get(id);
    if (!current) throw new Error(`Task run not found: ${id}`);
    const nextStatus = transitionRunStatus(current.status, status);
    const timestamp = this.now();
    const next: TaskRunRecord = {
      ...applyPatch(current, patch),
      status: nextStatus,
      updatedAt: timestamp,
      terminalAt: isTerminalRunStatus(nextStatus) ? current.terminalAt ?? timestamp : undefined
    };
    await this.table.put(next);
    return structuredClone(next);
  }

  async advance(id: string, status: RunStatus, patch: TaskRunPatch = {}): Promise<TaskRunRecord> {
    const current = await this.table.get(id);
    if (!current || !isCurrentRecord(current)) throw new Error(`Task run not found: ${id}`);
    resolveRunTransition(current.status, status);
    const timestamp = this.now();
    const next: TaskRunRecord = {
      ...applyPatch(current, patch),
      status,
      updatedAt: timestamp,
      terminalAt: isTerminalRunStatus(status) ? current.terminalAt ?? timestamp : undefined
    };
    await this.table.put(next);
    return structuredClone(next);
  }
}
