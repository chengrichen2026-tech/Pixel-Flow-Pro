import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const background = await readFile(new URL("../public/background.js", import.meta.url), "utf8");
const manifest = JSON.parse(await readFile(new URL("../public/manifest.json", import.meta.url), "utf8"));

test("API completion recovery uses a service-worker wake alarm", () => {
  assert.ok(manifest.permissions.includes("alarms"));
  assert.match(background, /scheduleApiRecoveryAlarm\(\);\s*const images = await waitForApiWorkerJob/);
  assert.match(background, /chrome\.alarms\.onAlarm\.addListener/);
  assert.match(background, /void reconcileCompletedApiTasks\(\)/);
});

test("API recovery persists terminal worker results before completing scheduler state", () => {
  assert.match(background, /job\.status === "completed"[\s\S]*type: "TASK_RESULT"/);
  assert.match(background, /job\.status === "failed"[\s\S]*type: "TASK_ERROR"/);
  assert.match(background, /await removeActiveScope\(key\)/);
});
