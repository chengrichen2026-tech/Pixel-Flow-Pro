export const MAX_CONCURRENCY = 5;
export const MAX_BROWSER_CONCURRENCY = 5;
export const BROWSER_LAUNCH_GAP_MS = 6_000;

export type TaskQueue = {
  waiting: string[];
  running: string[];
  completed: string[];
  failed: Record<string, string>;
};

export type QueueSnapshot = {
  queue: TaskQueue;
  pendingScopes: Array<[string, string]>;
};

export const emptyQueue = (): TaskQueue => ({ waiting: [], running: [], completed: [], failed: {} });

export function createQueueSnapshot(queue: TaskQueue, pendingScopes: Map<string, string>): QueueSnapshot {
  return { queue: structuredClone(queue), pendingScopes: [...pendingScopes] };
}

export function restoreQueueSnapshot(raw: unknown): { queue: TaskQueue; pendingScopes: Map<string, string> } {
  if (!raw || typeof raw !== "object") return { queue: emptyQueue(), pendingScopes: new Map() };
  const snapshot = raw as Partial<QueueSnapshot>;
  const queue = snapshot.queue;
  if (!queue || !Array.isArray(queue.waiting) || !Array.isArray(queue.running) || !Array.isArray(queue.completed) || !queue.failed || typeof queue.failed !== "object") {
    return { queue: emptyQueue(), pendingScopes: new Map() };
  }
  const pendingScopes = Array.isArray(snapshot.pendingScopes)
    ? snapshot.pendingScopes.filter((entry): entry is [string, string] => Array.isArray(entry) && entry.length === 2 && entry.every(value => typeof value === "string"))
    : [];
  return { queue: structuredClone(queue), pendingScopes: new Map(pendingScopes) };
}

export function enqueue(queue: TaskQueue, taskIds: string[]): TaskQueue {
  const known = new Set([...queue.waiting, ...queue.running]);
  const waiting = [...queue.waiting];
  const completed = queue.completed.filter(taskId => !taskIds.includes(taskId));
  const failed = { ...queue.failed };
  for (const taskId of taskIds) {
    if (known.has(taskId)) continue;
    known.add(taskId);
    waiting.push(taskId);
    delete failed[taskId];
  }
  return { ...queue, waiting, completed, failed };
}

export function complete(queue: TaskQueue, taskId: string): TaskQueue {
  if (!queue.running.includes(taskId)) return queue;
  return { ...queue, running: queue.running.filter(id => id !== taskId), completed: [...queue.completed, taskId] };
}

export function fail(queue: TaskQueue, taskId: string, reason: string): TaskQueue {
  if (!queue.running.includes(taskId)) return queue;
  return { ...queue, running: queue.running.filter(id => id !== taskId), failed: { ...queue.failed, [taskId]: reason } };
}

export function cancelTask(queue: TaskQueue, taskId: string): TaskQueue {
  if (!queue.waiting.includes(taskId) && !queue.running.includes(taskId)) return queue;
  return {
    ...queue,
    waiting: queue.waiting.filter(id => id !== taskId),
    running: queue.running.filter(id => id !== taskId)
  };
}

export function reconcileQueue(queue: TaskQueue, activeTaskKeys: ReadonlySet<string>): TaskQueue {
  const liveUnique = (keys: string[]) => [...new Set(keys)].filter(key => activeTaskKeys.has(key));
  return {
    waiting: liveUnique(queue.waiting),
    running: liveUnique(queue.running),
    completed: [],
    failed: {}
  };
}
