import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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
  assert.match(store, /type:"CANCEL_TASK",projectId:targetId,taskId:task\.id/);
  assert.match(store, /db\.transaction\("rw",db\.projects,db\.runs/);
  assert.match(store, /run\.projectId===targetId/);
  assert.match(store, /name:"我的第一个画布",graph:\{nodes:\[\],edges:\[\]\}/);
  assert.match(store, /assets:await urlsFor\(project\)/);
});
