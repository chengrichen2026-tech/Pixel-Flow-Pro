const PREFIX = "task:";

export const createTaskNotificationId = (projectId: string, taskId: string): string =>
  `${PREFIX}${encodeURIComponent(projectId)}:${encodeURIComponent(taskId)}`;

export function readNotificationTarget(notificationId: string): { projectId: string; taskId: string } | undefined {
  if (!notificationId.startsWith(PREFIX)) return undefined;
  const [projectId, taskId] = notificationId.slice(PREFIX.length).split(":");
  if (!projectId || !taskId) return undefined;
  return { projectId: decodeURIComponent(projectId), taskId: decodeURIComponent(taskId) };
}

export function notificationIdToCanvasUrl(notificationId: string, canvasUrl: string): string {
  const target = readNotificationTarget(notificationId);
  if (!target) return canvasUrl;
  const url = new URL(canvasUrl);
  url.searchParams.set("projectId", target.projectId);
  url.searchParams.set("taskId", target.taskId);
  return url.toString();
}
