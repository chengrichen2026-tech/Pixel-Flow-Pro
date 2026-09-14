import type { Project, TaskNode } from "../types.ts";
import type { NodeCanvasDatabase } from "./database.ts";

const newId = (prefix: string): string => `${prefix}-${crypto.randomUUID()}`;

export class ProjectRepository {
  private readonly database: NodeCanvasDatabase;

  constructor(database: NodeCanvasDatabase) {
    this.database = database;
  }

  async createProject(name: string): Promise<Project> {
    const now = Date.now();
    const project: Project = {
      id: newId("project"),
      name: name.trim() || "未命名画布",
      graph: { nodes: [], edges: [] },
      createdAt: now,
      updatedAt: now
    };
    await this.database.projects.add(project);
    return structuredClone(project);
  }

  async listProjects(): Promise<Project[]> {
    return this.database.projects.orderBy("updatedAt").reverse().toArray();
  }

  async loadProject(id: string): Promise<Project | undefined> {
    return this.database.projects.get(id);
  }

  async saveProject(project: Project): Promise<void> {
    await this.database.projects.put({ ...structuredClone(project), updatedAt: project.updatedAt });
  }

  async mutateProject(projectId: string, update: (project: Project) => Project | Promise<Project>): Promise<Project> {
    return this.database.transaction("rw", this.database.projects, this.database.assets, async () => {
      const current = await this.database.projects.get(projectId);
      if (!current) throw new Error("找不到画布项目");
      const updated = { ...await update(structuredClone(current)), updatedAt: Date.now() };
      await this.database.projects.put(structuredClone(updated));
      return structuredClone(updated);
    });
  }

  async mutateGenerationState(projectId: string, update: (project: Project) => Project | Promise<Project>): Promise<Project> {
    return this.database.transaction("rw", this.database.projects, this.database.assets, this.database.runs, async () => {
      const current = await this.database.projects.get(projectId);
      if (!current) throw new Error("找不到画布项目");
      const updated = { ...await update(structuredClone(current)), updatedAt: Date.now() };
      await this.database.projects.put(structuredClone(updated));
      return structuredClone(updated);
    });
  }

  async renameProject(projectId: string, name: string): Promise<Project> {
    return this.mutateProject(projectId, project => ({ ...project, name: name.trim() || project.name }));
  }

  async saveAsset(blob: Blob): Promise<string> {
    const id = newId("asset");
    await this.database.assets.add({ id, blob, createdAt: Date.now() });
    return id;
  }

  async loadAsset(id: string): Promise<Blob | undefined> {
    return (await this.database.assets.get(id))?.blob;
  }

  async deleteLocalTask(projectId: string, taskId: string): Promise<{ conversationUrl?: string; onlineConversationDeleted: false }> {
    return this.database.transaction("rw", this.database.projects, this.database.runs, async () => {
      const project = await this.database.projects.get(projectId);
      if (!project) throw new Error("找不到画布项目");
      const task = project.graph.nodes.find((node): node is TaskNode => node.id === taskId && node.kind === "task");
      if (!task) throw new Error("找不到任务节点");
      project.graph = {
        nodes: project.graph.nodes.filter(node => node.id !== taskId),
        edges: project.graph.edges.filter(edge => edge.source !== taskId && edge.target !== taskId)
      };
      project.updatedAt = Date.now();
      await this.database.projects.put(project);
      await this.database.runs.where("[projectId+taskId]").equals([projectId, taskId]).delete();
      return { conversationUrl: task.conversationUrl, onlineConversationDeleted: false };
    });
  }
}
