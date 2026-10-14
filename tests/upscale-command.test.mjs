import assert from 'node:assert/strict';
import test from 'node:test';
import {validateUpscaleCommand,executeUpscaleCommand} from '../src/domain/upscale-command.ts';

test('one-step upscale defaults to 2x local GPT Web and starts exactly one task',async()=>{
 const calls=[];const out=await executeUpscaleCommand({sourceNodeId:'image'}, {resolveSource:async()=>{calls.push('source');return 'image'},create:async(id,c)=>{calls.push(['create',id,c.scale,c.generationMode]);return 'task'},run:async id=>calls.push(['run',id]),read:async()=>({status:'generating',finalResults:[]})});
 assert.deepEqual(calls,['source',['create','image',2,'browser'],['run','task']]);assert.equal(out.taskId,'task');assert.equal(out.accepted,true);assert.deepEqual(out.finalResults,[]);
});
test('invalid source, multiplier, modes and run flags fail before importing or creating',async()=>{
 let touched=0;const deps={resolveSource:async()=>{touched++;return ''},create:async()=>'',run:async()=>{},read:async()=>({})};
 for(const c of [{},{sourceNodeId:'a',assetId:'b'},{sourceNodeId:'a',scale:3},{sourceNodeId:'a',generationMode:'invalid'},{sourceNodeId:'a',run:'false'}])await assert.rejects(()=>executeUpscaleCommand(c,deps));assert.equal(touched,0);
});
test('prepare-only does not run; failed submission returns its task id for recovery',async()=>{
 let run=0;const deps={resolveSource:async()=> 'image',create:async()=> 'task',run:async()=>{run++;throw new Error('offline')},read:async()=>({status:'failed',finalResults:[]})};
 await executeUpscaleCommand({sourceNodeId:'image',run:false},deps);assert.equal(run,0);const result=await executeUpscaleCommand({sourceNodeId:'image'},deps);assert.equal(result.taskId,'task');assert.equal(result.accepted,false);assert.equal(result.error,'offline');
});
