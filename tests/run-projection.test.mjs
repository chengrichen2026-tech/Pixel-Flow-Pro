import assert from "node:assert/strict";
import test from "node:test";

import { isDuplicateTerminalRunEvent, projectRunToLegacyTask, resolveTaskRuntime, runEventPatch, runEventStatus } from "../src/domain/run-projection.ts";

test("runtime messages resolve to canonical TaskRun states", () => {
  assert.equal(runEventStatus({ type: "TASK_STATUS", status: "waiting_page" }), "preparing");
  assert.equal(runEventStatus({ type: "TASK_ERROR", reason: "usage_limited" }), "needs_action");
  assert.equal(runEventStatus({ type: "TASK_ERROR", reason: "provider_error" }), "failed");
  assert.equal(runEventStatus({ type: "TASK_RESULT", images: [] }), "completed");
});

test("TaskNode projection derives runtime fields only from the persisted run", () => {
  assert.deepEqual(projectRunToLegacyTask({ status: "delivering", providerJobId: "job-a", detail: "回传中" }), {
    status: "generating",
    runtimeStatus: "delivering",
    recoverableResult: false,
    statusDetail: "回传中",
    apiJobId: "job-a",
    conversationUrl: undefined
  });
  assert.deepEqual(projectRunToLegacyTask({ status: "failed", providerJobId: "job-a", detail: "失败" }), {
    status: "failed",
    runtimeStatus: "failed",
    recoverableResult: true,
    statusDetail: "失败",
    apiJobId: undefined,
    conversationUrl: undefined
  });
});

test("run event patches clear stale fields and retain empty-result detail", () => {
  assert.equal(runEventStatus({ type: "TASK_STATUS", status: "generating", runStatus: "delivering" }), "delivering");
  assert.deepEqual(runEventPatch({ type: "TASK_STATUS", status: "queued", clearApiJobId: true }), {
    providerJobId: null,
    conversationUrl: undefined,
    detail: null
  });
  assert.equal(runEventPatch({ type: "TASK_RESULT", images: [], responseText: "" }).detail, "已完成，但没有生成内容");
});

test("duplicate terminal events are rejected before mutating project results", () => {
  assert.equal(isDuplicateTerminalRunEvent("completed", "completed"), true);
  assert.equal(isDuplicateTerminalRunEvent("failed", "failed"), true);
  assert.equal(isDuplicateTerminalRunEvent("generating", "generating"), false);
});

test("latest TaskRun overrides stale TaskNode recovery fields", () => {
  const staleTask = { status: "generating", apiJobId: "stale-job", conversationUrl: "https://chatgpt.com/c/stale" };
  const terminal = resolveTaskRuntime(staleTask, { status: "failed", providerJobId: "run-job", detail: "terminal" });
  assert.equal(terminal.active, false);
  assert.equal(terminal.authoritative, true);
  assert.equal(terminal.providerJobId, "run-job");
  const legacy = resolveTaskRuntime(staleTask);
  assert.equal(legacy.active, true);
  assert.equal(legacy.authoritative, false);
  assert.equal(legacy.providerJobId, "stale-job");
});
