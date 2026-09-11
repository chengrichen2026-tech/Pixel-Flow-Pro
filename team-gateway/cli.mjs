#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createMemberToken, hashToken, normalizeDailyLimit } from "./core.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const configPath = process.env.PIXEL_FLOW_TEAM_CONFIG || resolve(root, "runtime", "team-gateway", "config.json");

async function load() {
  try { return JSON.parse(await readFile(configPath, "utf8")); }
  catch (error) { if (error?.code === "ENOENT") return { version: 1, members: [] }; throw error; }
}

async function save(config) {
  await mkdir(dirname(configPath), { recursive: true });
  const temporary = `${configPath}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, configPath);
}

const [command, action, rawName, ...rest] = process.argv.slice(2);
if (command === "init") {
  const config = await load();
  await save(config);
  console.log(`Initialized ${configPath}`);
} else if (command === "token" && action === "create") {
  const name = String(rawName || "").trim();
  if (!name) throw new Error("用法：npm run team-gateway:token -- create 成员名 [每日额度|unlimited]");
  const dailyLimit = normalizeDailyLimit(rest[0]);
  const config = await load();
  if (config.members.some((member) => member.name === name && member.active !== false)) throw new Error(`成员已存在：${name}`);
  const token = createMemberToken();
  const createdAt = Date.now();
  config.members.push({ id: randomUUID(), name, tokenHash: hashToken(token), dailyLimit, active: true, createdAt });
  await save(config);
  console.log(`Member: ${name}`);
  console.log(`Daily limit: ${dailyLimit === null ? "unlimited" : dailyLimit}`);
  const credentialOutput = String(process.env.PIXEL_FLOW_TEAM_CREDENTIAL_OUTPUT || "").trim();
  if (credentialOutput) {
    const outputPath = resolve(credentialOutput);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify({ gatewayUrl: String(process.env.PIXEL_FLOW_TEAM_GATEWAY_URL || "").trim(), memberName: name, dailyLimit, token, createdAt }, null, 2)}\n`, { mode: 0o600 });
    console.log(`Credentials saved: ${outputPath}`);
  } else {
    console.log(`Token (shown once): ${token}`);
  }
} else if (command === "token" && action === "revoke") {
  const name = String(rawName || "").trim();
  const config = await load();
  const member = config.members.find((entry) => entry.name === name && entry.active !== false);
  if (!member) throw new Error(`找不到有效成员：${name}`);
  member.active = false;
  member.revokedAt = Date.now();
  await save(config);
  console.log(`Revoked: ${name}`);
} else if (command === "members") {
  const config = await load();
  console.log(JSON.stringify(config.members.map(({ tokenHash, ...member }) => member), null, 2));
} else {
  console.log("Commands:");
  console.log("  init");
  console.log("  token create <name> [dailyLimit|unlimited]");
  console.log("  token revoke <name>");
  console.log("  members");
}
