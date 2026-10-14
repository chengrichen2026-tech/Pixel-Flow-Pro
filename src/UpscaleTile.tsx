import type { KeyboardEvent } from 'react';

type Props={id:string;state:'generating'|'completed'|'failed';url?:string;disabled:boolean;onRegenerate:()=>void|Promise<void>};
export function UpscaleTile({id,state,url,disabled,onRegenerate}:Props){
  const label=state==='completed'?'已完成':state==='failed'?'生成失败':'生成中';
  const regenerate=()=>{if(!disabled)void onRegenerate()};
  return <figure data-upscale-tile={id} data-tile-state={state} role="button" tabIndex={disabled?-1:0} aria-disabled={disabled} aria-label={`分块 ${id}，${label}，双击重新生成`} title={`${id} · ${label}${disabled?'':' · 双击重新生成'}`} onDoubleClick={event=>{event.stopPropagation();regenerate()}} onKeyDown={(event:KeyboardEvent)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();regenerate()}}}><div className="upscale-tile-preview">{url?<img src={url} alt={`分块 ${id}`} loading="lazy" draggable={false}/>:null}</div></figure>;
}
