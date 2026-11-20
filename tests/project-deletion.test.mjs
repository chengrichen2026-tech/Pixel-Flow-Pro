import assert from "node:assert/strict";
import test from "node:test";
import { planProjectDeletion } from "../src/domain/project-deletion.ts";

const task = (id, status, generationMode = "api", extra = {}) => ({
  id, kind: "task", name: id, prompt: "", position: { x: 0, y: 0 }, inputEdgeOrder: [], runCount: 0,
  status, generationMode, ...extra
});

test("project deletion cancels providers only for active runs", () => {
  const project = {
    id: "project", name: "delete", createdAt: 1, updatedAt: 1,
    graph: { nodes: [
      task("idle", "idle"),
      task("done", "completed", "team", { apiJobId: "stale-job" }),
      task("api", "generating", "api"),
      task("team", "generating", "team")
    ], edges: [] }
  };
  const runs = new Map([
    ["api", { schemaVersion: 2, id: "run-api", projectId: "project", taskId: "api", attempt: 1, provider: "api", status: "generating", providerJobId: "api-job", startedAt: 1, updatedAt: 1 }],
    ["team", { schemaVersion: 2, id: "run-team", projectId: "project", taskId: "team", attempt: 1, provider: "team", status: "submitted", providerJobId: "team-job", startedAt: 1, updatedAt: 1 }],
    ["done", { schemaVersion: 2, id: "run-done", projectId: "project", taskId: "done", attempt: 1, provider: "team", status: "completed", providerJobId: "stale-job", startedAt: 1, updatedAt: 1 }]
  ]);
  const plan = planProjectDeletion(project, runs);
  assert.deepEqual(plan.taskIds, ["idle", "done", "api", "team"]);
  assert.deepEqual(plan.activeTaskIds, ["api", "team"]);
  assert.deepEqual(plan.providerCancellations, [
    { provider: "api", jobId: "api-job" },
    { provider: "team", jobId: "team-job" }
  ]);
});

test("project deletion deduplicates shared provider jobs", () => {
  const project = {
    id: "project", name: "delete", createdAt: 1, updatedAt: 1,
    graph: { nodes: [task("a", "generating", "team", { apiJobId: "shared" }), task("b", "generating", "team", { apiJobId: "shared" })], edges: [] }
  };
  const plan = planProjectDeletion(project, new Map());
  assert.equal(plan.activeTaskIds.length, 2);
  assert.deepEqual(plan.providerCancellations, [{ provider: "team", jobId: "shared" }]);
});
