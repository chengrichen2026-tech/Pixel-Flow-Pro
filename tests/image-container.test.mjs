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

test("container children share the global five-slot scheduler and aggregate writeback on the parent", async () => {
  const background = await source("public/background.js");
  assert.match(background, /var MAX_CONCURRENCY = 5/);
  assert.match(background, /function updateBatchParent\(/);
  assert.match(background, /task\.batchParentTaskId \? findTask\(graph, task\.batchParentTaskId\)/);
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

test("batch results are laid out side by side and expose a download control", async () => {
  const [background, app, styles, icons] = await Promise.all([
    source("public/background.js"), source("src/App.tsx"), source("src/styles.css"), source("src/icons.tsx"),
  ]);
  assert.match(background, /x: owner\.position\.x \+ 560 \+ existingResults \* 360, y: owner\.position\.y/);
  assert.match(app, /className="result-download nodrag"/);
  assert.match(app, /chrome\.downloads\.download\(\{url:data\.url,filename,saveAs:false\}\)/);
  assert.match(styles, /\.result-download\{position:absolute;top:8px;right:8px/);
  assert.match(icons, /download: DownloadSimple/);
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
});
