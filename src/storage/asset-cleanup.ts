import { db, type AssetRecord } from "../db";
import { readLibrary, type LibraryData } from "../library";
import type { Project } from "../types";

// Protect assets that may have been written just before their canvas/library reference.
export const ASSET_CLEANUP_GRACE_MS = 10 * 60 * 1000;

export type AssetStorageReport = {
  totalAssets: number;
  totalBytes: number;
  retainedAssets: number;
  retainedBytes: number;
  unusedAssets: number;
  unusedBytes: number;
};

export type CleanupResult = {
  deletedAssetIds: string[];
  deletedBytes: number;
  report: AssetStorageReport;
};

const projectAssetIds = (project: Project) => project.graph.nodes.flatMap(node => {
  if (node.kind === "image" || node.kind === "result") return [node.assetId];
  if (node.kind === "image_container") return node.items.map(item => item.assetId);
  if (node.kind !== "task" || !node.upscale) return [];
  return [
    node.upscale.sourceAssetId,
    ...(node.upscale.plan?.tiles || []).flatMap(tile => [tile.resultAssetId, tile.previousResultAssetId])
  ].filter((assetId): assetId is string => Boolean(assetId));
});

export const collectProjectAssetIds = (projects: Project[]) => new Set(projects.flatMap(projectAssetIds));

export const collectLibraryAssetIds = (library: LibraryData) => new Set([
  ...library.prompts.map(item => item.exampleAssetId).filter((assetId): assetId is string => Boolean(assetId)),
  ...library.media.map(item => item.assetId).filter(Boolean)
]);

export function findUnusedAssets(assets: AssetRecord[], projects: Project[], library: LibraryData, now = Date.now()) {
  const referenced = collectProjectAssetIds(projects);
  for (const assetId of collectLibraryAssetIds(library)) referenced.add(assetId);
  return assets.filter(asset => !referenced.has(asset.id) && now - asset.createdAt >= ASSET_CLEANUP_GRACE_MS);
}

export function buildAssetStorageReport(assets: AssetRecord[], projects: Project[], library: LibraryData, now = Date.now()): AssetStorageReport {
  const unused = findUnusedAssets(assets, projects, library, now);
  const unusedIds = new Set(unused.map(asset => asset.id));
  const retained = assets.filter(asset => !unusedIds.has(asset.id));
  return {
    totalAssets: assets.length,
    totalBytes: assets.reduce((sum, asset) => sum + asset.blob.size, 0),
    retainedAssets: retained.length,
    retainedBytes: retained.reduce((sum, asset) => sum + asset.blob.size, 0),
    unusedAssets: unused.length,
    unusedBytes: unused.reduce((sum, asset) => sum + asset.blob.size, 0)
  };
}

export async function inspectAssetStorage(): Promise<AssetStorageReport> {
  const [assets, projects] = await Promise.all([db.assets.toArray(), db.projects.toArray()]);
  return buildAssetStorageReport(assets, projects, readLibrary());
}

export async function cleanupUnusedAssets(): Promise<CleanupResult> {
  const library = readLibrary();
  const timestamp = Date.now();
  return db.transaction("rw", db.projects, db.assets, async () => {
    const [projects, assets] = await Promise.all([db.projects.toArray(), db.assets.toArray()]);
    const unused = findUnusedAssets(assets, projects, library, timestamp);
    if (unused.length) await db.assets.bulkDelete(unused.map(asset => asset.id));
    const unusedIds = new Set(unused.map(asset => asset.id));
    const remaining = assets.filter(asset => !unusedIds.has(asset.id));
    return {
      deletedAssetIds: unused.map(asset => asset.id),
      deletedBytes: unused.reduce((sum, asset) => sum + asset.blob.size, 0),
      report: buildAssetStorageReport(remaining, projects, library, timestamp)
    };
  });
}
