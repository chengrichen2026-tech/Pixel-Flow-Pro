import assert from "node:assert/strict";
import test from "node:test";

import {
  generationModeForProvider,
  generationModelLabel,
  generationProvider,
  gptWebLocation,
  isActiveTaskRun,
  taskStatusLabel
} from "../src/domain/generation-ui.ts";

test("three visible providers preserve the four persisted generation modes", () => {
  assert.equal(generationProvider("browser"), "gpt_web");
  assert.equal(generationProvider("team_web"), "gpt_web");
  assert.equal(generationProvider("team"), "team_cloud");
  assert.equal(generationProvider("api"), "api");
  assert.equal(gptWebLocation("browser"), "local");
  assert.equal(gptWebLocation("team_web"), "team");
  assert.equal(generationModeForProvider("gpt_web", "local"), "browser");
  assert.equal(generationModeForProvider("gpt_web", "team"), "team_web");
  assert.equal(generationModeForProvider("team_cloud"), "team");
  assert.equal(generationModeForProvider("api"), "api");
  assert.equal(generationModelLabel("api", "flare"), "gpt-image-2");
  assert.equal(generationModelLabel("team", "sunburst"), "Sunburst");
});

test("one status projection distinguishes every user-visible run phase", () => {
  assert.equal(taskStatusLabel({ status: "queued", runtimeStatus: "queued" }), "排队中");
  assert.equal(taskStatusLabel({ status: "generating", runtimeStatus: "preparing" }), "准备执行环境");
  assert.equal(taskStatusLabel({ status: "generating", runtimeStatus: "submitted", statusDetail: "等待网页生图机上线" }), "等待上线");
  assert.equal(taskStatusLabel({ status: "generating", runtimeStatus: "submitted", statusDetail: "执行机忙" }), "执行机忙");
  assert.equal(taskStatusLabel({ status: "generating", runtimeStatus: "generating" }), "正在生成");
  assert.equal(taskStatusLabel({ status: "generating", runtimeStatus: "delivering" }), "正在写回");
  assert.equal(taskStatusLabel({ status: "failed", runtimeStatus: "canceled" }), "已取消");
  assert.equal(isActiveTaskRun({ status: "generating", runtimeStatus: "delivering" }), true);
  assert.equal(isActiveTaskRun({ status: "failed", runtimeStatus: "canceled" }), false);
});
