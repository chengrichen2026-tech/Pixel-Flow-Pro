import assert from "node:assert/strict";
import test from "node:test";

import { base64ToBytes, bytesToBase64, decodeBase64, sha256Hex } from "../src/background/binary.ts";
import { KeyedSerialQueue } from "../src/background/keyed-serial-queue.ts";
import { concreteChatGptConversationUrl, expectedChatGptConversationMatches, resolveTaskConversationUrl } from "../src/background/chatgpt-url.ts";
import { isExtensionMessage } from "../src/background/protocol.ts";
import { ConversationUnavailableError, TabRegistry } from "../src/background/tab-registry.ts";

test("background binary helpers round-trip payloads and preserve digests", async () => {
  const source = new TextEncoder().encode("Pixel Flow");
  const base64 = bytesToBase64(source.buffer);
  assert.deepEqual([...base64ToBytes(base64)], [...source]);
  assert.equal(await decodeBase64(base64, "text/plain").text(), "Pixel Flow");
  assert.equal(await sha256Hex(source.buffer), "d8c8b25a281ba3f76b381a787ff809b75c28288b3043c8e83ddbade5d9546be2");
});

test("keyed writes serialize the same key without blocking independent keys", async () => {
  const queue = new KeyedSerialQueue();
  const events = [];
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const first = queue.run("project", async () => { events.push("first:start"); await gate; events.push("first:end"); });
  const second = queue.run("project", async () => { events.push("second"); });
  await queue.run("other", async () => { events.push("other"); });
  assert.deepEqual(events, ["first:start", "other"]);
  release();
  await Promise.all([first, second]);
  assert.deepEqual(events, ["first:start", "other", "first:end", "second"]);
});

test("ChatGPT URL helpers preserve only concrete matching conversations", () => {
  assert.equal(concreteChatGptConversationUrl("https://chatgpt.com/c/abc/"), "https://chatgpt.com/c/abc/");
  assert.equal(concreteChatGptConversationUrl("https://chatgpt.com/"), undefined);
  assert.equal(expectedChatGptConversationMatches("https://chatgpt.com/c/abc/", "https://chatgpt.com/c/abc"), true);
  assert.equal(resolveTaskConversationUrl({ type: "TASK_STATUS", conversationUrl: "https://chatgpt.com/c/a" }, "https://chatgpt.com/c/b"), "https://chatgpt.com/c/a");
  assert.equal(resolveTaskConversationUrl({ type: "TASK_ERROR", reason: "conversation_unavailable" }, "https://chatgpt.com/c/b"), undefined);
});

test("extension protocol rejects incomplete task messages", () => {
  assert.equal(isExtensionMessage({ type: "RUN_TASK", projectId: "p", taskId: "t" }), true);
  assert.equal(isExtensionMessage({ type: "RUN_TASKS", projectId: "p", taskIds: ["a", "b"] }), true);
  assert.equal(isExtensionMessage({ type: "RUN_TASKS", projectId: "p", taskIds: [] }), false);
  assert.equal(isExtensionMessage({ type: "RUN_TASK", projectId: "p" }), false);
  assert.equal(isExtensionMessage({ type: "HIBERNATE_TASK_TABS", projectId: "p", taskIds: ["t"] }), true);
  assert.equal(isExtensionMessage({ type: "TASK_RESULT", projectId: "p", taskId: "t", images: [] }), true);
  assert.equal(isExtensionMessage({ type: "TASK_RESULT", projectId: "p", taskId: "t", images: [{ base64: "aGVsbG8=", mimeType: "image/png" }] }), true);
  assert.equal(isExtensionMessage({ type: "TASK_RESULT", projectId: "p", taskId: "t", images: [{}] }), false);
  assert.equal(isExtensionMessage({ type: "TASK_RESULT", projectId: "p", taskId: "t" }), false);
  assert.equal(isExtensionMessage({ type: "TASK_STATUS", projectId: "p", taskId: "t", status: "generating" }), true);
  assert.equal(isExtensionMessage({ type: "TASK_STATUS", projectId: "p", taskId: "t", status: "mystery" }), false);
  assert.equal(isExtensionMessage({ type: "DOWNLOAD_ASSET", projectId: "p", taskId: "t", assetId: "a" }), true);
  assert.equal(isExtensionMessage({ type: "DOWNLOAD_ASSET", projectId: "p", taskId: "t" }), false);
  assert.equal(isExtensionMessage({ type: "SHOW_NOTIFICATION", projectId: "p", taskId: "t", title: "done", message: "ok" }), true);
  assert.equal(isExtensionMessage({ type: "SHOW_NOTIFICATION", projectId: "p", taskId: "t", title: "done" }), false);
  assert.equal(isExtensionMessage({ type: "unknown", projectId: "p", taskId: "t" }), false);
});

test("tab registry owns, validates, hibernates, and rejects switched conversations", async () => {
  const records = new Map();
  let nextId = 1;
  const grouped = [];
  const tabs = {
    async create({ url }) { const tab = { id: nextId++, url, windowId: 1 }; records.set(tab.id, tab); return tab; },
    async get(id) { const tab = records.get(id); if (!tab) throw new Error("missing"); return tab; },
    async query() { return [...records.values()]; },
    async update(id, patch) { Object.assign(records.get(id), patch); return records.get(id); },
    async remove(ids) { for (const id of Array.isArray(ids) ? ids : [ids]) records.delete(id); },
  };
  const registry = new TabRegistry(tabs, { async group(id) { grouped.push(id); }, async managedTabs() { return [...records.values()]; } });
  const created = await registry.ensure("task-a", "https://chatgpt.com/c/a");
  assert.equal(registry.ownsTab("task-a", created.tabId), true);
  assert.deepEqual(grouped, [created.tabId]);
  records.get(created.tabId).url = "https://chatgpt.com/c/other";
  await assert.rejects(registry.assertExpected(created.tabId, "https://chatgpt.com/c/a"), ConversationUnavailableError);
  assert.equal(await registry.hibernate("task-a"), true);
  assert.equal(records.size, 0);
});
