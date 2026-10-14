import type { GenerationMode,TeamImageModel,ApiImageModel } from '../types';
export function validateUpscaleCommand(command:Record<string,unknown>){
  const scale=Number(command.scale??2);
  if(![2,4,8].includes(scale))throw new Error('scale must be 2, 4, or 8');
  const sources=['sourceNodeId','imageDataUrl','assetId'].filter(k=>typeof command[k]==='string'&&String(command[k]).trim());
  if(sources.length!==1)throw new Error('Provide exactly one of sourceNodeId, imageDataUrl, or assetId');
  const generationMode=String(command.generationMode??'browser') as GenerationMode;
  if(!['browser','api','team','team_web'].includes(generationMode))throw new Error('Invalid generationMode');
  const teamImageModel=String(command.teamImageModel??'sunburst') as TeamImageModel;
  if(!['flare','sunburst'].includes(teamImageModel))throw new Error('Invalid teamImageModel');
  const apiImageModel=String(command.apiImageModel??'gpt-image-2') as ApiImageModel;
  if(!['gpt-image-2','gpt-image-2.5-sunburst','gpt-image-2.5-flare'].includes(apiImageModel))throw new Error('Invalid apiImageModel');
  if(command.run!==undefined&&typeof command.run!=='boolean')throw new Error('run must be boolean');
  return {scale:scale as 2|4|8,generationMode,teamImageModel,apiImageModel,run:command.run!==false};
}
export async function executeUpscaleCommand(command:Record<string,unknown>,deps:{resolveSource:(command:Record<string,unknown>)=>Promise<string>;create:(sourceNodeId:string,config:ReturnType<typeof validateUpscaleCommand>)=>Promise<string>;run:(taskId:string)=>Promise<void>;read:(taskId:string)=>Promise<Record<string,unknown>>}){
  const config=validateUpscaleCommand(command),sourceNodeId=await deps.resolveSource(command),taskId=await deps.create(sourceNodeId,config);
  let error:string|undefined;
  if(config.run)try{await deps.run(taskId)}catch(e){error=e instanceof Error?e.message:String(e)}
  return {...await deps.read(taskId),taskId,sourceNodeId,scale:config.scale,generationMode:config.generationMode,accepted:!error,...(error?{error}:{})};
}
