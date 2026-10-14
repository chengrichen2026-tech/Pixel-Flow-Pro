import assert from 'node:assert/strict';
import test from 'node:test';
import {planUpscale,validateUpscaleTile,upscalePrompt} from '../src/domain/image-upscale.ts';
import {UpscaleController} from '../src/background/upscale-controller.ts';
import {TaskRunRepository} from '../src/storage/task-run-repository.ts';
import {applyTaskMessage} from '../src/background/generation-projector.ts';

for(const scale of [2,4,8])test(`upscale ${scale}x covers every pixel including narrow images and odd edges`,()=>{
 for(const [w,h] of [[1,1],[19,700],[521,307],[1000,1000]]){
  const p=planUpscale(w,h,scale);const coverage=new Uint8Array(w*h);
  for(const t of p.tiles)for(let y=Math.max(0,t.y);y<Math.min(h,t.y+t.side);y++)for(let x=Math.max(0,t.x);x<Math.min(w,t.x+t.side);x++)coverage[y*w+x]++;
  assert.ok(coverage.every(n=>n>0));assert.ok(p.tiles.every(t=>t.side*scale===1024));
 }
});
test('upscale rejects unsupported multiplier, oversized targets, invalid geometry and insufficient generated detail',()=>{
 for(const args of [[0,100,2],[100,100,3],[20000,20000,8],[1.1,100,2]])assert.throws(()=>planUpscale(...args));
 for(const args of [[512,512,1024],[1254,1024,1024],[4096,4096,1024]])assert.throws(()=>validateUpscaleTile(...args));
 validateUpscaleTile(1254,1254,1024);
 assert.match(upscalePrompt(planUpscale(512,512,2).tiles[0],2),/不裁切.*不扩图/);
});
class Runs {records=new Map();async toArray(){return [...this.records.values()]}async get(id){return this.records.get(id)}async put(r){this.records.set(r.id,r)}}
function harness(){
 let project={id:'p',name:'QA',createdAt:1,updatedAt:1,graph:{nodes:[{id:'src',kind:'image',assetId:'original',position:{x:0,y:0},title:'source'},{id:'parent',kind:'task',name:'放大',position:{x:500,y:0},inputEdgeOrder:['input'],runCount:0,status:'idle',generationMode:'browser',upscale:{scale:2}}],edges:[{id:'input',source:'src',target:'parent',kind:'input'}]}};
 const assets=new Map([['original',new Blob(['source'])]]);let counter=0;
 const projects={async loadProject(){return structuredClone(project)},async loadAsset(id){return assets.get(id)},async saveAsset(blob){const id=`asset${++counter}`;assets.set(id,blob);return id},async mutateGenerationState(id,fn){project=await fn(structuredClone(project));return project},async mutateProject(id,fn){project=await fn(structuredClone(project));return project}};
 const runs=new TaskRunRepository(new Runs(),()=>Date.now());let merges=0;
 const controller=new UpscaleController(projects,runs,{crop:async()=>new Blob(['crop']),merge:async()=>{merges++;return new Blob(['merged'],{type:'image/png'})}});
 return {projects,runs,controller,get project(){return project},get merges(){return merges}};
}
test('upscale hidden tiles, partial failure retry and exactly one final result after successful merge',async()=>{
 globalThis.createImageBitmap=async()=>({width:521,height:307,close(){}});
 const h=harness();await h.runs.start('p','parent','browser');const ids=await h.controller.prepare('p','parent');assert.equal(ids.length,2);
 assert.ok(h.project.graph.nodes.filter(n=>ids.includes(n.id)).every(n=>n.hidden));
 await h.projects.mutateProject('p',p=>{const parent=p.graph.nodes.find(n=>n.id==='parent');parent.upscale.plan.tiles[0].resultAssetId='good';p.graph.nodes.find(n=>n.id===ids[0]).status='completed';p.graph.nodes.find(n=>n.id===ids[1]).status='failed';return p});
 await h.controller.finish('p','parent');assert.equal((await h.runs.latest('p','parent')).status,'failed');assert.equal(h.merges,0);
 await h.runs.start('p','parent','browser');assert.deepEqual(await h.controller.prepare('p','parent'),[ids[1]]);
 await h.projects.mutateProject('p',p=>{p.graph.nodes.find(n=>n.id==='parent').upscale.plan.tiles[1].resultAssetId='good2';return p});
 await h.controller.finish('p','parent');await h.controller.finish('p','parent');assert.equal(h.merges,1);assert.equal((await h.runs.latest('p','parent')).status,'completed');assert.equal(h.project.graph.nodes.filter(n=>n.kind==='result').length,1);
});
test('cancelled upscale parent never merges late child results',async()=>{
 globalThis.createImageBitmap=async()=>({width:100,height:100,close(){}});
 const h=harness();await h.runs.start('p','parent','browser');await h.controller.prepare('p','parent');const r=await h.runs.latest('p','parent');await h.runs.advance(r.id,'canceled');
 await h.projects.mutateProject('p',p=>{p.graph.nodes.find(n=>n.id==='parent').upscale.plan.tiles[0].resultAssetId='late';return p});
 await h.controller.finish('p','parent');assert.equal(h.merges,0);assert.equal(h.project.graph.nodes.filter(n=>n.kind==='result').length,0);
});
test('tile projector retains raw tile asset without visible output and rejects empty/multiple responses',async()=>{
 globalThis.createImageBitmap=async()=>({width:100,height:100,close(){}});
 const h=harness();await h.runs.start('p','parent','browser');const [id]=await h.controller.prepare('p','parent');const run=await h.runs.start('p',id,'browser');const completed=await h.runs.advance(run.id,'completed');
 const message={type:'TASK_RESULT',projectId:'p',taskId:id,images:[{base64:'YQ==',mimeType:'image/png'}]};
 const next=await applyTaskMessage(h.project,message,async()=> 'tile-result',completed);
 assert.equal(next.graph.nodes.filter(n=>n.kind==='result').length,0);assert.equal(next.graph.nodes.find(n=>n.id==='parent').upscale.plan.tiles[0].resultAssetId,'tile-result');
 await assert.rejects(()=>applyTaskMessage(h.project,{...message,images:[]},async()=>'',completed));
 await assert.rejects(()=>applyTaskMessage(h.project,{...message,images:[...message.images,...message.images]},async()=>'',completed));
});
test('completed upscale starts a new plan while failed assembly reuses completed tile assets',async()=>{
 globalThis.createImageBitmap=async()=>({width:100,height:100,close(){}});
 const h=harness();await h.runs.start('p','parent','browser');const [first]=await h.controller.prepare('p','parent');
 await h.projects.mutateProject('p',p=>{p.graph.nodes.find(n=>n.id==='parent').upscale.plan.tiles[0].resultAssetId='ready';return p});
 await h.controller.finish('p','parent');await h.runs.start('p','parent','browser');const [second]=await h.controller.prepare('p','parent');assert.notEqual(first,second);
});
test('stale tokens and cancellation prevent the tile projector accepting late images',async()=>{
 globalThis.createImageBitmap=async()=>({width:100,height:100,close(){}});const h=harness();await h.runs.start('p','parent','browser');const [id]=await h.controller.prepare('p','parent');const r=await h.runs.start('p',id,'browser');const run=await h.runs.advance(r.id,'completed');
 const p=h.project;p.graph.nodes.find(n=>n.id==='parent').upscale.token='new-round';let saves=0;
 const next=await applyTaskMessage(p,{type:'TASK_RESULT',projectId:'p',taskId:id,images:[{base64:'YQ==',mimeType:'image/png'}]},async()=>{saves++;return 'late'},run);assert.equal(saves,0);assert.equal(next.graph.nodes.filter(n=>n.kind==='result').length,0);
});
