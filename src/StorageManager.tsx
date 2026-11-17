import { useCallback, useEffect, useState } from "react";
import { cleanupUnusedAssets, inspectAssetStorage, type AssetStorageReport } from "./storage/asset-cleanup";
import "./storage-manager.css";

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
};

export default function StorageManager({onClose}:{onClose:()=>void}) {
  const [report,setReport] = useState<AssetStorageReport|null>(null);
  const [busy,setBusy] = useState(false);
  const [confirming,setConfirming] = useState(false);
  const [notice,setNotice] = useState("");
  const refresh = useCallback(async()=>setReport(await inspectAssetStorage()),[]);
  useEffect(()=>{void refresh()},[refresh]);
  const clean = async()=>{
    setBusy(true);setNotice("");
    try {
      const result=await cleanupUnusedAssets();
      setReport(result.report);
      setNotice(`已清理 ${result.deletedAssetIds.length} 张图片，释放 ${formatBytes(result.deletedBytes)}`);
    } catch(error) {
      setNotice(error instanceof Error?error.message:String(error));
    } finally {
      setBusy(false);setConfirming(false);
    }
  };
  return <div className="storage-settings-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)onClose()}}>
    <section className="storage-settings" role="dialog" aria-modal="true" aria-labelledby="storage-settings-title">
      <header><div><strong id="storage-settings-title">存储空间</strong><small>管理 Pixel Flow 保存在当前浏览器中的图片</small></div><button onClick={onClose} aria-label="关闭存储空间">×</button></header>
      <fieldset><legend>本地占用</legend><dl><div><dt>图片总数</dt><dd>{report?`${report.totalAssets} 张`:"正在统计"}</dd></div><div><dt>总占用</dt><dd>{report?formatBytes(report.totalBytes):"--"}</dd></div><div><dt>保留内容</dt><dd>{report?formatBytes(report.retainedBytes):"--"}</dd></div><div data-cleanable={Boolean(report?.unusedBytes)}><dt>可安全清理</dt><dd>{report?formatBytes(report.unusedBytes):"--"}</dd></div></dl></fieldset>
      <p className="storage-settings-note">只清理未被任何画布、产品素材库、图库或提示词使用的图片。</p>
      {confirming&&report?<p className="storage-settings-warning">将永久删除 {report.unusedAssets} 张未使用图片，释放 {formatBytes(report.unusedBytes)}。此操作无法撤销。</p>:null}
      {notice?<p className="storage-settings-result" role="status">{notice}</p>:null}
      <footer><button onClick={confirming?()=>setConfirming(false):onClose}>{confirming?"取消":"关闭"}</button><button className="primary" disabled={busy||!report?.unusedAssets} onClick={()=>confirming?void clean():setConfirming(true)}>{busy?"正在清理":confirming?"确认清理":`清理 ${report?.unusedAssets||0} 张图片`}</button></footer>
    </section>
  </div>;
}
