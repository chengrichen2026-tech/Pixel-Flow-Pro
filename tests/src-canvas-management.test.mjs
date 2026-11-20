import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { readBackgroundSource } from "./helpers/background-source.mjs";

const root = new URL("../", import.meta.url);

test("rebuilt canvas disconnects only input edges and preserves task input order", async () => {
  const app = await readFile(new URL("src/App.tsx", root), "utf8");
  const store = await readFile(new URL("src/store.ts", root), "utf8");
  assert.match(store, /disconnectEdge\(edgeId: string\)/);
  assert.match(store, /if\(!edge\|\|edge\.kind==="output"\)return/);
  assert.match(store, /edges:x\.graph\.edges\.filter\(item=>item\.id!==edgeId\)/);
  assert.match(store, /inputEdgeOrder:node\.inputEdgeOrder\.filter\(id=>id!==edgeId\)/);
  assert.match(app, /onEdgeClick=/);
  assert.match(app, /source\?\.kind==='output'/);
  assert.match(app, /className="edge-disconnect"/);
});

test("rebuilt project management avoids native blocking dialogs", async () => {
  const app = await readFile(new URL("src/App.tsx", root), "utf8");
  const store = await readFile(new URL("src/store.ts", root), "utf8");
  assert.doesNotMatch(store, /prompt\(/);
  assert.doesNotMatch(store, /confirm\(/);
  assert.match(app, /function ProjectDialog/);
  assert.match(app, /aria-label="画布名称"/);
  assert.match(app, /mode==='delete'/);
  assert.match(store, /renameProject\(name: string, projectId\?: string\)/);
  assert.match(store, /deleteProject\(projectId\?: string\)/);
});

test("deleting a canvas cancels tasks, removes runs, and keeps a fallback canvas", async () => {
  const store = await readFile(new URL("src/store.ts", root), "utf8");
  const deletion = store.slice(store.indexOf("async deleteProject"), store.indexOf("async addTask"));
  assert.match(deletion, /type:"DELETE_PROJECT",projectId:targetId/);
  assert.equal((deletion.match(/chrome\.runtime\.sendMessage/g) || []).length, 1);
  assert.doesNotMatch(deletion, /CANCEL_TASK|for\(const task/);
  assert.match(deletion, /db\.runs\.where\("projectId"\)\.equals\(targetId\)\.delete\(\)/);
  assert.match(store, /name:"我的第一个画布",graph:\{nodes:\[\],edges:\[\]\}/);
  assert.match(store, /assets:await urlsFor\(project\)/);
});

test("project deletion performs one scheduler cleanup and defers provider cancellation", async () => {
  const [background, repository] = await Promise.all([
    readBackgroundSource(),
    readFile(new URL("src/storage/project-repository.ts", root), "utf8")
  ]);
  const deletion = background.slice(background.indexOf("async function deleteProjectFast"), background.indexOf("async function reconcileSchedulerSnapshot"));
  assert.match(deletion, /latestByProject\(projectId\)/);
  assert.match(deletion, /planProjectDeletion\(project, latestRuns\)/);
  assert.equal((deletion.match(/updateScheduler\(/g) || []).length, 1);
  assert.match(deletion, /Promise\.allSettled\(\[\.\.\.projectKeys\]\.map\(key => tabRegistry\.close\(key\)\)\)/);
  assert.match(deletion, /projectRepository\.deleteProject\(projectId\)/);
  assert.match(deletion, /enqueueProjectProviderCancellations\(plan\.providerCancellations\)/);
  assert.match(repository, /runs\.where\("projectId"\)\.equals\(projectId\)\.delete\(\)/);
});

test("opening an imported canvas refreshes the project list from IndexedDB", async () => {
  const store = await readFile(new URL("src/store.ts", root), "utf8");
  const openProject = store.slice(store.indexOf("async openProject"), store.indexOf("async renameProject"));
  assert.match(openProject, /projects:await db\.projects\.orderBy\("updatedAt"\)\.reverse\(\)\.toArray\(\)/);
});

test("deleting a non-current canvas also cancels tasks and removes runs", async () => {
  const [legacy, bridge, store] = await Promise.all([
    readFile(new URL("production/asset-library.js", root), "utf8"),
    readFile(new URL("src/canvas-command-bridge.tsx", root), "utf8"),
    readFile(new URL("src/store.ts", root), "utf8")
  ]);
  assert.match(legacy,/type: "project\.delete", projectId/);
  assert.match(bridge,/case "project\.delete":[\s\S]*deleteProject/);
  assert.match(store,/type:"DELETE_PROJECT",projectId:targetId/);
  assert.match(store,/db\.runs\.where\("projectId"\)\.equals\(targetId\)\.delete\(\)/);
  assert.doesNotMatch(legacy,/objectStore\("projects"\)\.delete|transaction\(\["projects", "runs"\]/);
});
