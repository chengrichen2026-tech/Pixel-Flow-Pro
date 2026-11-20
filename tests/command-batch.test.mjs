import assert from "node:assert/strict";
import test from "node:test";
import { validateCommandBatch } from "../src/domain/command-batch.ts";

test("bridge accepts one write command", () => {
  assert.deepEqual(validateCommandBatch({ op: "task.create", prompt: "test" }), [{ op: "task.create", prompt: "test" }]);
});

test("bridge validates the full batch before any write can run", () => {
  assert.throws(
    () => validateCommandBatch([{ op: "run.list" }, { op: "task.create" }]),
    /Batch writes are not supported/
  );
  assert.throws(() => validateCommandBatch([]), /At least one command/);
  assert.throws(() => validateCommandBatch([{ op: "run.list" }, null]), /Each command must be an object/);
});

test("bridge keeps read-only batches available", () => {
  assert.equal(validateCommandBatch([{ op: "run.list" }, { op: "storage.inspect" }]).length, 2);
});
