import http from "node:http";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { requestApiImages } from "../public/api-client.js";

const host = "127.0.0.1";
const port = Number(process.env.PIXEL_FLOW_API_WORKER_PORT || 43129);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const jobsDir = resolve(root, "runtime", "api-jobs");
await mkdir(jobsDir, { recursive: true });

function jobPath(id) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("invalid job id");
  return resolve(jobsDir, `${id}.json`);
}

async function saveJob(job) {
  // The runtime directory is intentionally disposable. Recreate it before
  // every atomic write so cleanup or a transient directory removal cannot
  // turn a running generation into an ENOENT failure.
  await mkdir(jobsDir, { recursive: true });
  const path = jobPath(job.id);
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(job), { mode: 0o600 });
  await rename(temporary, path);
}

async function loadJob(id) {
  return JSON.parse(await readFile(jobPath(id), "utf8"));
}

function publicJob(job) {
  return {
    id: job.id,
    status: job.status,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    images: job.status === "completed" ? job.images : void 0,
    error: job.status === "failed" ? job.error : void 0
  };
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 80 * 1024 * 1024) throw new Error("任务数据超过 80MB 限制");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function runJob(job, input) {
  try {
    const imageBlobs = (input.images || []).map((image, index) => ({
      blob: new Blob([Buffer.from(image.base64, "base64")], { type: image.mimeType || "image/png" }),
      name: image.name || `image-${index + 1}.png`
    }));
    const images = await requestApiImages({
      apiKey: input.apiKey,
      prompt: input.prompt,
      ratio: input.ratio,
      imageBlobs
    });
    Object.assign(job, { status: "completed", images, updatedAt: Date.now() });
  } catch (error) {
    Object.assign(job, {
      status: "failed",
      error: error instanceof Error ? error.message : "API 生图失败",
      updatedAt: Date.now()
    });
  }
  await saveJob(job);
}

for (const file of await readdir(jobsDir)) {
  if (!file.endsWith(".json")) continue;
  try {
    const job = JSON.parse(await readFile(resolve(jobsDir, file), "utf8"));
    if (job.status === "running") {
      Object.assign(job, { status: "failed", error: "本机 API 任务服务曾重启，该请求无法恢复", updatedAt: Date.now() });
      await saveJob(job);
    }
  } catch {
  }
}

const server = http.createServer(async (request, response) => {
  try {
    if (request.method === "OPTIONS") return sendJson(response, 204, {});
    const url = new URL(request.url || "/", `http://${host}:${port}`);
    if (request.method === "GET" && url.pathname === "/health") {
      return sendJson(response, 200, { ok: true, service: "pixel-flow-api-worker", pid: process.pid });
    }
    if (request.method === "POST" && url.pathname === "/jobs") {
      const input = await readJson(request);
      if (!input.apiKey?.trim() || !input.prompt?.trim()) return sendJson(response, 400, { error: "缺少 API Key 或提示词" });
      const now = Date.now();
      const job = { id: randomUUID(), status: "running", createdAt: now, updatedAt: now };
      await saveJob(job);
      void runJob(job, input);
      return sendJson(response, 202, publicJob(job));
    }
    const match = url.pathname.match(/^\/jobs\/([a-f0-9-]{36})$/);
    if (match && request.method === "GET") return sendJson(response, 200, publicJob(await loadJob(match[1])));
    if (match && request.method === "DELETE") {
      await unlink(jobPath(match[1])).catch(() => {});
      return sendJson(response, 200, { deleted: true });
    }
    return sendJson(response, 404, { error: "not found" });
  } catch (error) {
    return sendJson(response, error?.code === "ENOENT" ? 404 : 500, { error: error instanceof Error ? error.message : "worker error" });
  }
});

server.listen(port, host, () => console.log(`Pixel Flow API worker listening on http://${host}:${port}`));
