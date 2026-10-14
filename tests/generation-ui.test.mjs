import assert from "node:assert/strict";
import test from "node:test";

import {
  generationModeForProvider,
  generationModelLabel,
  generationProvider,
  gptWebLocation,
  isActiveTaskRun,
  taskStatusLabel
} from "../src/domain/generation-ui.ts";

test("three visible providers preserve the four persisted generation modes", () => {
  assert.equal(generationProvider("browser"), "gpt_web");
  assert.equal(generationProvider("team_web"), "gpt_web");
  assert.equal(generationProvider("team"), "team_cloud");
  assert.equal(generationProvider("api"), "api");
  assert.equal(gptWebLocation("browser"), "local");
  assert.equal(gptWebLocation("team_web"), "team");
  assert.equal(generationModeForProvider("gpt_web", "local"), "browser");
  assert.equal(generationModeForProvider("gpt_web", "team"), "team_web");
  assert.equal(generationModeForProvider("team_cloud"), "team");
  assert.equal(generationModeForProvider("api"), "api");
  assert.equal(generationModelLabel("api", "flare"), "gpt-image-2");
  assert.equal(generationModelLabel("api", "flare", "gpt-image-2.5-sunburst"), "gpt-image-2.5-sunburst");
  assert.equal(generationModelLabel("team", "sunburst"), "Sunburst");
});

test("one status projection distinguishes every user-visible run phase", () => {
  assert.equal(taskStatusLabel({ status: "queued", runtimeStatus: "queued" }), "排队中");
  assert.equal(taskStatusLabel({ status: "generating", runtimeStatus: "preparing" }), "准备执行环境");
  assert.equal(taskStatusLabel({ status: "generating", runtimeStatus: "submitted", statusDetail: "等待网页生图机上线" }), "等待上线");
  assert.equal(taskStatusLabel({ status: "generating", runtimeStatus: "submitted", statusDetail: "执行机忙" }), "执行机忙");
  assert.equal(taskStatusLabel({ status: "generating", runtimeStatus: "generating" }), "正在生成");
  assert.equal(taskStatusLabel({ status: "generating", runtimeStatus: "delivering" }), "正在写回");
  assert.equal(taskStatusLabel({ status: "failed", runtimeStatus: "canceled" }), "已取消");
  assert.equal(isActiveTaskRun({ status: "generating", runtimeStatus: "delivering" }), true);
  assert.equal(isActiveTaskRun({ status: "failed", runtimeStatus: "canceled" }), false);
});

test('completed detail is green while a current configuration error remains an error',async()=>{
 const {taskDetailTone}=await import('../src/domain/generation-ui.ts');
 assert.equal(taskDetailTone({status:'completed',runtimeStatus:'completed'}),'is-success');
 assert.equal(taskDetailTone({status:'completed',runtimeStatus:'completed'},'missing key'),'is-error');
});
test('only failed or attention-required details are errors; cancellation is neutral',async()=>{
 const {taskDetailTone}=await import('../src/domain/generation-ui.ts');
 assert.equal(taskDetailTone({status:'failed',runtimeStatus:'failed'}),'is-error');
 assert.equal(taskDetailTone({status:'manual_action',runtimeStatus:'needs_action'}),'is-error');
 assert.equal(taskDetailTone({status:'failed',runtimeStatus:'canceled'}),'is-neutral');
 assert.equal(taskDetailTone({status:'idle'}),'is-neutral');
 assert.equal(taskDetailTone({status:'generating',runtimeStatus:'delivering'}),'is-progress');
});
test('upscale borders distinguish active, completed, failed and failed regeneration with an old preview',async()=>{
 const {upscaleTileState}=await import('../src/domain/generation-ui.ts');
 assert.equal(upscaleTileState({}, {status:'generating',runtimeStatus:'generating'}),'generating');
 assert.equal(upscaleTileState({resultAssetId:'ready'}, {status:'completed',runtimeStatus:'completed'}),'completed');
 assert.equal(upscaleTileState({}, {status:'failed',runtimeStatus:'failed'}),'failed');
 assert.equal(upscaleTileState({previousResultAssetId:'old'}, {status:'failed',runtimeStatus:'failed'}),'failed');
 assert.equal(upscaleTileState({previousResultAssetId:'old'}, {status:'queued',runtimeStatus:'queued'}),'generating');
 assert.equal(upscaleTileState({}, {status:'failed',runtimeStatus:'canceled'}),'failed');
});
test('tile regenerates on double click, never on single click, and blocks active attempts',async()=>{
 const {UpscaleTile}=await import('../src/UpscaleTile.tsx');let calls=0,stopped=0;
 const tile=UpscaleTile({id:'r1_c1',state:'completed',url:'blob:test',disabled:false,onRegenerate:()=>calls++});
 assert.equal(tile.props.onClick,undefined);assert.equal(tile.props.children.type,'div');
 tile.props.onDoubleClick({stopPropagation(){stopped++}});assert.equal(calls,1);assert.equal(stopped,1);
 const busy=UpscaleTile({id:'r1_c1',state:'generating',disabled:true,onRegenerate:()=>calls++});busy.props.onDoubleClick({stopPropagation(){}});assert.equal(calls,1);assert.equal(busy.props['aria-disabled'],true);
});
test('keyboard tile regeneration is available without visible extra controls',async()=>{
 const {UpscaleTile}=await import('../src/UpscaleTile.tsx');let calls=0;const tile=UpscaleTile({id:'r1_c2',state:'failed',disabled:false,onRegenerate:()=>calls++});
 for(const key of ['Enter',' '])tile.props.onKeyDown({key,preventDefault(){},stopPropagation(){}});assert.equal(calls,2);
 tile.props.onKeyDown({key:'ArrowRight'});assert.equal(calls,2);
});
