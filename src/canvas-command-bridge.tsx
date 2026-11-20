import { useEffect } from "react";
import { useStore } from "./store";
import type { Point, Project } from "./types";

export const CANVAS_COMMAND_EVENT = "pixel-flow:canvas-command";

type CanvasCommand =
  | { type: "project.import"; project: Project }
  | { type: "project.rename"; projectId: string; name: string }
  | { type: "project.delete"; projectId: string }
  | { type: "media.add"; assetId: string; title: string; position: Point; targetTaskId?: string }
  | { type: "container.addAsset"; assetId: string; title: string; containerId: string }
  | { type: "task.applyPrompt"; taskId: string; content: string; mode: "replace" | "append" }
  | { type: "task.createFromPrompt"; prompt: string; position: Point; sourceNodeIds: string[] }
  | { type: "edge.disconnect"; edgeId: string };

type CanvasCommandDetail = {
  command: CanvasCommand;
  resolve: (result?: unknown) => void;
  reject: (error: unknown) => void;
};

async function executeCanvasCommand(command: CanvasCommand) {
  const store = useStore.getState();
  switch (command.type) {
    case "project.import":
      await store.importProject(command.project);
      return { projectId: command.project.id };
    case "project.rename":
      await store.renameProject(command.name, command.projectId);
      return { projectId: command.projectId };
    case "project.delete":
      await store.deleteProject(command.projectId);
      return { projectId: command.projectId };
    case "media.add":
      await store.addExistingAsset(command.assetId, command.title, command.position, command.targetTaskId);
      return { selectedNodeIds: useStore.getState().selected };
    case "container.addAsset":
      await store.addExistingAssetToContainer(command.assetId, command.title, command.containerId);
      return { selectedNodeIds: useStore.getState().selected };
    case "task.applyPrompt":
      if (!await store.applyPromptToTask(command.taskId, command.content, command.mode)) throw new Error("找不到需要更新的任务");
      return { taskId: command.taskId };
    case "task.createFromPrompt":
      return { taskId: await store.addTaskFromPrompt(command.position, command.sourceNodeIds, command.prompt) };
    case "edge.disconnect":
      await store.disconnectEdge(command.edgeId);
      return { edgeId: command.edgeId };
  }
}

export function CanvasCommandBridge() {
  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<CanvasCommandDetail>).detail;
      if (!detail?.command || typeof detail.resolve !== "function" || typeof detail.reject !== "function") return;
      void executeCanvasCommand(detail.command).then(detail.resolve, detail.reject);
    };
    window.addEventListener(CANVAS_COMMAND_EVENT, listener);
    return () => window.removeEventListener(CANVAS_COMMAND_EVENT, listener);
  }, []);
  return null;
}
