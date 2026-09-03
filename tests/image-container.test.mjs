import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const root = new URL("..", import.meta.url);
const source = async (path) => readFile(new URL(path, root), "utf8");

test("image containers are native canvas nodes and fan out into hidden independent tasks", async () => {
  const [types, store, app] = await Promise.all([source("src/types.ts"), source("src/store.ts"), source("src/App.tsx")]);
  assert.match(types, /kind: "image_container"/);
  assert.match(store, /addImageContainer\(position,sourceNodeIds=\[\]\)/);
  assert.match(store, /batchParentTaskId:task\.id/);
  assert.match(store, /hidden:true/);
  assert.match(app, /新建图片容器/);
  assert.match(app, /image-container-card/);
});

test("container children keep five slots and stagger up to five GPT-web launches", async () => {
  const background = await source("public/background.js");
  assert.match(background, /var MAX_CONCURRENCY = 5/);
  assert.match(background, /var MAX_BROWSER_CONCURRENCY = 5/);
  assert.match(background, /var BROWSER_LAUNCH_GAP_MS = 6e3/);
  assert.match(background, /BROWSER_LAUNCH_GAP_MS - \(Date\.now\(\) - lastBrowserLaunchAt\)/);
  assert.match(background, /async function advanceQueueByMode\(\)/);
  assert.match(background, /mode === "browser" && browserRunning >= MAX_BROWSER_CONCURRENCY/);
  assert.match(background, /function updateBatchParent\(/);
  assert.match(background, /task\.batchParentTaskId \? findTask\(graph, task\.batchParentTaskId\)/);
});

test("failed batch items expose their details and can be retried without rerunning completed items", async () => {
  const [store, app] = await Promise.all([source("src/store.ts"), source("src/App.tsx")]);
  assert.match(store, /async retryFailedBatch\(taskId\)/);
  assert.match(store, /item\.status==="failed"\|\|item\.status==="manual_action"/);
  assert.match(app, /task-batch-errors/);
  assert.match(app, /只重试失败项/);
});

test("duplicated tasks retain ordered image inputs and are placed without overlap", async () => {
  const store = await source("src/store.ts");
  assert.match(store, /const incoming=p\.graph\.edges\.filter\(edge=>edge\.target===source\.id&&edge\.kind!=="output"\)/);
  assert.match(store, /copiedEdges=ordered\.map\(edge=>\(\{\.\.\.edge,id:id\("edge"\),target:copyId\}\)\)/);
  assert.match(store, /inputEdgeOrder:copiedEdges\.map\(edge=>edge\.id\)/);
  assert.match(store, /source\.position\.y\+360/);
  assert.match(store, /while\(p\.graph\.nodes\.some\(node=>!\(\("hidden" in node\)&&node\.hidden\)/);
  assert.doesNotMatch(store, /position:\{x:source\.position\.x\+36,y:source\.position\.y\+36\}/);
});

test("running a container batch keeps shared images outside the container visible", async () => {
  const app = await source("src/App.tsx");
  assert.match(app, /graph\.nodes\.filter\(n=>!\(\(n\.kind==='task'\|\|n\.kind==='image'\)&&n\.hidden\)\)/);
  assert.doesNotMatch(app, /n\.kind==='image'&&s\.project!\.graph\.edges\.some/);
});

test("every container child sends both its container image and outside shared inputs", async () => {
  const store = await source("src/store.ts");
  assert.match(store, /sharedChildEdges=sharedEdges\.map\(sharedEdge=>\(\{\.\.\.sharedEdge,id:id\("edge"\),target:childId\}\)\)/);
  assert.match(store, /inputEdgeOrder:\[\.\.\.sharedChildEdges\.map\(sharedEdge=>sharedEdge\.id\),edge\.id\]/);
  assert.match(store, /children\.flatMap\(child=>\[\.\.\.child\.sharedChildEdges,child\.edge\]\)/);
  assert.doesNotMatch(store, /inputEdgeOrder:\[\.\.\.sharedEdges\.map\(edge=>edge\.id\),edge\.id\]/);
});

test("standalone canvas images keep download controls while container items omit them", async () => {
  const [background, app, styles, icons] = await Promise.all([
    source("public/background.js"), source("src/App.tsx"), source("src/styles.css"), source("src/icons.tsx"),
  ]);
  assert.match(background, /x: owner\.position\.x \+ 560 \+ existingResults \* 360, y: owner\.position\.y/);
  assert.match(app, /className="result-download nodrag"/);
  assert.doesNotMatch(app, /container-image-download/);
  assert.doesNotMatch(app, /node\.kind==='result'&&data\.url&&<button className="result-download/);
  assert.match(styles, /\.result-download\{position:absolute;top:8px;right:8px;[\s\S]*?opacity:\.8/);
  assert.match(icons, /download: DownloadSimple/);
});

test("container images can be selected and dragged out without moving the container", async () => {
  const [app, styles] = await Promise.all([source("src/App.tsx"), source("src/styles.css")]);
  assert.match(app, /className={`container-item nodrag nopan /);
  assert.match(app, /setSelectedItemId\(item\.id\)/);
  assert.match(app, /application\/x-pixel-flow-container-item/);
  assert.match(app, /点击选中，拖到画布空白处移出容器/);
  assert.match(styles, /\.container-item\.is-selected/);
  assert.match(styles, /\.container-item-remove\{position:absolute;top:5px;right:5px;bottom:auto/);
});

test("generated image titles are numbered without a duplicated generic label", async () => {
  const background = await source("public/background.js");
  assert.match(background, /title: `\\u751F\\u6210\\u7ED3\\u679C\$\{existingResults \+ 1\}`/);
});

test("image container toolbar uses the approved generated icon asset", async () => {
  const icons = await source("src/icons.tsx");
  const icon = await readFile(new URL("public/icons/image-container.png", root));
  assert.match(icons, /imageContainer: "image-container\.png"/);
  assert.equal(icon.subarray(1, 4).toString(), "PNG");
  assert.ok(icon.length > 1000);
});

test("selected image containers receive clicked product and gallery assets", async () => {
  const [store, nativeLibrary, legacyLibrary, app] = await Promise.all([
    source("src/store.ts"), source("src/AssetLibrary.tsx"), source("production/asset-library.js"), source("src/App.tsx"),
  ]);
  assert.match(store, /addExistingAssetToContainer\(assetId,title,containerId\)/);
  assert.match(store, /items:\[\.\.\.node\.items,\{id:id\("container-item"\),assetId,title\}\]/);
  assert.match(nativeLibrary, /selectedContainerId \? s\.addExistingAssetToContainer/);
  assert.match(nativeLibrary, /已选中图片容器，点击素材直接放入/);
  assert.match(legacyLibrary, /function selectedImageContainerId\(\)/);
  assert.match(legacyLibrary, /已将素材放入选中的图片容器/);
  assert.match(app, /selectedNodeIds\?:string\[\]/);
  assert.match(app, /pixel-flow:canvas-selection-changed/);
  assert.match(app, /selectedNodeIds:\[\.\.\.s\.selected\]/);
});

test("repeated product clicks keep the connected task selected after each project refresh", async () => {
  const [legacyLibrary, store] = await Promise.all([
    source("production/asset-library.js"),
    source("src/store.ts"),
  ]);
  assert.match(
    legacyLibrary,
    /selectedNodeIds: targetTaskId \? \[targetTaskId\] : \[nodeId\]/,
    "a connected media insert must preserve the task selection so the next product also connects",
  );
  assert.match(
    legacyLibrary,
    /task\.inputEdgeOrder = \[\.\.\.\(task\.inputEdgeOrder \|\| \[\]\), edgeId\]/,
    "each repeated media insert must append its input edge to the task order",
  );
  assert.match(store, /let projectReadQueue: Promise<void> = Promise\.resolve\(\)/);
  assert.match(store, /async refresh\(projectId\) \{ return serializeProjectRead/);
  assert.match(store, /async openProject\(projectId\)\{return serializeProjectRead/);
});

test("canvas retries edge rendering after newly inserted nodes are measured", async () => {
  const [app, main] = await Promise.all([
    source("src/App.tsx"),
    source("src/main.tsx"),
  ]);
  assert.match(main, /<ReactFlowProvider><App \/><\/ReactFlowProvider>/);
  assert.match(app, /const nodesInitialized=useNodesInitialized\(\)/);
  assert.match(app, /\[s\.project,edgeMenu\?\.id,nodesInitialized\]/);
});
