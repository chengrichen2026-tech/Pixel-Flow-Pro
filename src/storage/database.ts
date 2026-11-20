import Dexie, { type Table } from "dexie";

import type { TaskRunRecord } from "./task-run-repository.ts";
import type { Project } from "../types.ts";

export type AssetRecord = { id: string; blob: Blob; createdAt: number };

export class NodeCanvasDatabase extends Dexie {
  projects!: Table<Project, string>;
  assets!: Table<AssetRecord, string>;
  runs!: Table<TaskRunRecord, string>;

  constructor(name = "gpt-node-canvas") {
    super(name);
    this.version(1).stores({
      projects: "id, updatedAt, name",
      assets: "id, createdAt",
      runs: "id, [projectId+taskId], startedAt"
    });
    this.version(2).stores({
      projects: "id, updatedAt, name",
      deletedProjects: "id, deletedAt",
      assets: "id, createdAt",
      runs: "id, [projectId+taskId], startedAt"
    });
    this.version(3).stores({ deletedProjects: null });
    this.version(4).stores({ runs: "id, projectId, [projectId+taskId], startedAt" });
  }
}
