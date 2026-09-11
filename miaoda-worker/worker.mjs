#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir, hostname, tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeTaskboxUrl, sizeForRatio, splitBase64 } from "./core.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runtimeDir = process.env.PIXEL_FLOW_MIAODA_RUNTIME_DIR || resolve(root, "runtime", "miaoda-worker");
const configPath = process.env.PIXEL_FLOW_MIAODA_CONFIG || resolve(runtimeDir, "config.json");
const statusPath = resolve(runtimeDir, "status.json");
const python = process.env.PIXEL_FLOW_MIAODA_PYTHON || "python3";
const sips = process.env.PIXEL_FLOW_MIAODA_SIPS || "/usr/bin/sips";
const imageScript = process.env.PIXEL_FLOW_CODEX_IMAGE_SCRIPT || resolve(homedir(), ".codex", "skills", "codex-gpt-image", "scripts", "codex_gpt_image.py");
const pollMs = Number(process.env.PIXEL_FLOW_MIAODA_POLL_MS || 15e3);
const chunkPaceMs = Number(process.env.PIXEL_FLOW_MIAODA_CHUNK_PACE_MS || 250);
let stopping = false;

async function readConfig() {
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const gatewayUrl = normalizeTaskboxUrl(config.gatewayUrl);
  const token = String(config.token || "").trim();
  const workerId = String(config.workerId || `mac-${hostname()}`).trim();
  if (!token) throw new Error("Mac Worker 配置缺少 token");
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/.test(workerId)) throw new Error("Mac Worker ID 格式无效");
  return { gatewayUrl, token, workerId };
}

