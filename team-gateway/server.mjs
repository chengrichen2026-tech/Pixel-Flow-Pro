#!/usr/bin/env node
import http from "node:http";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rename, rm, unlink, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_DAILY_LIMIT, MAX_INPUT_BYTES, dayKey, normalizeDailyLimit, publicJob, sizeForRatio, tokenMatches, validateJobInput } from "./core.mjs";

const host = process.env.PIXEL_FLOW_TEAM_HOST || "127.0.0.1";
const port = Number(process.env.PIXEL_FLOW_TEAM_PORT || 43130);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runtimeDir = process.env.PIXEL_FLOW_TEAM_RUNTIME_DIR || resolve(root, "runtime", "team-gateway");
const jobsDir = resolve(runtimeDir, "jobs");
const usagePath = resolve(runtimeDir, "usage.json");
const configPath = process.env.PIXEL_FLOW_TEAM_CONFIG || resolve(runtimeDir, "config.json");
const python = process.env.PIXEL_FLOW_TEAM_PYTHON || "python3";
const imageScript = process.env.PIXEL_FLOW_CODEX_IMAGE_SCRIPT || resolve(homedir(), ".codex", "skills", "codex-gpt-image", "scripts", "codex_gpt_image.py");
const queue = [];
const jobs = new Map();
let usage = {};
let running = false;

await mkdir(jobsDir, { recursive: true });
try { usage = JSON.parse(await readFile(usagePath, "utf8")); } catch {}

function jobPath(id) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("invalid job id");
  return resolve(jobsDir, `${id}.json`);
}

async function saveJob(job) {
  await mkdir(jobsDir, { recursive: true });
  const path = jobPath(job.id);
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(job), { mode: 0o600 });
  await rename(temporary, path);
  jobs.set(job.id, job);
}

