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

test("canvas actions share one per-project graph history", async () => {
  const store = await readFile(new URL("src/store.ts", root), "utf8");
  assert.match(store, /type HistorySnapshot/);
  assert.match(store, /undoHistory: HistorySnapshot\[\]/);
  assert.match(store, /graph:structuredClone\(project\.graph\)/);
  assert.match(store, /slice\(-49\)/);
  assert.match(store, /removedEdges=p\.graph\.edges\.filter/);
  assert.match(store, /inputEdgeOrder:node\.inputEdgeOrder\.filter/);
  assert.match(store, /restoreDeleted\(\): Promise<void>/);
  assert.match(store, /graph:structuredClone\(snapshot\.graph\)/);
  assert.match(store, /undoHistory:pushHistory\(state\.undoHistory,before\)/);
  assert.match(store, /for\(let index=history\.length-1;index>=0;index-=1\)if\(history\[index\]\.projectId===p\.id\)/);
  assert.match(store, /undoHistory:history\.filter\(\(_,index\)=>index!==snapshotIndex\)/);
  assert.match(store, /async addTask\(position,sourceNodeIds=\[\]\)\{const p=get\(\)\.project;if\(!p\)return;const before=historyEntry/);
  assert.match(store, /async moveNode\(nodeId,position\).*const before=historyEntry/s);
  assert.match(store, /async duplicateTask\(taskId\).*const before=historyEntry/s);
  assert.match(store, /selected:\[copy\.id\],undoHistory:pushHistory\(state\.undoHistory,before\)/);
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

test("command copy and paste duplicates selected images, containers, and generation tasks", async () => {
  const [app, main, store] = await Promise.all([
    readFile(new URL("src/App.tsx", root), "utf8"),
    readFile(new URL("src/main.tsx", root), "utf8"),
    readFile(new URL("src/store.ts", root), "utf8"),
  ]);
  assert.match(main, /<CanvasClipboardShortcuts\/><App \/>/);
  assert.match(app, /key==='c'&&s\.copySelected\(\)/);
  assert.match(app, /onPointerDownCapture=\{\(\)=>s\.setSelected\(\[n\.id\]\)\}/);
  assert.doesNotMatch(app, /key==='v'\)\{event\.preventDefault/);
  assert.match(app, /if\(s\.hasCopied\(\)\)\{event\.preventDefault\(\);void s\.pasteCopied\(\)\}/);
  assert.match(app, /isEditableTarget\(event\.target\)/);
  assert.match(store, /node\.kind==="image"\|\|node\.kind==="result"\|\|node\.kind==="image_container"\|\|node\.kind==="task"/);
  assert.match(store, /const taskIds=new Set/);
  assert.match(store, /edge\.kind!=="output"/);
  assert.match(store, /if\(node\.kind==="task"\)return/);
  assert.match(store, /status:"idle",runCount:0/);
  assert.match(store, /inputEdgeOrder:node\.inputEdgeOrder\.map\(edgeId=>edgeMap\.get\(edgeId\)\)/);
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

test("memory release exposes working, success, empty, and error feedback", async () => {
  const [app,store,styles] = await Promise.all([
    readFile(new URL("src/App.tsx",root),"utf8"),
    readFile(new URL("src/store.ts",root),"utf8"),
    readFile(new URL("src/memory-feedback.css",root),"utf8"),
  ]);
  assert.match(app,/function MemoryReleaseFeedback\(/);
  assert.match(app,/正在释放后台标签/);
  assert.match(app,/当前没有可释放的网页标签/);
  assert.match(app,/运行中的任务不会被关闭/);
  assert.match(store,/pixel-flow:memory-release-result/);
  assert.match(styles,/\.memory-release-toast/);
  assert.match(styles,/\.memory-release-spinner/);
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
