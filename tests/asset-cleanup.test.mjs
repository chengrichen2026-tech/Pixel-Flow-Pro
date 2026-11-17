import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ASSET_CLEANUP_GRACE_MS, buildAssetStorageReport, collectLibraryAssetIds, collectProjectAssetIds, findUnusedAssets } from "../src/storage/asset-cleanup.ts";

const root = new URL("../",import.meta.url);
const now = 2_000_000;
const asset = (id,size=1,createdAt=1) => ({id,blob:new Blob([new Uint8Array(size)]),createdAt});
const project = (id,nodes) => ({id,name:id,graph:{nodes,edges:[]},createdAt:1,updatedAt:1});

test("cleanup roots include canvas, containers, upscale history, and libraries", () => {
  const active=project("active",[
    {id:"image",kind:"image",assetId:"a",title:"a",position:{x:0,y:0}},
    {id:"container",kind:"image_container",name:"c",items:[{id:"item",assetId:"b",title:"b"}],position:{x:0,y:0}},
    {id:"result",kind:"result",assetId:"c",taskId:"task",position:{x:0,y:0}},
    {id:"task",kind:"task",name:"u",prompt:"",position:{x:0,y:0},inputEdgeOrder:[],runCount:0,status:"completed",upscale:{scale:2,sourceAssetId:"d",plan:{width:10,height:10,scale:2,tileSize:10,overlap:0,tiles:[{id:"tile",x:0,y:0,width:10,height:10,resultAssetId:"e",previousResultAssetId:"f"}]}}}
  ]);
  const library={prompts:[{id:"p",name:"p",content:"p",exampleAssetId:"g"}],media:[{id:"m",kind:"product",name:"m",assetId:"h"}]};
  assert.deepEqual([...collectProjectAssetIds([active])].sort(),["a","b","c","d","e","f"]);
  assert.deepEqual([...collectLibraryAssetIds(library)].sort(),["g","h"]);
  const assets="abcdefghij".split("").map(id=>asset(id,2));
  assert.deepEqual(findUnusedAssets(assets,[active],library,now).map(item=>item.id),["i","j"]);
  assert.deepEqual(buildAssetStorageReport(assets,[active],library,now),{totalAssets:10,totalBytes:20,retainedAssets:8,retainedBytes:16,unusedAssets:2,unusedBytes:4});
});

test("new unreferenced assets are protected from concurrent cleanup", () => {
  const recent=asset("recent",5,now-ASSET_CLEANUP_GRACE_MS+1),old=asset("old",7,now-ASSET_CLEANUP_GRACE_MS);
  assert.deepEqual(findUnusedAssets([recent,old],[],{prompts:[],media:[]},now).map(item=>item.id),["old"]);
});

test("storage UI stays manual and does not ship a recycle bin", async () => {
  const [database,store,bridge,ui,app,protocol,mcp]=await Promise.all([
    readFile(new URL("src/db.ts",root),"utf8"),readFile(new URL("src/store.ts",root),"utf8"),readFile(new URL("src/codex-bridge.tsx",root),"utf8"),readFile(new URL("src/StorageManager.tsx",root),"utf8"),readFile(new URL("src/App.tsx",root),"utf8"),readFile(new URL("src/background/protocol.ts",root),"utf8"),readFile(new URL("tools/pixel-flow-mcp/server.mjs",root),"utf8")
  ]);
  assert.match(database,/version\(3\)\.stores\(\{ deletedProjects: null \}\)/);
  assert.doesNotMatch(store,/cleanupUnusedAssets/);
  assert.doesNotMatch(bridge,/trash\.(list|restore|delete|empty)/);
  assert.match(bridge,/op==="storage\.cleanup"/);
  assert.match(ui,/确认清理/);
  assert.doesNotMatch(ui,/回收站/);
  assert.match(ui,/storage-settings-backdrop/);
  assert.doesNotMatch(ui,/native-library-panel/);
  assert.match(app,/native-rail-spacer[\s\S]*title="生图设置"[\s\S]*title="存储空间"/);
  assert.doesNotMatch(app,/节省内存|kind="memory"/);
  assert.doesNotMatch(protocol,/HIBERNATE_TASK_TABS/);
  assert.match(mcp,/pixel_flow_cleanup_storage/);
});
