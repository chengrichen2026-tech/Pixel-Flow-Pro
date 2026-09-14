import assert from "node:assert/strict";
import test from "node:test";

import { TaskRunRepository } from "../src/storage/task-run-repository.ts";

class MemoryRunTable {
  records = new Map();
  async toArray() { return [...this.records.values()].map(value => structuredClone(value)); }
  async get(id) { const value = this.records.get(id); return value ? structuredClone(value) : undefined; }
  async put(record) { this.records.set(record.id, structuredClone(record)); return record.id; }
}

test("starting a task run is idempotent until the run reaches a terminal state", async () => {
  let now = 100;
  const repository = new TaskRunRepository(new MemoryRunTable(), () => now++);
  const first = await repository.start("project", "task", "api");
  assert.equal(first.schemaVersion, 2);
  const duplicate = await repository.start("project", "task", "api");
  assert.equal(duplicate.id, first.id);
  assert.equal(duplicate.attempt, 1);

  await repository.transition(first.id, "preparing");
  await repository.transition(first.id, "sending", { providerJobId: "job-1" });
  await repository.transition(first.id, "generating");
  const completed = await repository.transition(first.id, "completed");
  assert.equal(completed.terminalAt, 104);

  const retry = await repository.start("project", "task", "api");
  assert.notEqual(retry.id, first.id);
  assert.equal(retry.attempt, 2);
});

test("runtime projection accepts reachable status jumps while preserving terminal rules", async () => {
  const repository = new TaskRunRepository(new MemoryRunTable(), () => 5);
  const run = await repository.start("project", "task", "team_web");
  const generating = await repository.advance(run.id, "generating", { providerJobId: "remote-job" });
  assert.equal(generating.status, "generating");
  assert.equal(generating.providerJobId, "remote-job");
  const completed = await repository.advance(run.id, "completed");
  assert.equal(completed.status, "completed");
  await assert.rejects(() => repository.advance(run.id, "sending"), /completed -> sending/);
});

test("legacy rows in the runs table do not block a current TaskRun attempt", async () => {
  const table = new MemoryRunTable();
  await table.put({ id: "legacy", projectId: "project", taskId: "task", startedAt: 1 });
  const repository = new TaskRunRepository(table, () => 2);
  const run = await repository.start("project", "task", "browser");
  assert.equal(run.schemaVersion, 2);
  assert.equal(run.attempt, 1);
});

test("task run persistence rejects backwards and post-terminal mutations", async () => {
  const repository = new TaskRunRepository(new MemoryRunTable(), () => 1);
  const run = await repository.start("project", "task", "browser");
  await repository.transition(run.id, "preparing");
  await repository.transition(run.id, "needs_action", { conversationUrl: "https://chatgpt.com/c/test" });
  await repository.transition(run.id, "submitted");
  await repository.transition(run.id, "failed", { detail: "provider failed" });

  await assert.rejects(() => repository.transition(run.id, "generating"), /failed -> generating/);
  const persisted = await repository.latest("project", "task");
  assert.equal(persisted.status, "failed");
  assert.equal(persisted.detail, "provider failed");
});

test("duplicate terminal events keep the original terminal timestamp", async () => {
  let now = 10;
  const repository = new TaskRunRepository(new MemoryRunTable(), () => now++);
  const run = await repository.start("project", "task", "team");
  await repository.transition(run.id, "failed");
  const duplicate = await repository.transition(run.id, "failed");
  assert.equal(duplicate.terminalAt, 11);
  assert.equal(duplicate.updatedAt, 12);
});

test("explicit null patches clear transient fields while omitted fields are preserved", async () => {
  const repository = new TaskRunRepository(new MemoryRunTable(), () => 20);
  const run = await repository.start("project", "task", "team");
  const generating = await repository.advance(run.id, "generating", { providerJobId: "job", detail: "处理中" });
  const completed = await repository.advance(generating.id, "completed", { detail: null });
  assert.equal(completed.providerJobId, "job");
  assert.equal("detail" in completed, false);
});

test("project recovery loads one latest run per task", async () => {
  const repository = new TaskRunRepository(new MemoryRunTable(), () => 30);
  const first = await repository.start("project", "task-a", "api");
  await repository.advance(first.id, "failed");
  const retry = await repository.start("project", "task-a", "api");
  await repository.start("project", "task-b", "browser");
  await repository.start("other", "task-c", "team");
  const latest = await repository.latestByProject("project");
  assert.equal(latest.size, 2);
  assert.equal(latest.get("task-a").id, retry.id);
  assert.equal(latest.get("task-a").attempt, 2);
  assert.equal(latest.has("task-c"), false);
});
