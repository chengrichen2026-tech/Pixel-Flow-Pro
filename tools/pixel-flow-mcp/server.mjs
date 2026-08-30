#!/usr/bin/env node
import { mkdir,writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
const BASE=process.env.PIXEL_FLOW_BRIDGE_URL||"http://127.0.0.1:43128";
const request=async(pathname,options={})=>{let response;try{response=await fetch(`${BASE}${pathname}`,{...options,headers:{"content-type":"application/json",...(options.headers||{})}})}catch{throw new Error("Pixel Flow bridge is not running. Start npm run bridge:start and open Pixel Flow.")}const value=await response.json().catch(()=>({}));if(!response.ok)throw new Error(value.error||`Bridge returned ${response.status}`);return value};
const rpc=(action,payload={},options={})=>request("/rpc",{method:"POST",body:JSON.stringify({action,payload,requestId:options.requestId||crypto.randomUUID(),clientId:options.clientId,projectId:options.projectId,expectedRevision:options.expectedRevision,timeoutMs:options.timeoutMs})});
const target={clientId:{type:"string"},projectId:{type:"string"}};
const tools=[
 {name:"pixel_flow_status",description:"Check the local Pixel Flow bridge and connected canvas tabs.",inputSchema:{type:"object",properties:{},additionalProperties:false}},
 {name:"pixel_flow_get_state",description:"Read canvases, nodes, edges, tasks and current revision.",inputSchema:{type:"object",properties:target,additionalProperties:false}},
 {name:"pixel_flow_execute",description:"Execute one or more structured Pixel Flow commands.",inputSchema:{type:"object",properties:{commands:{oneOf:[{type:"object"},{type:"array",items:{type:"object"},minItems:1}]},requestId:{type:"string"},expectedRevision:{type:"integer",minimum:0},...target},required:["commands","requestId","expectedRevision"],additionalProperties:false}},
 {name:"pixel_flow_create_canvas",description:"Create and open a new Pixel Flow canvas.",inputSchema:{type:"object",properties:{name:{type:"string"},requestId:{type:"string"},expectedRevision:{type:"integer",minimum:0},...target},required:["name","requestId","expectedRevision"],additionalProperties:false}},
 {name:"pixel_flow_create_task",description:"Create a generation task with prompt, mode, ratio, position and optional source node ids.",inputSchema:{type:"object",properties:{prompt:{type:"string"},generationMode:{type:"string",enum:["api","browser"]},aspectRatio:{type:"string"},x:{type:"number"},y:{type:"number"},sourceNodeIds:{type:"array",items:{type:"string"}},requestId:{type:"string"},expectedRevision:{type:"integer",minimum:0},...target},required:["requestId","expectedRevision"],additionalProperties:false}},
 {name:"pixel_flow_run_task",description:"Run one existing generation task by taskId.",inputSchema:{type:"object",properties:{taskId:{type:"string"},requestId:{type:"string"},expectedRevision:{type:"integer",minimum:0},...target},required:["taskId","requestId","expectedRevision"],additionalProperties:false}},
 {name:"pixel_flow_download_image",description:"Download one canvas image/result to an absolute local path.",inputSchema:{type:"object",properties:{nodeId:{type:"string"},outputPath:{type:"string"},...target},required:["nodeId","outputPath"],additionalProperties:false}},
 {name:"pixel_flow_get_task",description:"Read a previous idempotent request result.",inputSchema:{type:"object",properties:{requestId:{type:"string"}},required:["requestId"],additionalProperties:false}}
];
const text=(value,error=false)=>({content:[{type:"text",text:typeof value==="string"?value:JSON.stringify(value,null,2)}],...(error?{isError:true}:{})});
const call=async(name,args)=>{if(name==="pixel_flow_status")return text(await request("/health"));if(name==="pixel_flow_get_task")return text(await request(`/tasks/${encodeURIComponent(args.requestId)}`));const options={clientId:args.clientId,projectId:args.projectId,requestId:args.requestId,expectedRevision:args.expectedRevision};if(name==="pixel_flow_get_state")return text(await rpc("getState",{},options));if(name==="pixel_flow_execute")return text(await rpc("execute",{commands:args.commands},options));if(name==="pixel_flow_create_canvas")return text(await rpc("execute",{commands:{op:"canvas.create",name:args.name}},options));if(name==="pixel_flow_create_task")return text(await rpc("execute",{commands:{op:"task.create",prompt:args.prompt||"",generationMode:args.generationMode||"api",aspectRatio:args.aspectRatio||"auto",position:{x:args.x??620,y:args.y??220},sourceNodeIds:args.sourceNodeIds||[]}},options));if(name==="pixel_flow_run_task")return text(await rpc("execute",{commands:{op:"task.run",taskId:args.taskId}},options));if(name==="pixel_flow_download_image"){if(!path.isAbsolute(args.outputPath))throw new Error("outputPath must be absolute");const response=await rpc("getImage",{nodeId:args.nodeId},{...options,timeoutMs:60_000});const match=String(response.result?.dataUrl||"").match(/^data:([^;]+);base64,(.+)$/);if(!match)throw new Error("Pixel Flow returned invalid image data");await mkdir(path.dirname(args.outputPath),{recursive:true});await writeFile(args.outputPath,Buffer.from(match[2],"base64"));return text({ok:true,outputPath:args.outputPath,mimeType:match[1],bytes:Buffer.byteLength(match[2],"base64")})}throw new Error(`Unknown tool: ${name}`)};
const send=value=>process.stdout.write(`${JSON.stringify(value)}\n`);
let buffer="";
process.stdin.setEncoding("utf8");
process.stdin.on("data",async chunk=>{
  buffer+=chunk;
  let index;
  while((index=buffer.indexOf("\n"))>=0){
    const line=buffer.slice(0,index).trim();buffer=buffer.slice(index+1);
    if(!line)continue;
    let req;try{req=JSON.parse(line)}catch{continue}
    if(req.method==="notifications/initialized")continue;
    if(req.method==="initialize")send({jsonrpc:"2.0",id:req.id,result:{protocolVersion:req.params?.protocolVersion||"2025-03-26",capabilities:{tools:{}},serverInfo:{name:"pixel-flow",version:"1.0.0"}}});
    else if(req.method==="tools/list")send({jsonrpc:"2.0",id:req.id,result:{tools}});
    else if(req.method==="ping")send({jsonrpc:"2.0",id:req.id,result:{}});
    else if(req.method==="tools/call"){
      try{send({jsonrpc:"2.0",id:req.id,result:await call(req.params?.name,req.params?.arguments||{})})}
      catch(error){send({jsonrpc:"2.0",id:req.id,result:text(error instanceof Error?error.message:String(error),true)})}
    }else if(req.id!==undefined)send({jsonrpc:"2.0",id:req.id,error:{code:-32601,message:"Method not found"}});
  }
});
