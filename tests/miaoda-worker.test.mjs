import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { normalizeTaskboxUrl, sizeForRatio, splitBase64 } from "../miaoda-worker/core.mjs";

test("Miaoda worker normalizes URLs and splits base64 on safe boundaries", () => {
  assert.equal(normalizeTaskboxUrl("https://example.aiforce.cloud/openapi/"), "https://example.aiforce.cloud/openapi");
  assert.throws(() => normalizeTaskboxUrl("file:///tmp/taskbox"), /HTTP/);
  const value = "QUJD".repeat(40_000);
  const chunks = splitBase64(value);
  assert.equal(chunks.join(""), value);
  assert.ok(chunks.every((chunk) => chunk.length <= 60_000));
  assert.ok(chunks.every((chunk) => chunk.length % 4 === 0));
  assert.equal(sizeForRatio("16:9"), "1280x720");
});

test("Miaoda worker keeps OAuth local and uses lease, chunks, and cleanup", async () => {
  const worker = await readFile(new URL("../miaoda-worker/worker.mjs", import.meta.url), "utf8");
  const install = await readFile(new URL("../miaoda-worker/install.sh", import.meta.url), "utf8");
  const acceptance = await readFile(new URL("../miaoda-worker/acceptance.mjs", import.meta.url), "utf8");
  assert.match(worker, /PIXEL_FLOW_CODEX_IMAGE_SCRIPT/);
  assert.match(worker, /\/worker\/claim/);
  assert.match(worker, /\/heartbeat/);
  assert.match(worker, /\/result-chunks/);
  assert.match(worker, /await rm\(temporary, \{ recursive: true, force: true \}\)/);
  assert.doesNotMatch(worker, /\.codex\/auth\.json/);
  assert.match(install, /RunAtLoad/);
  assert.match(install, /KeepAlive/);
  assert.match(install, /Pixel Flow Miaoda Worker/);
  assert.match(install, /if ! launchctl bootstrap/);
  assert.match(acceptance, /\/result-chunks\//);
  assert.match(acceptance, /method: "DELETE"/);
});
