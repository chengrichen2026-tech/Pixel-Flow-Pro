export type TaskScope = { projectId: string; taskId: string };

export const createTaskScopeKey = (projectId: string, taskId: string): string =>
  JSON.stringify([projectId, taskId]);

export function parseTaskScopeKey(key: string): TaskScope | undefined {
  try {
    const value: unknown = JSON.parse(key);
    if (!Array.isArray(value) || value.length !== 2 || value.some(part => typeof part !== "string")) return undefined;
    return { projectId: value[0], taskId: value[1] };
  } catch {
    return undefined;
  }
}
