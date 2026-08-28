import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("rebuilt nodes rely on one measured size source", async () => {
  const app = await readFile(new URL("src/App.tsx", root), "utf8");
  assert.doesNotMatch(app, /initialWidth:/);
  assert.doesNotMatch(app, /initialHeight:/);
  assert.doesNotMatch(app, / fitView fitViewOptions=/);
  assert.match(app, /requestAnimationFrame\(\(\)=>requestAnimationFrame\(\(\)=>void instance\.fitView/);
  assert.match(app, /previous\?\.measured/);
});

test("deleting nodes records a recoverable graph snapshot", async () => {
  const store = await readFile(new URL("src/store.ts", root), "utf8");
  assert.match(store, /type DeletedSnapshot/);
  assert.match(store, /undoDeletes: DeletedSnapshot\[\]/);
  assert.match(store, /removedEdges=p\.graph\.edges\.filter/);
  assert.match(store, /inputEdgeOrder:node\.inputEdgeOrder\.filter/);
  assert.match(store, /restoreDeleted\(\): Promise<void>/);
  assert.match(store, /snapshot\.inputOrders\[node\.id\]/);
  assert.match(store, /undoDeletes:\[\.\.\.state\.undoDeletes\.filter\(item=>item\.projectId!==p\.id\),\.\.\.state\.undoDeletes\.filter\(item=>item\.projectId===p\.id\)\.slice\(-2\),snapshot\]/);
  assert.match(store, /for\(let index=history\.length-1;index>=0;index-=1\)if\(history\[index\]\.projectId===p\.id\)/);
  assert.match(store, /undoDeletes:history\.filter\(\(_,index\)=>index!==snapshotIndex\)/);
});

test("canvas keyboard shortcuts protect editing and restore deletion", async () => {
  const app = await readFile(new URL("src/App.tsx", root), "utf8");
  assert.match(app, /function isEditableTarget/);
  assert.match(app, /target\.isContentEditable/);
  assert.match(app, /window\.addEventListener\('keydown',keydown\)/);
  assert.match(app, /\(event\.metaKey\|\|event\.ctrlKey\)&&event\.key\.toLowerCase\(\)==='z'/);
  assert.match(app, /s\.restoreDeleted\(\)/);
  assert.match(app, /event\.key==='Backspace'\|\|event\.key==='Delete'/);
});

test("canvas accepts clipboard image files at the visible center", async () => {
  const app = await readFile(new URL("src/App.tsx", root), "utf8");
  assert.match(app, /window\.addEventListener\('paste',paste\)/);
  assert.match(app, /event\.clipboardData\?\.files/);
  assert.match(app, /event\.clipboardData\?\.items/);
  assert.match(app, /item\.type\.startsWith\('image\/'\)/);
  assert.match(app, /function clipboardImages/);
  assert.match(app, /s\.hasCopied\(\)/);
  assert.match(app, /s\.prefersCopied\(\)/);
  assert.match(app, /window\.addEventListener\('blur',blur\)/);
  assert.match(app, /screenToFlowPosition\(\{x:window\.innerWidth\/2,y:window\.innerHeight\/2\}\)/);
});

test("command copy and paste duplicates selected images and image containers", async () => {
  const [app, main, store] = await Promise.all([
    readFile(new URL("src/App.tsx", root), "utf8"),
    readFile(new URL("src/main.tsx", root), "utf8"),
    readFile(new URL("src/store.ts", root), "utf8"),
  ]);
  assert.match(main, /<CanvasClipboardShortcuts\/><App \/>/);
  assert.match(app, /key==='c'&&s\.copySelected\(\)/);
  assert.doesNotMatch(app, /key==='v'\)\{event\.preventDefault/);
  assert.match(app, /if\(s\.hasCopied\(\)\)\{event\.preventDefault\(\);void s\.pasteCopied\(\)\}/);
  assert.match(app, /isEditableTarget\(event\.target\)/);
  assert.match(store, /node\.kind==="image"\|\|node\.kind==="result"\|\|node\.kind==="image_container"/);
  assert.match(store, /items:node\.items\.map\(item=>\(\{\.\.\.item,id:id\("container-item"\)\}\)\)/);
  assert.match(store, /const offset=36\*canvasClipboard\.pasteCount/);
  assert.match(store, /hasCopied\(\): boolean/);
  assert.match(store, /hasCopied\(\)\{return Boolean\(canvasClipboard\.nodes\.length\)\}/);
  assert.match(store, /preferExternalPaste\(\)\{canvasClipboard\.preferInternal=false\}/);
  assert.match(store, /selected:nodes\.map\(node=>node\.id\)/);
});

test("copying one canvas image also writes a PNG to the system clipboard", async () => {
  const [app, store, manifest] = await Promise.all([
    readFile(new URL("src/App.tsx", root), "utf8"),
    readFile(new URL("src/store.ts", root), "utf8"),
    readFile(new URL("public/manifest.json", root), "utf8"),
  ]);
  assert.match(manifest, /"clipboardWrite"/);
  assert.match(app, /s\.copySelectedImageToSystemClipboard\(\)/);
  assert.match(store, /selected\.length!==1/);
  assert.match(store, /new ClipboardItem\(\{"image\/png":png\}\)/);
  assert.match(store, /navigator\.clipboard\.write/);
  assert.match(store, /canvas\.convertToBlob\(\{type:"image\/png"\}\)/);
});

test("copying an image container writes every contained image with a composite fallback", async () => {
  const store = await readFile(new URL("src/store.ts", root), "utf8");
  assert.match(store, /node\.kind==="image_container"\?node\.items\.map\(item=>item\.assetId\):\[node\.assetId\]/);
  assert.match(store, /pngs\.map\(png=>new ClipboardItem\(\{"image\/png":png\}\)\)/);
  assert.match(store, /const composite=await clipboardComposite\(pngs\)/);
  assert.match(store, /columns=Math\.min\(3,bitmaps\.length\)/);
});

test("new tasks use the current viewport, connect every selected image, and avoid overlaps", async () => {
  const app = await readFile(new URL("src/App.tsx", root), "utf8");
  const store = await readFile(new URL("src/store.ts", root), "utf8");
  assert.match(app, /flow\.current\?\.screenToFlowPosition\(\{x:window\.innerWidth\/2,y:window\.innerHeight\/2\}\)\?\?center/);
  assert.match(app, /node\.kind==='image'\|\|node\.kind==='result'/);
  assert.match(app, /const sources=s\.selected\.filter/);
  assert.match(app, /s\.addTask\(position,sources\)/);
  assert.match(store, /addTask\(position: Point, sourceNodeIds\?: string\[\]\)/);
  assert.match(store, /Math\.max\(\.\.\.sources\.map\(source=>source\.position\.x\+\(source\.width\?\?320\)\)\)\+80/);
  assert.match(store, /const edges=currentSources\.map/);
  assert.match(store, /inputEdgeOrder:edges\.map\(edge=>edge\.id\)/);
  assert.match(store, /offset\+=48/);
});

test("uploads, drops, and pastes add every image and connect to a selected task", async () => {
  const app = await readFile(new URL("src/App.tsx", root), "utf8");
  const store = await readFile(new URL("src/store.ts", root), "utf8");
  assert.match(app, /type="file" accept="image\/\*" multiple/);
  assert.match(app, /s\.addImages\(files,position,target\)/);
  assert.match(app, /async function droppedImages/);
  assert.match(app, /const localFiles = \[\.\.\.event\.dataTransfer\.files\]\.filter/);
  assert.match(app, /const files=clipboardImages\(event\)/);
  assert.match(store, /addImages\(files: File\[\], position: Point, targetTaskId\?: string\)/);
  assert.match(store, /const records=images\.map/);
  assert.match(store, /inputEdgeOrder:\[\.\.\.item\.inputEdgeOrder,\.\.\.edges\.map\(edge=>edge\.id\)\]/);
  assert.match(store, /selected:targetTaskId\?\[targetTaskId\]:nodes\.map/);
});
