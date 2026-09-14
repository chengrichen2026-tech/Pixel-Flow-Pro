import assert from "node:assert/strict";
import test from "node:test";

import {
  canTransitionRun,
  isTerminalRunStatus,
  legacyTaskStatusToRunStatus,
  resolveRunTransition,
  runStatuses,
  runStatusToLegacyTaskStatus,
  terminalRunStatuses,
  transitionRunStatus
} from "../src/domain/task-run.ts";

test("task run contract exposes one stable set of lifecycle states", () => {
  assert.deepEqual(runStatuses, [
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
  ]);
  assert.deepEqual(terminalRunStatuses, ["completed", "failed", "canceled"]);
});

test("runtime projection can resolve skipped intermediate states without weakening direct transitions", () => {
  assert.deepEqual(resolveRunTransition("queued", "sending"), ["preparing", "sending"]);
  assert.deepEqual(resolveRunTransition("queued", "generating"), ["preparing", "sending", "generating"]);
  assert.deepEqual(resolveRunTransition("generating", "completed"), ["completed"]);
  assert.throws(() => resolveRunTransition("completed", "generating"), /completed -> generating/);
});

test("task run transitions cover local API, local browser and remote delivery paths", () => {
  const paths = [
    ["queued", "preparing", "sending", "submitted", "generating", "completed"],
    ["queued", "preparing", "uploading", "sending", "submitted", "generating", "completed"],
    ["queued", "preparing", "sending", "submitted", "generating", "delivering", "completed"],
    ["queued", "preparing", "needs_action", "submitted", "generating", "completed"]
  ];

  for (const path of paths) {
    let current = path[0];
    for (const next of path.slice(1)) current = transitionRunStatus(current, next);
    assert.equal(current, "completed");
  }
});

test("duplicate status events are idempotent", () => {
  for (const status of runStatuses) {
    assert.equal(canTransitionRun(status, status), true);
    assert.equal(transitionRunStatus(status, status), status);
  }
});

test("terminal runs reject late or conflicting state changes", () => {
  for (const terminal of terminalRunStatuses) {
    assert.equal(isTerminalRunStatus(terminal), true);
    for (const next of runStatuses) {
      if (next === terminal) continue;
      assert.equal(canTransitionRun(terminal, next), false);
      assert.throws(() => transitionRunStatus(terminal, next), /Invalid task run transition/);
    }
  }
});

test("invalid backwards transitions fail closed", () => {
  assert.throws(() => transitionRunStatus("generating", "queued"), /generating -> queued/);
  assert.throws(() => transitionRunStatus("delivering", "generating"), /delivering -> generating/);
  assert.throws(() => transitionRunStatus("needs_action", "preparing"), /needs_action -> preparing/);
});

test("legacy task statuses have an explicit compatibility mapping", () => {
  assert.equal(legacyTaskStatusToRunStatus("idle"), undefined);
  assert.equal(legacyTaskStatusToRunStatus("waiting_page"), "preparing");
  assert.equal(legacyTaskStatusToRunStatus("manual_action"), "needs_action");
  assert.equal(runStatusToLegacyTaskStatus("submitted"), "generating");
  assert.equal(runStatusToLegacyTaskStatus("delivering"), "generating");
  assert.equal(runStatusToLegacyTaskStatus("canceled"), "failed");
});
