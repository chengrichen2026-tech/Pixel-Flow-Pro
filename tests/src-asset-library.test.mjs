import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("rebuilt asset library reuses the existing local schema", async () => {
  const library = await readFile(new URL("src/library.ts", root), "utf8");
  assert.match(library, /LIBRARY_STORAGE_KEY = "pixelFlowMvpLibraryV1"/);
  assert.match(library, /prompts: \(parsed\?\.prompts \|\| \[\]\)/);
  assert.match(library, /media: \(parsed\?\.media \|\| \[\]\)/);
  assert.match(library, /PROMPT_TAGS/);
  assert.match(library, /application\/x-pixel-flow-library/);
});

test("native rail routes calling through the exact legacy panel", async () => {
  const app = await readFile(new URL("src/App.tsx", root), "utf8");
  const panel = await readFile(new URL("src/AssetLibrary.tsx", root), "utf8");
  assert.match(app, /lazy\(\(\)=>import\("\.\/AssetLibrary"\)\)/);
  assert.match(app, /<Suspense/);
  assert.match(app, /pixel-flow:open-legacy-library/);
  assert.match(app, /detail:\{tab:'prompts'\}/);
  assert.match(app, /detail:\{tab:'products'\}/);
  assert.match(app, /detail:\{tab:'references'\}/);
  assert.match(panel, /调用提示词/);
  assert.match(panel, /调用产品素材/);
  assert.match(panel, /调用图库/);
  assert.doesNotMatch(panel, /删除提示词|导入资产库|删除素材/);
});

test("prompt and media calls go through the rebuilt store", async () => {
  const panel = await readFile(new URL("src/AssetLibrary.tsx", root), "utf8");
  const store = await readFile(new URL("src/store.ts", root), "utf8");
  assert.match(panel, /applyPromptToTask\(selectedTaskId,item\.content,"replace"\)/);
  assert.match(panel, /applyPromptToTask\(selectedTaskId,item\.content,"append"\)/);
  assert.match(panel, /addTextContent\(item\.content/);
  assert.match(panel, /addExistingAsset\(item\.assetId,item\.name,position,selectedTaskId\)/);
  assert.match(store, /if\(!p\|\|!await db\.assets\.get\(assetId\)\)return/);
  assert.match(store, /inputEdgeOrder:\[\.\.\.item\.inputEdgeOrder,edge\.id\]/);
});

test("library cards can be dragged into the canvas", async () => {
  const app = await readFile(new URL("src/App.tsx", root), "utf8");
  const panel = await readFile(new URL("src/AssetLibrary.tsx", root), "utf8");
  assert.match(panel, /draggable onDragStart/);
  assert.match(panel, /setData\(LIBRARY_DRAG_TYPE/);
  assert.match(app, /readLibraryDrag\(event\.dataTransfer\)/);
  assert.match(app, /libraryItem\?\.kind==='prompt'/);
  assert.match(app, /libraryItem\?\.kind==='media'/);
});
