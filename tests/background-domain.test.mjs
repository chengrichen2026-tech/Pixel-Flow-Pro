import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { appendAspectRatioPrompt } from "../src/domain/aspect-ratio.ts";
import { cancelTask, complete, createQueueSnapshot, emptyQueue, enqueue, fail, reconcileQueue, restoreQueueSnapshot } from "../src/domain/queue.ts";
import { createTaskNotificationId, notificationIdToCanvasUrl, readNotificationTarget } from "../src/background/notification-target.ts";
import { createTaskScopeKey, parseTaskScopeKey } from "../src/background/task-scope.ts";

const root = new URL("../", import.meta.url);

test("production build compiles and atomically publishes the TypeScript service worker before extension packaging", async () => {
  const packageJson = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
  const buildScript = await readFile(new URL("scripts/build-background.mjs", root), "utf8");
  const source = await readFile(new URL("src/background/service-worker.ts", root), "utf8");
  const database = await readFile(new URL("src/storage/database.ts", root), "utf8");
  const repository = await readFile(new URL("src/storage/project-repository.ts", root), "utf8");
  assert.match(packageJson.scripts.build, /npm run check && npm run build:background && npm run build:rebuild-preview/);
  assert.equal(packageJson.scripts["build:background"], "node scripts/build-background.mjs");
  assert.match(buildScript, /src", "background", "service-worker\.ts"/);
  assert.match(buildScript, /\.runtime", "background-build"/);
  assert.match(buildScript, /public", "background\.js"/);
  assert.match(buildScript, /writeFile\(temporary, output\)/);
  assert.match(buildScript, /rename\(temporary, target\)/);
  assert.match(buildScript, /PIXEL_FLOW_BACKGROUND_SHADOW/);
  assert.match(source, /import \{ NodeCanvasDatabase \} from "\.\.\/storage\/database"/);
  assert.match(database, /import Dexie, \{ type Table \} from "dexie"/);
  assert.match(repository, /this\.database\.projects, this\.database\.assets, this\.database\.runs/);
  assert.doesNotMatch(source, /class extends Dexie|var ProjectRepository = class|var KeyedSerialQueue = class/);
  assert.match(source, /import \{[\s\S]*emptyQueue,[\s\S]*restoreQueueSnapshot[\s\S]*\} from "\.\.\/domain\/queue"/);
  assert.match(buildScript, /Generated background contains an unresolved Dexie runtime reference/);
});

test("background queue operations are immutable and idempotent", () => {
  const initial = emptyQueue();
  const queued = enqueue(initial, ["a", "a", "b"]);
  assert.deepEqual(initial, { waiting: [], running: [], completed: [], failed: {} });
  assert.deepEqual(queued.waiting, ["a", "b"]);

  const running = { ...queued, waiting: [], running: ["a", "b"] };
  assert.deepEqual(complete(running, "a"), { ...running, running: ["b"], completed: ["a"] });
  assert.deepEqual(fail(running, "b", "provider_error"), { ...running, running: ["a"], failed: { b: "provider_error" } });
  assert.deepEqual(cancelTask(running, "missing"), running);
});

test("queue snapshots reject malformed session state", () => {
  const queue = { waiting: ["a"], running: [], completed: [], failed: {} };
  const snapshot = createQueueSnapshot(queue, new Map([["scope", "project"]]));
  queue.waiting.push("mutated-after-snapshot");
  assert.deepEqual(snapshot.queue.waiting, ["a"]);
  assert.deepEqual([...restoreQueueSnapshot(snapshot).pendingScopes], [["scope", "project"]]);
  assert.deepEqual(restoreQueueSnapshot({ queue: { waiting: [] } }), { queue: emptyQueue(), pendingScopes: new Map() });
});

test("scheduler reconciliation removes stale slots while preserving live work", () => {
  const queue = {
    waiting: ["live-waiting", "deleted-waiting", "live-waiting"],
    running: ["terminal-running", "live-running", "live-running"],
    completed: ["old-completed"],
    failed: { "old-failed": "error" }
  };
  assert.deepEqual(reconcileQueue(queue, new Set(["live-waiting", "live-running"])), {
    waiting: ["live-waiting"],
    running: ["live-running"],
    completed: [],
    failed: {}
  });
});

test("aspect ratio instructions replace an older instruction instead of accumulating", () => {
  const first = appendAspectRatioPrompt("生成一张产品图", "1:1");
  const second = appendAspectRatioPrompt(first, "16:9");
  assert.match(second, /生成一张产品图/);
  assert.match(second, /横向 16:9/);
  assert.doesNotMatch(second, /正方形 1:1/);
  assert.equal((second.match(/画面比例要求：/g) ?? []).length, 1);
});

test("task scope keys round-trip ids containing separators", () => {
  const key = createTaskScopeKey("project:with:colon", "task/with/slash");
  assert.deepEqual(parseTaskScopeKey(key), { projectId: "project:with:colon", taskId: "task/with/slash" });
  assert.equal(parseTaskScopeKey("not-json"), undefined);
});

test("notification targets round-trip encoded ids and preserve unrelated notifications", () => {
  const id = createTaskNotificationId("项目:1", "task/a");
  assert.deepEqual(readNotificationTarget(id), { projectId: "项目:1", taskId: "task/a" });
  assert.equal(notificationIdToCanvasUrl("other", "chrome-extension://pixel/index.html"), "chrome-extension://pixel/index.html");
  assert.equal(
    notificationIdToCanvasUrl(id, "chrome-extension://pixel/index.html"),
    "chrome-extension://pixel/index.html?projectId=%E9%A1%B9%E7%9B%AE%3A1&taskId=task%2Fa"
  );
});
