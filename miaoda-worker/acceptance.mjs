#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const partnerPath = process.env.PIXEL_FLOW_MIAODA_PARTNER_CONFIG || resolve(root, "runtime", "team-partner-miaoda-config.json");
const outputPath = process.env.PIXEL_FLOW_MIAODA_ACCEPTANCE_OUTPUT || resolve(root, "artifacts", "miaoda-worker-acceptance.png");
const partner = JSON.parse(await readFile(partnerPath, "utf8"));
const baseUrl = String(partner.gatewayUrl || "").replace(/\/$/, "");
const token = String(partner.token || "");
if (!baseUrl || !token) throw new Error("伙伴凭证不完整");

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || payload.message || `HTTP ${response.status}`);
  return payload;
}

const created = await request("/jobs", {
  method: "POST",
  body: JSON.stringify({
    requestId: `real-acceptance:${Date.now()}`,
    prompt: "生成一张简洁的验收图片：纯白背景，中央一个紫色圆形，画面无文字，1:1 构图。",
    ratio: "1:1",
    imageCount: 0
  })
});
process.stdout.write(`submitted ${created.id}\n`);

let job = created;
let lastStatus = "";
for (let attempt = 0; attempt < 210; attempt += 1) {
  job = await request(`/jobs/${created.id}`);
  if (job.status !== lastStatus) {
    lastStatus = job.status;
    process.stdout.write(`status ${job.status}\n`);
  }
  if (job.status === "completed" || job.status === "failed") break;
  await new Promise((resolveWait) => setTimeout(resolveWait, 3e3));
}
if (job.status !== "completed") throw new Error(job.error || `任务未完成：${job.status}`);

const descriptor = job.images?.[0];
if (!descriptor) throw new Error("任务完成但没有结果图描述");
const chunks = [];
for (let chunkIndex = 0; chunkIndex < descriptor.totalChunks; chunkIndex += 1) {
  const chunk = await request(`/jobs/${created.id}/result-chunks/${descriptor.imageIndex}/${chunkIndex}`);
  chunks.push(chunk.base64);
}
const output = Buffer.from(chunks.join(""), "base64");
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, output);
await request(`/jobs/${created.id}`, { method: "DELETE" });
process.stdout.write(`completed ${output.length} bytes ${outputPath}\n`);
