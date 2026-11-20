import Dexie, { type EntityTable } from "dexie";
import type { Project } from "./types";
import type { TaskRunRecord } from "./storage/task-run-repository";

export type AssetRecord = { id: string; blob: Blob; createdAt: number };
type RunRecord = Partial<TaskRunRecord> & { id: string; projectId: string; taskId: string; startedAt: number };

export class PixelFlowDatabase extends Dexie {
  projects!: EntityTable<Project, "id">;
  assets!: EntityTable<AssetRecord, "id">;
  runs!: EntityTable<RunRecord, "id">;
  constructor() {
    super("gpt-node-canvas");
    this.version(1).stores({ projects: "id, updatedAt, name", assets: "id, createdAt", runs: "id, [projectId+taskId], startedAt" });
    this.version(2).stores({ projects: "id, updatedAt, name", deletedProjects: "id, deletedAt", assets: "id, createdAt", runs: "id, [projectId+taskId], startedAt" });
    this.version(3).stores({ deletedProjects: null });
    this.version(4).stores({ runs: "id, projectId, [projectId+taskId], startedAt" });
  }
}

export const db = new PixelFlowDatabase();
export const id = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
