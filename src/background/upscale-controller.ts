import { planUpscale, upscalePrompt } from '../domain/image-upscale';
import { isTerminalRunStatus } from '../domain/task-run';
import { projectRunToLegacyTask } from '../domain/run-projection';
import type { CanvasNode, TaskNode } from '../types';
import type { ProjectRepository } from '../storage/project-repository';
import type { TaskRunRepository } from '../storage/task-run-repository';
import { cropUpscaleTile, mergeUpscaleTiles } from './upscale-images';

const makeId=(prefix:string)=>`${prefix}-${crypto.randomUUID()}`;
export class UpscaleController {
  constructor(private projects:ProjectRepository,private runs:TaskRunRepository,private images={crop:cropUpscaleTile,merge:mergeUpscaleTiles},private notify:(projectId:string)=>Promise<void>=async()=>{}){}
  async prepare(projectId:string,taskId:string):Promise<string[]>{
    const project=await this.projects.loadProject(projectId),parent=project?.graph.nodes.find((n):n is TaskNode=>n.id===taskId&&n.kind==='task');
    if(!project||!parent?.upscale)throw new Error('找不到图片放大任务');
    const edges=project.graph.edges.filter(e=>e.target===taskId&&e.kind!=='output');
    const sources=edges.map(e=>project.graph.nodes.find(n=>n.id===e.source));
    if(sources.length!==1||!sources[0]||!['image','result'].includes(sources[0].kind))throw new Error('图片放大任务需要且只能连接一张图片');
    const source=sources[0] as Extract<CanvasNode,{kind:'image'|'result'}>;
    const config=parent.upscale;
    let taskIds:string[];
    if(parent.status!=='completed'&&config.plan&&config.sourceAssetId===source.assetId&&config.plan.scale===config.scale){
      taskIds=config.plan.tiles.filter(t=>!t.resultAssetId).map(t=>t.taskId!);
    }else{
      const blob=await this.projects.loadAsset(source.assetId);if(!blob)throw new Error('原图资产不存在');
      const bitmap=await createImageBitmap(blob),token=makeId('upscale');
      const children:TaskNode[]=[],images:CanvasNode[]=[],newEdges:typeof project.graph.edges=[];
      const crops:Array<{id:string;blob:Blob}>=[];
      let plan;
      try{plan=planUpscale(bitmap.width,bitmap.height,config.scale);
        for(const tile of plan.tiles){
          const assetId=makeId('asset'),imageId=makeId('upscale-image'),childId=makeId('upscale-tile'),edgeId=makeId('edge');
          crops.push({id:assetId,blob:await this.images.crop(bitmap,tile)});tile.taskId=childId;
          images.push({id:imageId,kind:'image',assetId,title:tile.id,hidden:true,position:parent.position});
          newEdges.push({id:edgeId,source:imageId,target:childId,kind:'input'});
          children.push({id:childId,kind:'task',name:`${parent.name} · ${tile.id}`,prompt:upscalePrompt(tile,config.scale),position:parent.position,inputEdgeOrder:[edgeId],runCount:0,status:'queued',hidden:true,aspectRatio:'1:1',generationMode:parent.generationMode,teamImageModel:parent.teamImageModel,apiImageModel:parent.apiImageModel,upscaleParentId:taskId,upscaleToken:token});
        }
      }finally{bitmap.close();}
      await this.projects.mutateGenerationState(projectId,async current=>{
        for(const crop of crops){const saved=await this.projects.saveAsset(crop.blob);const image=images.find(n=>n.kind==='image'&&n.assetId===crop.id);if(image?.kind==='image')image.assetId=saved;}
        return {...current,graph:{nodes:current.graph.nodes.map(n=>n.id===taskId&&n.kind==='task'?{...n,upscale:{scale:config.scale,plan,sourceAssetId:source.assetId,token}}:n).concat(images,children),edges:[...current.graph.edges,...newEdges]}};
      });
      taskIds=children.map(c=>c.id);
    }
    const run=await this.runs.latest(projectId,taskId);if(!run)throw new Error('放大运行记录不存在');
    const next=await this.runs.advance(run.id,'generating',{detail:`已处理 ${(config.plan?.tiles.filter(t=>t.resultAssetId).length??0)}/${taskIds.length+(config.plan?.tiles.filter(t=>t.resultAssetId).length??0)} 块`});
    await this.projects.mutateProject(projectId,current=>({...current,graph:{...current.graph,nodes:current.graph.nodes.map(n=>n.id===taskId?{...n,...projectRunToLegacyTask(next)}:n)}}));
    return taskIds;
  }
  async finish(projectId:string,parentId:string):Promise<void>{
    const project=await this.projects.loadProject(projectId),parent=project?.graph.nodes.find((n):n is TaskNode=>n.id===parentId&&n.kind==='task');
    const config=parent?.upscale,run=await this.runs.latest(projectId,parentId);
    if(!project||!parent||!config?.plan||!run||isTerminalRunStatus(run.status))return;
    const plan=config.plan,done=plan.tiles.filter(t=>t.resultAssetId).length;
    const children=plan.tiles.map(t=>project.graph.nodes.find((n):n is TaskNode=>n.id===t.taskId&&n.kind==='task'));
    const pending=children.some((c,i)=>!plan.tiles[i].resultAssetId&&c&&!['failed','manual_action','completed'].includes(c.status));
    const detail=done===plan.tiles.length?'正在拼合大图':`已处理 ${done}/${plan.tiles.length} 块`;
    if(pending||done!==plan.tiles.length){
      const next=await this.runs.advance(run.id,pending?'generating':'failed',{detail:pending?detail:`${detail}，部分分块失败；点击重试保留成功分块`});
      await this.projects.mutateProject(projectId,current=>({...current,graph:{...current.graph,nodes:current.graph.nodes.map(n=>n.id===parentId?{...n,...projectRunToLegacyTask(next)}:n)}}));return;
    }
    try{
      const source=await this.projects.loadAsset(config.sourceAssetId!);if(!source)throw new Error('原图资产不存在');
      const delivering=await this.runs.advance(run.id,'delivering',{detail});
      await this.projects.mutateProject(projectId,current=>({...current,graph:{...current.graph,nodes:current.graph.nodes.map(n=>n.id===parentId?{...n,...projectRunToLegacyTask(delivering)}:n)}}));
      await this.notify(projectId);
      const blob=await this.images.merge(plan,source,async tile=>{const result=await this.projects.loadAsset(tile.resultAssetId!);if(!result)throw new Error(`分块${tile.id}资产不存在`);return result;});
      await this.projects.mutateGenerationState(projectId,async current=>{
        const latest=await this.runs.latest(projectId,parentId);
        if(!latest||isTerminalRunStatus(latest.status))return current;
        const currentParent=current.graph.nodes.find((n):n is TaskNode=>n.id===parentId&&n.kind==='task');
        if(currentParent?.upscale?.token!==config.token)return current;
        const assetId=await this.projects.saveAsset(blob),resultId=makeId('result');
        const next=await this.runs.advance(latest.id,'completed',{detail:`${plan.width*plan.scale}×${plan.height*plan.scale} · ${plan.tiles.length}块已拼合`});
        return {...current,graph:{nodes:current.graph.nodes.map(n=>n.id===parentId&&n.kind==='task'?{...n,...projectRunToLegacyTask(next),runCount:n.runCount+1}:n).concat({id:resultId,kind:'result',assetId,taskId:parentId,title:`放大结果 ${plan.scale}×`,position:{x:parent.position.x+560,y:parent.position.y}}),edges:[...current.graph.edges,{id:makeId('edge'),source:parentId,target:resultId,kind:'output'}]}};
      });
    }catch(error){
      const latest=await this.runs.latest(projectId,parentId);if(!latest||isTerminalRunStatus(latest.status))return;
      const next=await this.runs.advance(latest.id,'failed',{detail:`拼合失败：${error instanceof Error?error.message:String(error)}`});
      await this.projects.mutateProject(projectId,current=>({...current,graph:{...current.graph,nodes:current.graph.nodes.map(n=>n.id===parentId?{...n,...projectRunToLegacyTask(next)}:n)}}));
    }
  }
}