async function saveStatus(state, detail = "") {
  await mkdir(runtimeDir, { recursive: true });
  const temporary = `${statusPath}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify({ state, detail, pid: process.pid, updatedAt: Date.now() }, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, statusPath);
}

async function request(config, path, options = {}) {
  for (let attempt = 0; attempt < 7; attempt += 1) {
    const response = await fetch(`${config.gatewayUrl}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${config.token}`,
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {})
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (response.ok) return payload;
    if (response.status === 429 && attempt < 6) {
      const retryAfterSeconds = Number(response.headers.get("Retry-After"));
      const retryDelay = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0 ? retryAfterSeconds * 1e3 : Math.min(3e4, 2e3 * 2 ** attempt);
      await new Promise((resolveWait) => setTimeout(resolveWait, retryDelay));
      continue;
    }
    throw new Error(payload.error || payload.message || (response.status === 429 ? "妙搭任务箱持续限流" : `妙搭任务箱返回 HTTP ${response.status}`));
  }
  throw new Error("妙搭任务箱请求失败");
}

function runProcess(command, args, timeoutMs) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], env: process.env });
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", rejectPromise);
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(signal ? `Codex 生图进程因 ${signal} 停止` : stderr.trim().split("\n").at(-1) || `Codex 生图进程退出：${code}`));
    });
  });
}

async function downloadInput(config, job, descriptor, temporary) {
  const chunks = [];
  for (let chunkIndex = 0; chunkIndex < descriptor.totalChunks; chunkIndex += 1) {
    const chunk = await request(config, `/worker/jobs/${job.id}/input-chunks/${descriptor.imageIndex}/${chunkIndex}`);
    chunks.push(chunk.base64);
    if (chunkIndex + 1 < descriptor.totalChunks) await new Promise((resolveWait) => setTimeout(resolveWait, chunkPaceMs));
  }
  const extension = descriptor.mimeType === "image/jpeg" ? "jpg" : descriptor.mimeType.split("/")[1] || "png";
  const path = resolve(temporary, `reference-${descriptor.imageIndex + 1}.${extension}`);
  await writeFile(path, Buffer.from(chunks.join(""), "base64"), { mode: 0o600 });
  return path;
}

async function uploadImage(config, job, workerId, inputPath, endpoint, name, mimeType) {
  const base64 = (await readFile(inputPath)).toString("base64");
  const chunks = splitBase64(base64);
  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
    await request(config, `/worker/jobs/${job.id}/${endpoint}`, {
      method: "POST",
      body: JSON.stringify({
        workerId,
        imageIndex: 0,
        chunkIndex,
        totalChunks: chunks.length,
        name,
        mimeType,
        base64: chunks[chunkIndex]
      })
    });
    if (chunkIndex + 1 < chunks.length) await new Promise((resolveWait) => setTimeout(resolveWait, chunkPaceMs));
  }
}

async function processJob(config, job) {
  const temporary = await mkdtemp(resolve(tmpdir(), "pixel-flow-miaoda-"));
  const heartbeat = setInterval(() => {
    void request(config, `/worker/jobs/${job.id}/heartbeat`, {
      method: "POST",
      body: JSON.stringify({ workerId: config.workerId, leaseSeconds: 180 })
    }).catch((error) => saveStatus("heartbeat-error", error instanceof Error ? error.message : "续租失败"));
  }, 60e3);
  try {
    await saveStatus("generating", job.id);
    const promptPath = resolve(temporary, "prompt.txt");
    const outputPath = resolve(temporary, "output.png");
    const previewPath = resolve(temporary, "preview.jpg");
    await writeFile(promptPath, job.prompt, { mode: 0o600 });
    const args = [imageScript, "generate", "--prompt-file", promptPath, "--out", outputPath, "--size", sizeForRatio(job.ratio), "--timeout", "420"];
    for (const descriptor of job.inputImages || []) {
      args.push("--image", await downloadInput(config, job, descriptor, temporary));
    }
    await runProcess(python, args, 8 * 60 * 1000);
    await runProcess(
      sips,
      [
        "-Z",
        "480",
        "-s",
        "format",
        "jpeg",
        "-s",
        "formatOptions",
        "70",
        outputPath,
        "--out",
        previewPath,
      ],
      60e3,
    );
    await uploadImage(
      config,
      job,
      config.workerId,
      outputPath,
      "result-chunks",
      "result-1.png",
      "image/png",
    );
    await uploadImage(
      config,
      job,
      config.workerId,
      previewPath,
      "preview-chunks",
      "preview-1.jpg",
      "image/jpeg",
    );
    await request(config, `/worker/jobs/${job.id}/complete`, {
      method: "POST",
      body: JSON.stringify({ workerId: config.workerId, resultCount: 1 })
    });
    await saveStatus("completed", job.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Codex 生图失败";
    await request(config, `/worker/jobs/${job.id}/fail`, {
      method: "POST",
      body: JSON.stringify({ workerId: config.workerId, error: message })
    }).catch(() => {});
    await saveStatus("failed", message);
  } finally {
    clearInterval(heartbeat);
    await rm(temporary, { recursive: true, force: true });
  }
}

async function main() {
  await mkdir(runtimeDir, { recursive: true });
  const config = await readConfig();
  const health = await request(config, "/health");
  if (Number(health.protocolVersion) < 2) throw new Error("妙搭任务箱协议版本不兼容");
  await saveStatus("ready", config.gatewayUrl);
  while (!stopping) {
    try {
      const claimed = await request(config, "/worker/claim", {
        method: "POST",
        body: JSON.stringify({ workerId: config.workerId, leaseSeconds: 180 })
      });
      if (claimed.job) {
        await processJob(config, claimed.job);
        await saveStatus("ready", config.gatewayUrl);
      }
      else await new Promise((resolveWait) => setTimeout(resolveWait, pollMs));
    } catch (error) {
      await saveStatus("connection-error", error instanceof Error ? error.message : "连接失败");
      await new Promise((resolveWait) => setTimeout(resolveWait, Math.max(pollMs, 3e4)));
    }
  }
  await saveStatus("stopped");
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => { stopping = true; });
}

await main();
