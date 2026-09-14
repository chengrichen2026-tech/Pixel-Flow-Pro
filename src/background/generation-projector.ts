import { projectRunToLegacyTask, type RunProjectionRecord } from "../domain/run-projection.ts";
import type { LegacyTaskStatus } from "../domain/task-run.ts";
import type { CanvasNode, Project, TaskNode, TaskStatus } from "../types.ts";
import { decodeBase64 } from "./binary.ts";

type Graph = Project["graph"];
type GeneratedImage = { base64: string; mimeType: string };
export type GenerationProjectMessage =
  | { type: "TASK_STATUS"; projectId: string; taskId: string }
  | { type: "TASK_ERROR"; projectId: string; taskId: string }
  | { type: "TASK_RESULT"; projectId: string; taskId: string; images: GeneratedImage[]; responseText?: string };

const makeId = (prefix: string): string => `${prefix}-${crypto.randomUUID()}`;

const findNode = (graph: Graph, id: string): CanvasNode => {
  const node = graph.nodes.find(candidate => candidate.id === id);
  if (!node) throw new Error(`找不到节点：${id}`);
  return node;
};

const findTask = (graph: Graph, id: string): TaskNode => {
  const node = findNode(graph, id);
  if (node.kind !== "task") throw new Error(`节点不是任务：${id}`);
  return node;
};

export function getTaskInputs(graph: Graph, taskId: string): Array<{ edgeId: string; node: CanvasNode; label: string }> {
  const task = findTask(graph, taskId);
  let imageIndex = 0;
  let textIndex = 0;
  const inputs: Array<{ edgeId: string; node: CanvasNode; label: string }> = [];
  for (const edgeId of task.inputEdgeOrder) {
    const edge = graph.edges.find(candidate => candidate.id === edgeId && (candidate.target === taskId || candidate.target === task.batchParentTaskId));
    if (!edge) continue;
    const node = findNode(graph, edge.source);
    if (node.kind === "task" || node.kind === "text_result") continue;
    if (node.kind === "text") {
      textIndex += 1;
      inputs.push({ edgeId, node, label: `文字${textIndex}` });
    } else {
      imageIndex += 1;
      inputs.push({ edgeId, node, label: `图片${imageIndex}` });
    }
  }
  return inputs;
}

function appendResult(graph: Graph, taskId: string, imageAssetId: string): Graph {
  const task = findTask(graph, taskId);
  const owner = task.batchParentTaskId ? findTask(graph, task.batchParentTaskId) : task;
  const existingResults = graph.edges.filter(edge => edge.source === owner.id && edge.kind === "output").length;
  const resultId = makeId("result");
  return {
    ...graph,
    nodes: [...graph.nodes, { id: resultId, kind: "result", assetId: imageAssetId, taskId: owner.id, title: `生成结果${existingResults + 1}`, position: { x: owner.position.x + 560 + existingResults * 360, y: owner.position.y } }],
    edges: [...graph.edges, { id: makeId("edge"), source: owner.id, target: resultId, kind: "output" }]
  };
}

function updateTask(project: Project, taskId: string, update: (task: TaskNode) => TaskNode): Project {
  return { ...project, graph: { ...project.graph, nodes: project.graph.nodes.map(node => node.id === taskId && node.kind === "task" ? update(node) : node) }, updatedAt: Date.now() };
}

function updateBatchParent(project: Project, childTaskId: string, status: LegacyTaskStatus, detail?: string): Project {
  const child = project.graph.nodes.find((node): node is TaskNode => node.id === childTaskId && node.kind === "task");
  if (!child?.batchParentTaskId) return project;
  return updateTask(project, child.batchParentTaskId, parent => {
    const items = (parent.batchItems || []).map(item => item.taskId === childTaskId ? { ...item, status: status as TaskStatus, detail } : item);
    const running = items.some(item => ["queued", "waiting_page", "uploading", "sending", "generating"].includes(item.status));
    const failed = items.filter(item => ["failed", "manual_action"].includes(item.status)).length;
    const completed = items.filter(item => item.status === "completed").length;
    const parentStatus: TaskStatus = running ? "generating" : failed ? "failed" : "completed";
    return { ...parent, batchItems: items, status: parentStatus, statusDetail: failed ? `${completed}/${items.length} 完成，${failed} 项失败` : undefined, runCount: parentStatus === "completed" ? parent.runCount + 1 : parent.runCount };
  });
}

function appendTextResult(graph: Graph, taskId: string, text: string): Graph {
  const task = graph.nodes.find((node): node is TaskNode => node.id === taskId && node.kind === "task");
  if (!task) return graph;
  const outputCount = graph.edges.filter(edge => edge.source === taskId && edge.kind === "output").length;
  const textResultCount = graph.nodes.filter(node => node.kind === "text_result" && node.taskId === taskId).length;
  const id = makeId("text-result");
  return {
    ...graph,
    nodes: [...graph.nodes, { id, kind: "text_result", taskId, title: `文字结果 ${textResultCount + 1}`, text, position: { x: task.position.x + 560, y: task.position.y + outputCount * 260 } }],
    edges: [...graph.edges, { id: makeId("edge"), source: taskId, target: id, kind: "output" }]
  };
}

export async function applyTaskMessage(
  project: Project,
  message: GenerationProjectMessage,
  saveAsset: (blob: Blob) => Promise<string>,
  run: RunProjectionRecord
): Promise<Project> {
  if (message.projectId !== project.id) return project;
  const projection = projectRunToLegacyTask(run);
  if (message.type === "TASK_STATUS" || message.type === "TASK_ERROR") {
    const updated = updateTask(project, message.taskId, task => ({ ...task, ...projection, conversationUrl: projection.conversationUrl ?? task.conversationUrl }));
    return updateBatchParent(updated, message.taskId, projection.status, projection.statusDetail);
  }
  let graph = project.graph;
  for (const image of message.images) graph = appendResult(graph, message.taskId, await saveAsset(decodeBase64(image.base64, image.mimeType)));
  if (message.responseText?.trim()) graph = appendTextResult(graph, message.taskId, message.responseText);
  const updated = updateTask({ ...project, graph, updatedAt: Date.now() }, message.taskId, task => ({ ...task, ...projection, runCount: task.runCount + 1, conversationUrl: projection.conversationUrl ?? task.conversationUrl, lastResponseText: message.responseText }));
  return updateBatchParent(updated, message.taskId, projection.status, projection.statusDetail);
}
