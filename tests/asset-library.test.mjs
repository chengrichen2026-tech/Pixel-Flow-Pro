import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const readSources = async () => Promise.all([
  readFile(new URL("production/asset-library.js", root), "utf8"),
  readFile(new URL("production/pixel-flow-theme.css", root), "utf8"),
  readFile(new URL("src/App.tsx", root), "utf8"),
  readFile(new URL("src/store.ts", root), "utf8")
]);

test("asset library keeps prompt, product, reference, and canvas management", async () => {
  const [source,,app] = await readSources();
  for (const tab of ["prompts","products","references"]) assert.match(source,new RegExp(`data-library-rail-tab="${tab}"`));
  assert.match(source,/pixel-flow:open-canvas-management/);
  assert.match(app,/title="提示词库"/);
  assert.match(app,/title="产品素材库"/);
  assert.match(app,/title="图库"/);
});

test("template and text creation functionality is removed", async () => {
  const [source,styles,app,store] = await readSources();
  assert.doesNotMatch(source,/template|模版|模板|template-task-create|open-template-library/);
  assert.doesNotMatch(styles,/pf-template|template-task-create|text-node/);
  assert.doesNotMatch(app,/新增文字|templateTask|title="模版库"|kind="template"|addText\(/);
  assert.doesNotMatch(store,/addTextContent|async addText\(/);
});

test("prompt library can create tasks and apply copy to a selected task", async () => {
  const [source] = await readSources();
  assert.match(source,/async function createTaskFromPrompt/);
  assert.match(source,/generationMode: "api"/);
  assert.match(source,/async function applyPrompt/);
  assert.match(source,/prompt-create-task/);
  assert.match(source,/prompt-edit/);
  assert.match(source,/prompt-delete/);
});

test("product and reference assets remain callable and draggable", async () => {
  const [source] = await readSources();
  assert.match(source,/async function addMediaNode/);
  assert.match(source,/async function applyMedia/);
  assert.match(source,/data-drag-kind="media"/);
  assert.match(source,/application\/x-pixel-flow-library/);
  assert.match(source,/if \(item\.kind === "media"\)/);
  assert.doesNotMatch(source,/item\.kind === "prompt"/);
});

test("library backup scopes exclude removed templates", async () => {
  const [source] = await readSources();
  for (const kind of ["pixel-flow-prompt-library","pixel-flow-product-library","pixel-flow-gallery-library"]) assert.match(source,new RegExp(kind));
  assert.doesNotMatch(source,/pixel-flow-template-library/);
  assert.match(source,/async function exportAssetLibrary/);
  assert.match(source,/async function importAssetLibrary/);
});

test("canvas management keeps portable export, import, rename, and deletion", async () => {
  const [source] = await readSources();
  assert.match(source,/async function exportCurrentCanvas/);
  assert.match(source,/async function importCanvas/);
  assert.match(source,/canvas-card-rename/);
  assert.match(source,/async function deleteCanvasById/);
  assert.match(source,/transaction\(\["projects", "runs"\]/);
});

test("library thumbnails are lazy and object URLs are released", async () => {
  const [source] = await readSources();
  assert.match(source,/IntersectionObserver/);
  assert.match(source,/ResizeObserver/);
  assert.match(source,/URL\.revokeObjectURL/);
  assert.match(source,/releaseObjectUrls/);
});

test("library tags and prompt example images remain editable", async () => {
  const [source] = await readSources();
  assert.match(source,/function bindTagEditor/);
  assert.match(source,/exampleAssetId/);
  assert.match(source,/data-prompt-dialog="choose-image"/);
  assert.match(source,/library-tag-filter/);
});

test("solid input edges retain the disconnect action", async () => {
  const [source] = await readSources();
  assert.match(source,/async function disconnectEdge/);
  assert.match(source,/edge\.kind === "output"/);
  assert.match(source,/button\.dataset\.action = "edge-disconnect"/);
});
