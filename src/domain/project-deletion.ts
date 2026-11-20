import { resolveTaskRuntime } from "./run-projection.ts";
import type { LegacyTaskStatus } from "./task-run.ts";
import type { TaskRunRecord } from "../storage/task-run-repository.ts";
import type { GenerationMode, Project, TaskNode } from "../types.ts";

export type ProviderCancellation = { provider: GenerationMode; jobId: string };

export type ProjectDeletionPlan = {
  taskIds: string[];
  activeTaskIds: string[];
  providerCancellations: ProviderCancellation[];
};

export function planProjectDeletion(project: Project, latestRuns: Map<string, TaskRunRecord>): ProjectDeletionPlan {
  const tasks = project.graph.nodes.filter((node): node is TaskNode => node.kind === "task");
  const activeTaskIds: string[] = [];
  const providerCancellations: ProviderCancellation[] = [];
  const seenJobs = new Set<string>();
  for (const task of tasks) {
    const runtime = resolveTaskRuntime({
      status: task.status as LegacyTaskStatus,
      apiJobId: task.apiJobId,
      conversationUrl: task.conversationUrl,
      statusDetail: task.statusDetail
    }, latestRuns.get(task.id));
    if (!runtime.active) continue;
    activeTaskIds.push(task.id);
    if (!runtime.providerJobId || seenJobs.has(runtime.providerJobId)) continue;
    seenJobs.add(runtime.providerJobId);
    providerCancellations.push({ provider: task.generationMode ?? "browser", jobId: runtime.providerJobId });
  }
  return { taskIds: tasks.map(task => task.id), activeTaskIds, providerCancellations };
}
