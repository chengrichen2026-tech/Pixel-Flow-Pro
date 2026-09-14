export const API_WORKER_URL = "http://127.0.0.1:43129";

export type ApiWorkerImage = { mimeType: string; base64: string };
export type ApiWorkerJob = { status: string; images?: ApiWorkerImage[]; error?: string };

export async function apiWorkerRequest<T = Record<string, unknown>>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_WORKER_URL}${path}`, options);
  } catch {
    throw new Error("本机 API 任务服务未启动，请运行 api-worker/install.sh");
  }
  const payload = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || `本机 API 任务服务返回 HTTP ${response.status}`);
  return payload;
}

export async function waitForApiWorkerJob(jobId: string): Promise<ApiWorkerImage[]> {
  while (true) {
    const job = await apiWorkerRequest<ApiWorkerJob>(`/jobs/${jobId}`);
    if (job.status === "completed") return job.images || [];
    if (job.status === "failed") throw new Error(job.error || "API 生图失败");
    await new Promise(resolve => setTimeout(resolve, 2_000));
  }
}
