import { useEffect, useMemo, useState } from "react";
import { db } from "./db";
import { LIBRARY_DRAG_TYPE, readLibrary, type MediaItem, type PromptItem } from "./library";
import { useStore } from "./store";
import type { TaskNode } from "./types";
import "./asset-library.css";

export type LibraryTab = "prompts" | "products" | "references";

function useAssetUrls(assetIds: string[]) {
  const [urls, setUrls] = useState<Record<string,string>>({});
  const key = [...new Set(assetIds.filter(Boolean))].sort().join("|");
  useEffect(() => {
    let active = true;
    const created: string[] = [];
    void Promise.all(key.split("|").filter(Boolean).map(async assetId => {
      const asset = await db.assets.get(assetId);
      if (!asset?.blob) return;
      const url = URL.createObjectURL(asset.blob);
      created.push(url);
      return [assetId,url] as const;
    })).then(entries => { if (active) setUrls(Object.fromEntries(entries.filter(Boolean) as Array<readonly [string,string]>)); });
    return () => { active = false; created.forEach(url => URL.revokeObjectURL(url)); };
  }, [key]);
  return urls;
}

function PromptCard({item,selectedTaskId}:{item:PromptItem,selectedTaskId?:string}) {
  const s = useStore();
  const drag = (event: React.DragEvent) => event.dataTransfer.setData(LIBRARY_DRAG_TYPE, JSON.stringify({kind:"prompt",content:item.content}));
  return <article className="native-library-card" draggable onDragStart={drag}>
    <strong>{item.name}</strong><div className="native-library-tags">{(item.tags||[]).map(tag=><span key={tag}>{tag}</span>)}</div>
    <footer><button disabled={!selectedTaskId} onClick={()=>selectedTaskId&&void s.applyPromptToTask(selectedTaskId,item.content,"replace")}>替换</button><button disabled={!selectedTaskId} onClick={()=>selectedTaskId&&void s.applyPromptToTask(selectedTaskId,item.content,"append")}>追加</button><button onClick={()=>void s.addTextContent(item.content,{x:300,y:220})}>放入画布</button></footer>
  </article>;
}

function MediaCard({item,url,selectedTaskId,selectedContainerId}:{item:MediaItem,url?:string,selectedTaskId?:string,selectedContainerId?:string}) {
  const s = useStore();
  const selectedTask = s.project?.graph.nodes.find(node=>node.id===selectedTaskId&&node.kind==="task") as TaskNode|undefined;
  const position = selectedTask ? {x:selectedTask.position.x-380,y:selectedTask.position.y+selectedTask.inputEdgeOrder.length*96} : {x:300,y:220};
  const drag = (event: React.DragEvent) => event.dataTransfer.setData(LIBRARY_DRAG_TYPE, JSON.stringify({kind:"media",assetId:item.assetId,name:item.name}));
  const apply = () => selectedContainerId ? s.addExistingAssetToContainer(item.assetId,item.name,selectedContainerId) : s.addExistingAsset(item.assetId,item.name,position,selectedTaskId);
  return <article className="native-library-card native-media-card" draggable onDragStart={drag}>
    <div>{url?<img src={url} loading="lazy" decoding="async"/>:<span>图片载入中</span>}</div><strong title={item.name}>{item.name}</strong>
    <footer>{selectedContainerId?<button onClick={()=>void apply()}>放入容器</button>:<><button onClick={()=>void s.addExistingAsset(item.assetId,item.name,position)}>独立放入</button><button disabled={!selectedTaskId} onClick={()=>selectedTaskId&&void s.addExistingAsset(item.assetId,item.name,position,selectedTaskId)}>连接任务</button></>}</footer>
  </article>;
}

export default function AssetLibrary({tab,onClose}:{tab:LibraryTab,onClose:()=>void}) {
  const s = useStore();
  const [query,setQuery] = useState("");
  const [tag,setTag] = useState("");
  const [library,setLibrary] = useState(()=>readLibrary());
  useEffect(()=>setTag(""),[tab]);
  useEffect(()=>{const refresh=()=>setLibrary(readLibrary());window.addEventListener('pixel-flow:library-updated',refresh);window.addEventListener('storage',refresh);return()=>{window.removeEventListener('pixel-flow:library-updated',refresh);window.removeEventListener('storage',refresh)}},[]);
  const selectedTaskId = s.selected.length===1&&s.project?.graph.nodes.some(node=>node.id===s.selected[0]&&node.kind==="task")?s.selected[0]:undefined;
  const selectedContainerId = s.selected.length===1&&s.project?.graph.nodes.some(node=>node.id===s.selected[0]&&node.kind==="image_container")?s.selected[0]:undefined;
  const mediaKind = tab==="products"?"product":"reference";
  const media = library.media.filter(item=>item.kind===mediaKind&&`${item.name} ${(item.tags||[]).join(" ")}`.toLowerCase().includes(query.toLowerCase())&&(!tag||(item.tags||[]).includes(tag)));
  const prompts = library.prompts.filter(item=>`${item.name} ${item.content} ${(item.tags||[]).join(" ")}`.toLowerCase().includes(query.toLowerCase())&&(!tag||(item.tags||[]).includes(tag)));
  const tagValues = useMemo(()=>[...new Set((tab==="prompts"?library.prompts:library.media.filter(item=>item.kind===mediaKind)).flatMap(item=>item.tags||[]))].sort((a,b)=>a.localeCompare(b,"zh-CN")),[library,tab,mediaKind]);
  const urls = useAssetUrls([...media.map(item=>item.assetId),...prompts.map(item=>item.exampleAssetId||"")]);
  const title = tab==="prompts"?"调用提示词":tab==="products"?"调用产品素材":"调用图库";
  return <aside className="native-library-panel"><header><div><strong>{title}</strong><small>{selectedContainerId?"已选中图片容器，点击素材直接放入":selectedTaskId?"已选中生图任务":"未选中任务，素材将独立放入画布"}</small></div><button onClick={onClose} aria-label="收起资产库">×</button></header><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="搜索可调用内容"/>{tagValues.length>0&&<nav className="native-library-filters"><button className={!tag?"active":""} onClick={()=>setTag("")}>全部</button>{tagValues.map(value=><button key={value} className={tag===value?"active":""} onClick={()=>setTag(value)}>{value}</button>)}</nav>}<section className={`native-library-content ${tab==="references"?"native-reference-masonry":""}`}>{tab==="prompts"?prompts.map(item=><PromptCard key={item.id} item={item} selectedTaskId={selectedTaskId}/>):media.map(item=><MediaCard key={item.id} item={item} url={urls[item.assetId]} selectedTaskId={selectedTaskId} selectedContainerId={selectedContainerId}/>) }{(tab==="prompts"?!prompts.length:!media.length)&&<p className="native-library-empty">没有符合条件的内容</p>}</section><footer className="native-library-footer"><button onClick={()=>{onClose();setTimeout(()=>window.dispatchEvent(new CustomEvent('pixel-flow:open-library-management',{detail:{tab}})),0)}}>前往库管理</button></footer></aside>;
}
