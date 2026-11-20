import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { readBackgroundSource } from "./helpers/background-source.mjs";

const root = new URL("../", import.meta.url);

test("Gemini web mode is packaged and dispatched through its own local adapter", async () => {
  const [background, content, manifestSource, build] = await Promise.all([
    readBackgroundSource(),
    readFile(new URL("public/geminiContentScript.js", root), "utf8"),
    readFile(new URL("public/manifest.json", root), "utf8"),
    readFile(new URL("scripts/build-extension.mjs", root), "utf8")
  ]);
  const manifest = JSON.parse(manifestSource);
  assert.match(background, /mode === "gemini" \? "gemini" : "chatgpt"/);
  assert.match(background, /sendWithCurrentGeminiAdapter/);
  assert.match(background, /type: provider === "gemini" \? "EXECUTE_IN_GEMINI" : "EXECUTE_IN_CHATGPT"/);
  assert.match(background, /type: provider === "gemini" \? "RESUME_GEMINI_RESULT" : "RESUME_CHATGPT_RESULT"/);
  assert.match(content, /GEMINI_ADAPTER_VERSION = 4/);
  assert.match(content, /input\[type="file"\]/);
  assert.match(content, /generatedImages\(latest\)/);
  assert.match(content, /naturalWidth >= 256/);
  assert.match(content, /document\.execCommand\("insertText", false, prompt\)/);
  assert.match(content, /async function waitForSendButton\(target, prompt, timeoutMs = 5_000\)/);
  assert.match(content, /button\.getAttribute\("aria-disabled"\) !== "true"/);
  assert.doesNotMatch(content, /Gemini 发送按钮不可用/);
  const submit = content.slice(content.indexOf("async function submitTask("), content.indexOf("async function resumeTask("));
  assert.ok(submit.indexOf("await uploadImages(input, input.images || [])") < submit.indexOf("const promptEditor = await waitForEditor()"));
  assert.match(content, /target\.isConnected && target\.getClientRects\(\)\.length > 0/);
  assert.match(content, /type: "TASK_RESULT"/);
  assert.ok(manifest.host_permissions.includes("https://gemini.google.com/*"));
  assert.ok(manifest.content_scripts.some(entry => entry.matches.includes("https://gemini.google.com/*") && entry.js.includes("geminiContentScript.js")));
  assert.match(build, /"geminiContentScript\.js"/);
});

test("Gemini reference uploads wait for current-composer previews and preserve the prompt", async () => {
  const content = await readFile(new URL("public/geminiContentScript.js", root), "utf8");
  assert.match(content, /editor\(\)\?\.closest\("fieldset"\) \|\| document/);
  assert.match(content, /input\[type="file"\]/);
  assert.match(content, /\/image\\\/\/i\.test\(input\.accept \|\| ""\)/);
  assert.match(content, /root\.querySelectorAll\("uploader-file-preview"\)\.length/);
  assert.match(content, /node\.getClientRects\(\)\.length > 0/);
  assert.match(content, /attachmentPreviewCount\(root\) >= previewsBefore \+ images\.length/);
  assert.match(content, /await setPrompt\(promptEditor, prompt\)/);
  assert.match(content, /promptMatches\(target, prompt\) && button/);
});

test("Gemini uses the same guarded local-web concurrency and persistent run mode", async () => {
  const background = await readBackgroundSource();
  assert.match(background, /const isLocalWebMode = \(mode\) => mode === "browser" \|\| mode === "gemini"/);
  assert.match(background, /normalizedGenerationMode = \(mode\)[\s\S]*mode === "gemini" \? "gemini" : "browser"/);
  assert.match(background, /if \(isLocalWebMode\(mode\) && browserRunning >= MAX_BROWSER_CONCURRENCY\)/);
  assert.match(background, /concreteBrowserConversationUrl\(runtime\.conversationUrl, provider\)/);
});
