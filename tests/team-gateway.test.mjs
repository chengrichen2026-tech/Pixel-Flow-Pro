import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createMemberToken, hashToken, normalizeDailyLimit, normalizeGatewayUrl, sizeForRatio, tokenMatches, validateJobInput } from "../team-gateway/core.mjs";

const serverSource = await readFile(new URL("../team-gateway/server.mjs", import.meta.url), "utf8");
const manifest = JSON.parse(await readFile(new URL("../public/manifest.json", import.meta.url), "utf8"));

test("team gateway validates tokens, URLs, ratios and job inputs", () => {
  const token = createMemberToken();
  assert.match(token, /^pft_[A-Za-z0-9_-]+$/);
  assert.equal(tokenMatches(token, hashToken(token)), true);
  assert.equal(tokenMatches(`${token}x`, hashToken(token)), false);
  assert.equal(normalizeGatewayUrl("https://pixel.example.ts.net/"), "https://pixel.example.ts.net");
  assert.throws(() => normalizeGatewayUrl("file:///tmp/gateway"), /HTTP/);
  assert.equal(sizeForRatio("9:16"), "720x1280");
  assert.equal(normalizeDailyLimit("unlimited"), null);
  assert.equal(normalizeDailyLimit("不限"), null);
  assert.equal(normalizeDailyLimit("25"), 25);
  assert.throws(() => normalizeDailyLimit("invalid"), /每日额度/);
  assert.equal(validateJobInput({ requestId: "request-123", prompt: "cat", images: [] }).prompt, "cat");
  assert.throws(() => validateJobInput({ requestId: "short", prompt: "cat" }), /requestId/);
});

test("team gateway keeps Codex OAuth on the server and runs one queued job", async (t) => {
  assert.match(serverSource, /PIXEL_FLOW_CODEX_IMAGE_SCRIPT/);
  assert.match(serverSource, /let running = false/);
  assert.match(serverSource, /dailyLimit !== null && usageToday\(member\.id\) >= dailyLimit/);
  assert.match(serverSource, /status: "failed", error: "团队网关曾重启；为避免重复消耗额度，未自动重试"/);
  assert.ok(manifest.optional_host_permissions.includes("https://*/*"));
  assert.ok(manifest.host_permissions.includes("https://*.trycloudflare.com/*"));
  assert.ok(manifest.host_permissions.includes("http://127.0.0.1:43130/*"));
  const temporary = await mkdtemp(join(tmpdir(), "pixel-flow-team-test-"));
  const configPath = join(temporary, "config.json");
  const token = ["pft", "test", "member", "token", "123456"].join("_");
  await writeFile(configPath, JSON.stringify({ version: 1, members: [{ id: "member-1", name: "tester", tokenHash: hashToken(token), dailyLimit: 1, active: true }] }));
  const port = await new Promise((resolvePort) => {
    const probe = createServer();
    probe.listen(0, "127.0.0.1", () => { const address = probe.address(); probe.close(() => resolvePort(address.port)); });
  });
  const child = spawn(process.execPath, [fileURLToPath(new URL("../team-gateway/server.mjs", import.meta.url))], {
    env: {
      ...process.env,
      PIXEL_FLOW_TEAM_PORT: String(port),
      PIXEL_FLOW_TEAM_CONFIG: configPath,
      PIXEL_FLOW_TEAM_RUNTIME_DIR: join(temporary, "runtime"),
      PIXEL_FLOW_TEAM_PYTHON: process.execPath,
      PIXEL_FLOW_CODEX_IMAGE_SCRIPT: fileURLToPath(new URL("fixtures/fake-codex-image.mjs", import.meta.url))
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  t.after(async () => { child.kill("SIGTERM"); await rm(temporary, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { if ((await fetch(`${base}/health`)).ok) break; } catch {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 20));
  }
  const unauthorized = await fetch(`${base}/me`);
  assert.equal(unauthorized.status, 401);
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const submitted = await fetch(`${base}/jobs`, { method: "POST", headers, body: JSON.stringify({ requestId: "request-integration-1", prompt: "test image", ratio: "1:1", images: [] }) });
  assert.equal(submitted.status, 202);
  let job = await submitted.json();
  for (let attempt = 0; attempt < 100 && job.status !== "completed"; attempt += 1) {
    await new Promise((resolveWait) => setTimeout(resolveWait, 20));
    job = await fetch(`${base}/jobs/${job.id}`, { headers }).then((response) => response.json());
  }
  assert.equal(job.status, "completed");
  assert.match(job.images[0].base64, /^[A-Za-z0-9+/]+=*$/);
  const duplicate = await fetch(`${base}/jobs`, { method: "POST", headers, body: JSON.stringify({ requestId: "request-integration-1", prompt: "test image", images: [] }) });
  assert.equal(duplicate.status, 200);
  assert.equal((await duplicate.json()).id, job.id);
  const limited = await fetch(`${base}/jobs`, { method: "POST", headers, body: JSON.stringify({ requestId: "request-integration-2", prompt: "another image", images: [] }) });
  assert.equal(limited.status, 429);
  assert.equal((await fetch(`${base}/jobs/${job.id}`, { method: "DELETE", headers })).status, 200);
  const stillLimited = await fetch(`${base}/jobs`, { method: "POST", headers, body: JSON.stringify({ requestId: "request-integration-3", prompt: "third image", images: [] }) });
  assert.equal(stillLimited.status, 429);
});

test("token CLI can save one-time credentials without printing the token", async (t) => {
  const temporary = await mkdtemp(join(tmpdir(), "pixel-flow-token-test-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const configPath = join(temporary, "config.json");
  const outputPath = join(temporary, "credentials.json");
  const child = spawn(process.execPath, [fileURLToPath(new URL("../team-gateway/cli.mjs", import.meta.url)), "token", "create", "partner", "unlimited"], {
    env: { ...process.env, PIXEL_FLOW_TEAM_CONFIG: configPath, PIXEL_FLOW_TEAM_CREDENTIAL_OUTPUT: outputPath, PIXEL_FLOW_TEAM_GATEWAY_URL: "https://example.trycloudflare.com" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stdout = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  const code = await new Promise((resolveCode, rejectCode) => { child.on("error", rejectCode); child.on("close", resolveCode); });
  assert.equal(code, 0);
  assert.doesNotMatch(stdout, /Token \(shown once\)/);
  const credentials = JSON.parse(await readFile(outputPath, "utf8"));
  assert.equal(credentials.gatewayUrl, "https://example.trycloudflare.com");
  assert.equal(credentials.dailyLimit, null);
  assert.match(credentials.token, /^pft_/);
  if (process.platform !== "win32") {
    assert.equal((await stat(outputPath)).mode & 0o777, 0o600);
  }
});
