#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { splitBase64 } from "./core.mjs";

const root = resolve(import.meta.dirname, "..");
const jobId = String(process.argv[2] || "").trim();
if (!/^[a-f0-9-]{36}$/.test(jobId)) throw new Error("请提供有效任务 ID");
const partnerPath = process.env.PIXEL_FLOW_MIAODA_PARTNER_CONFIG || resolve(root, "runtime", "team-partner-miaoda-config.json");
const workerPath = process.env.PIXEL_FLOW_MIAODA_CONFIG || resolve(root, "runtime", "miaoda-worker", "config.json");
const partner = JSON.parse(await readFile(partnerPath, "utf8"));
const worker = JSON.parse(await readFile(workerPath, "utf8"));
const baseUrl = String(partner.gatewayUrl || "").replace(/\/$/, "");
const sips = process.env.PIXEL_FLOW_MIAODA_SIPS || "/usr/bin/sips";

async function request(path, token, options = {}) {
  for (let attempt = 0; attempt < 7; attempt += 1) {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body ? { "Content-Type": "application/json" } : {})
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (response.ok) return payload;
    if (response.status === 429 && attempt < 6) {
      const retryAfter = Number(response.headers.get("Retry-After"));
      const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1e3 : Math.min(3e4, 2e3 * 2 ** attempt);
      await new Promise((resolveWait) => setTimeout(resolveWait, delay));
      continue;
    }
    throw new Error(payload.error || payload.message || `HTTP ${response.status}`);
  }
  throw new Error("任务箱请求失败");
}

function runProcess(command, args) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", rejectPromise);
    child.on("close", (code) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(stderr.trim() || `进程退出：${code}`));
    });
  });
}

const temporary = await mkdtemp(resolve(tmpdir(), "pixel-flow-preview-"));
try {
  const job = await request(`/jobs/${jobId}`, partner.token);
  const descriptor = job.images?.[0];
  if (!descriptor) throw new Error("任务没有可下载的原图结果");
  const chunks = [];
  for (let index = 0; index < descriptor.totalChunks; index += 1) {
    const chunk = await request(`/jobs/${jobId}/result-chunks/${descriptor.imageIndex}/${index}`, partner.token);
    chunks.push(chunk.base64);
    if (index + 1 < descriptor.totalChunks) await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  const outputPath = resolve(temporary, "result.png");
  const previewPath = resolve(temporary, "preview.jpg");
  await writeFile(outputPath, Buffer.from(chunks.join(""), "base64"), { mode: 0o600 });
  await runProcess(sips, ["-Z", "480", "-s", "format", "jpeg", "-s", "formatOptions", "70", outputPath, "--out", previewPath]);
  const previewChunks = splitBase64((await readFile(previewPath)).toString("base64"));
  for (let index = 0; index < previewChunks.length; index += 1) {
    await request(`/worker/jobs/${jobId}/preview-chunks`, worker.token, {
      method: "POST",
      body: JSON.stringify({
        workerId: worker.workerId,
        imageIndex: 0,
        chunkIndex: index,
        totalChunks: previewChunks.length,
        name: "preview-1.jpg",
        mimeType: "image/jpeg",
        base64: previewChunks[index]
      })
    });
  }
  const acknowledged = await request(`/jobs/${jobId}/acknowledge`, partner.token, { method: "POST" });
  process.stdout.write(`${JSON.stringify({ jobId, status: job.status, previewChunks: previewChunks.length, retained: acknowledged.retained, fullResultPurged: acknowledged.fullResultPurged })}\n`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
