import Dexie, { type EntityTable } from "dexie";
import type { Project } from "./types";

type AssetRecord = { id: string; blob: Blob; createdAt: number };
type RunRecord = { id: string; projectId: string; taskId: string; startedAt: number };

export class PixelFlowDatabase extends Dexie {
  projects!: EntityTable<Project, "id">;
  assets!: EntityTable<AssetRecord, "id">;
  runs!: EntityTable<RunRecord, "id">;
  constructor() {
    super("gpt-node-canvas");
    this.version(1).stores({ projects: "id, updatedAt, name", assets: "id, createdAt", runs: "id, [projectId+taskId], startedAt" });
  }
}

export const db = new PixelFlowDatabase();
export const id = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