async function readConfig() {
  let config;
  try {
    config = JSON.parse(await readFile(configPath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") throw new Error("团队网关尚未初始化，请先运行 npm run team-gateway:init");
    throw error;
  }
  if (!Array.isArray(config.members)) throw new Error("团队网关配置缺少 members");
  return config;
}

function bearerToken(request) {
  const match = String(request.headers.authorization || "").match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

async function authenticate(request) {
  const token = bearerToken(request);
  if (!token) return null;
  const config = await readConfig();
  return config.members.find((member) => member.active !== false && tokenMatches(token, member.tokenHash)) || null;
}

function usageToday(memberId) {
  return Number(usage[`${dayKey()}:${memberId}`] || 0);
}

async function reserveUsage(memberId) {
  const key = `${dayKey()}:${memberId}`;
  usage[key] = Number(usage[key] || 0) + 1;
  usage = Object.fromEntries(Object.entries(usage).filter(([entry]) => entry.slice(0, 10) >= dayKey(Date.now() - 14 * 24 * 60 * 60 * 1000)));
  const temporary = `${usagePath}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(usage, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, usagePath);
}

function queuePosition(jobId) {
  const index = queue.indexOf(jobId);
  return index < 0 ? 0 : index + (running ? 2 : 1);
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(status === 204 ? "" : JSON.stringify(payload));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_INPUT_BYTES) throw new Error("任务数据超过 80MB 限制");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function runProcess(command, args, timeoutMs) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], env: process.env });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", rejectPromise);
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolvePromise({ stdout, stderr });
      else rejectPromise(new Error(signal ? `Codex 生图进程因 ${signal} 停止` : stderr.trim().split("\n").at(-1) || `Codex 生图进程退出：${code}`));
    });
  });
}

async function generate(job) {
  const temporary = await mkdtemp(join(tmpdir(), "pixel-flow-team-"));
  try {
    const promptPath = resolve(temporary, "prompt.txt");
    const outputPath = resolve(temporary, "output.png");
    await writeFile(promptPath, job.input.prompt, { mode: 0o600 });
    const args = [imageScript, "generate", "--prompt-file", promptPath, "--out", outputPath, "--size", sizeForRatio(job.input.ratio), "--timeout", "420"];
    for (const image of job.input.images) {
      const path = resolve(temporary, basename(image.name));
      await writeFile(path, Buffer.from(image.base64, "base64"), { mode: 0o600 });
      args.push("--image", path);
    }
    await runProcess(python, args, 8 * 60 * 1000);
    const image = await readFile(outputPath);
    return [{ base64: image.toString("base64"), mimeType: "image/png" }];
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

async function pumpQueue() {
  if (running || queue.length === 0) return;
  const id = queue.shift();
  const job = jobs.get(id);
  if (!job || job.status !== "queued") return void pumpQueue();
  running = true;
  Object.assign(job, { status: "running", updatedAt: Date.now() });
  await saveJob(job);
  try {
    const images = await generate(job);
    Object.assign(job, { status: "completed", images, input: void 0, updatedAt: Date.now() });
  } catch (error) {
    Object.assign(job, { status: "failed", error: error instanceof Error ? error.message : "Codex 生图失败", input: void 0, updatedAt: Date.now() });
  }
  await saveJob(job);
  running = false;
  void pumpQueue();
}

for (const file of await readdir(jobsDir)) {
  if (!file.endsWith(".json")) continue;
  try {
    const job = JSON.parse(await readFile(resolve(jobsDir, file), "utf8"));
    if (job.status === "running") Object.assign(job, { status: "failed", error: "团队网关曾重启；为避免重复消耗额度，未自动重试", input: void 0, updatedAt: Date.now() });
    jobs.set(job.id, job);
    if (job.status === "queued") queue.push(job.id);
    await saveJob(job);
  } catch {
  }
}
void pumpQueue();

const server = http.createServer(async (request, response) => {
  try {
    if (request.method === "OPTIONS") return sendJson(response, 204, {});
    const url = new URL(request.url || "/", `http://${host}:${port}`);
    if (request.method === "GET" && url.pathname === "/health") {
      const configReady = await readConfig().then(() => true, () => false);
      return sendJson(response, 200, { ok: true, service: "pixel-flow-team-gateway", configReady, running, queued: queue.length });
    }
    const member = await authenticate(request);
    if (!member) return sendJson(response, 401, { error: "团队令牌无效或已撤销" });
    if (request.method === "GET" && url.pathname === "/me") {
      return sendJson(response, 200, { id: member.id, name: member.name, dailyLimit: normalizeDailyLimit(member.dailyLimit), usedToday: usageToday(member.id) });
    }
    if (request.method === "POST" && url.pathname === "/jobs") {
      const input = validateJobInput(await readJson(request));
      const existing = [...jobs.values()].find((job) => job.memberId === member.id && job.requestId === input.requestId);
      if (existing) return sendJson(response, 200, publicJob(existing, queuePosition(existing.id)));
      const dailyLimit = normalizeDailyLimit(member.dailyLimit);
      if (dailyLimit !== null && usageToday(member.id) >= dailyLimit) return sendJson(response, 429, { error: `今日额度已用完（${dailyLimit} 次）` });
      await reserveUsage(member.id);
      const now = Date.now();
      const job = { id: randomUUID(), requestId: input.requestId, memberId: member.id, memberName: member.name, status: "queued", input, createdAt: now, updatedAt: now };
      await saveJob(job);
      queue.push(job.id);
      void pumpQueue();
      return sendJson(response, 202, publicJob(job, queuePosition(job.id)));
    }
    const match = url.pathname.match(/^\/jobs\/([a-f0-9-]{36})$/);
    const job = match ? jobs.get(match[1]) : null;
    if (match && (!job || job.memberId !== member.id)) return sendJson(response, 404, { error: "任务不存在" });
    if (match && request.method === "GET") return sendJson(response, 200, publicJob(job, queuePosition(job.id)));
    if (match && request.method === "DELETE") {
      if (!["completed", "failed"].includes(job.status)) return sendJson(response, 409, { error: "运行中的任务不能删除" });
      jobs.delete(job.id);
      await unlink(jobPath(job.id)).catch(() => {});
      return sendJson(response, 200, { deleted: true });
    }
    return sendJson(response, 404, { error: "not found" });
  } catch (error) {
    return sendJson(response, error instanceof SyntaxError ? 400 : 500, { error: error instanceof Error ? error.message : "team gateway error" });
  }
});

server.listen(port, host, () => console.log(`Pixel Flow team gateway listening on http://${host}:${port}`));
