import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {once} from 'node:events';

async function harness(t){
 const calls=[];const server=http.createServer(async(req,res)=>{let b='';for await(const chunk of req)b+=chunk;calls.push(JSON.parse(b));res.setHeader('content-type','application/json');res.end(JSON.stringify({ok:true,result:{taskId:'task',status:'generating',finalResults:[]}}))});server.listen(0,'127.0.0.1');await once(server,'listening');
 const child=spawn(process.execPath,['tools/pixel-flow-mcp/server.mjs'],{cwd:new URL('../',import.meta.url),env:{...process.env,PIXEL_FLOW_BRIDGE_URL:`http://127.0.0.1:${server.address().port}`},stdio:['pipe','pipe','pipe']});
 let seq=0,buffer='';const pending=new Map();child.stdout.on('data',chunk=>{buffer+=chunk;let i;while((i=buffer.indexOf('\n'))>=0){const item=JSON.parse(buffer.slice(0,i));buffer=buffer.slice(i+1);pending.get(item.id)?.(item.result);pending.delete(item.id)}});
 t.after(()=>{child.kill();server.close()});
 const rpc=(method,params={})=>new Promise(resolve=>{const id=++seq;pending.set(id,resolve);child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n')});return {rpc,calls};
}
test('MCP exposes dedicated upscale tools and submits a single structured image.upscale command',async t=>{
 const {rpc,calls}=await harness(t);const list=await rpc('tools/list');for(const name of ['pixel_flow_upscale_image','pixel_flow_get_upscale_task','pixel_flow_regenerate_upscale_tile'])assert.ok(list.tools.some(tool=>tool.name===name));
 await rpc('tools/call',{name:'pixel_flow_upscale_image',arguments:{sourceNodeId:'image',scale:4,requestId:'once',expectedRevision:12}});
 assert.equal(calls.length,1);assert.equal(calls[0].payload.commands.op,'image.upscale');assert.equal(calls[0].payload.commands.sourceNodeId,'image');assert.equal(calls[0].payload.commands.scale,4);assert.equal(calls[0].payload.commands.generationMode,'api');assert.equal(calls[0].payload.commands.apiImageModel,'gpt-image-2.5-sunburst');assert.equal(calls[0].requestId,'once');
});
test('MCP rejects ambiguous sources and relative paths before contacting the bridge',async t=>{
 const {rpc,calls}=await harness(t);for(const args of [{sourceNodeId:'a',assetId:'b'},{filePath:'relative.png'}]){const out=await rpc('tools/call',{name:'pixel_flow_upscale_image',arguments:{...args,requestId:'test',expectedRevision:1}});assert.equal(out.isError,true)}assert.equal(calls.length,0);
});
test('MCP status is read-only and tile regeneration routes to the existing pipeline',async t=>{
 const {rpc,calls}=await harness(t);await rpc('tools/call',{name:'pixel_flow_get_upscale_task',arguments:{taskId:'task'}});assert.equal(calls[0].action,'getUpscaleTask');
 await rpc('tools/call',{name:'pixel_flow_regenerate_upscale_tile',arguments:{taskId:'task',tileId:'r1_c1',requestId:'retry',expectedRevision:2}});assert.equal(calls[1].payload.commands.op,'upscale.regenerateTile');assert.equal(calls[1].payload.commands.tileId,'r1_c1');
});
