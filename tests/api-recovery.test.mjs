import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { readBackgroundSource } from "./helpers/background-source.mjs";

const background = await readBackgroundSource();
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

test("API submission selects the model-specific local key and passes the model to the worker", () => {
  assert.match(background, /pixelFlowSunburstApiKey/);
  assert.match(background, /pixelFlowFlareApiKey/);
  assert.match(background, /body: JSON\.stringify\(\{[\s\S]*apiKey,[\s\S]*model,[\s\S]*\.\.\.request/);
});

test("API capability handshake exposes every model supported by the background", () => {
  assert.match(background, /message\.type === "GET_API_CAPABILITIES"/);
  assert.match(background, /apiModels: \["gpt-image-2", "gpt-image-2\.5-sunburst", "gpt-image-2\.5-flare"\]/);
});
