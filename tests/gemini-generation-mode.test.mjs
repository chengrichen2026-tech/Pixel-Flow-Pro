import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
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
  assert.match(content, /GEMINI_ADAPTER_VERSION = 6/);
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
  assert.match(content, /editor\(\)\?\.closest\('fieldset, input-area-v2/);
  assert.match(content, /input\[type="file"\]/);
  assert.match(content, /!accept \|\| accept\.includes\("\*\/\*"\)/);
  assert.match(content, /root\.querySelectorAll\("uploader-file-preview"\)\.length/);
  assert.match(content, /node\.getClientRects\(\)\.length > 0/);
  assert.match(content, /for \(const \[index, image\] of images\.entries\(\)\)/);
  assert.match(content, /const fileInput = await findUploadInput\(\)/);
  assert.match(content, /fileInput\.dispatchEvent\(new Event\("input"/);
  assert.match(content, /new ClipboardEvent\("paste"/);
  assert.match(content, /new DragEvent\(type/);
  assert.match(content, /attachmentPreviewCount\(root\) >= expectedPreviewCount/);
  const resolver = content.slice(content.indexOf("async function findUploadInput("), content.indexOf("async function uploadImages("));
  assert.doesNotMatch(resolver, /\.click\(/);
  assert.match(content, /await setPrompt\(promptEditor, prompt\)/);
  assert.match(content, /promptMatches\(target, prompt\) && button/);
});

test("Gemini code upload accepts generic hidden inputs and re-resolves one input per image", async () => {
  const content = await readFile(new URL("public/geminiContentScript.js", root), "utf8");
  const section = content.slice(content.indexOf("const decodeBase64"), content.indexOf("const normalizePromptText"));
  let previewCount = 0;
  let inputQueries = 0;
  const uploaded = [];
  class FakeInput {
    constructor() {
      this.accept = "";
      this.isConnected = true;
      this.disabled = false;
      this.value = "occupied";
      this.files = [];
    }
    hasAttribute() { return false; }
    getAttribute() { return ""; }
    dispatchEvent(event) {
      if (event.type !== "change") return;
      uploaded.push(this.files.map(file => file.name));
      previewCount += 1;
      activeInput = new FakeInput();
    }
  }
  class FakeDataTransfer {
    constructor() {
      this.files = [];
      this.items = { add: file => this.files.push(file) };
    }
  }
  class FakeFile {
    constructor(_parts, name, options) { this.name = name; this.type = options.type; }
  }
  class FakeEvent {
    constructor(type) { this.type = type; }
  }
  let activeInput = new FakeInput();
  const composer = {
    querySelectorAll(selector) {
      if (selector === 'input[type="file"]') { inputQueries += 1; return [activeInput]; }
      if (selector === "uploader-file-preview") return Array.from({ length: previewCount }, () => ({}));
      return [];
    }
  };
  const document = { querySelectorAll: () => [] };
  const context = vm.createContext({
    atob,
    document,
    editor: () => ({ closest: () => composer }),
    HTMLInputElement: FakeInput,
    DataTransfer: FakeDataTransfer,
    File: FakeFile,
    Event: FakeEvent,
    GeminiAdapterError: class extends Error {},
    pageMessage: async () => {},
    sleep: async () => {}
  });
  vm.runInContext(`${section}\nthis.runUpload = uploadImages;`, context);
  await context.runUpload({ projectId: "p", taskId: "t" }, [
    { base64: "YQ==", name: "one.png", mimeType: "image/png" },
    { base64: "Yg==", name: "two.png", mimeType: "image/png" }
  ]);
  assert.deepEqual(uploaded, [["one.png"], ["two.png"]]);
  assert.ok(inputQueries >= 2, "each image resolves the current live file input");
});

test("Gemini code upload pastes files when the page has no mounted file input", async () => {
  const content = await readFile(new URL("public/geminiContentScript.js", root), "utf8");
  const section = content.slice(content.indexOf("const decodeBase64"), content.indexOf("const normalizePromptText"));
  let previewCount = 0;
  const events = [];
  class FakeInput {}
  class FakeDataTransfer {
    constructor() {
      this.files = [];
      this.items = { add: file => this.files.push(file) };
    }
  }
  class FakeFile {
    constructor(_parts, name, options) { this.name = name; this.type = options.type; }
  }
  class FakeEvent {
    constructor(type, init = {}) { this.type = type; Object.assign(this, init); }
  }
  const composer = {
    querySelectorAll(selector) {
      if (selector === "uploader-file-preview") return Array.from({ length: previewCount }, () => ({}));
      return [];
    }
  };
  const target = {
    closest: () => composer,
    dispatchEvent(event) {
      events.push(event.type);
      if (event.type === "paste") previewCount += event.clipboardData.files.length;
    }
  };
  const document = { querySelectorAll: () => [] };
  const context = vm.createContext({
    atob,
    document,
    editor: () => target,
    HTMLInputElement: FakeInput,
    DataTransfer: FakeDataTransfer,
    File: FakeFile,
    Event: FakeEvent,
    ClipboardEvent: FakeEvent,
    DragEvent: FakeEvent,
    GeminiAdapterError: class extends Error {},
    pageMessage: async () => {},
    sleep: async () => {}
  });
  vm.runInContext(`${section}\nthis.runUpload = uploadImages;`, context);
  await context.runUpload({ projectId: "p", taskId: "t" }, [
    { base64: "YQ==", name: "pasted.png", mimeType: "image/png" }
  ]);
  assert.deepEqual(events, ["paste"]);
  assert.equal(previewCount, 1);
});

test("Gemini uses the same guarded local-web concurrency and persistent run mode", async () => {
  const background = await readBackgroundSource();
  assert.match(background, /const isLocalWebMode = \(mode\) => mode === "browser" \|\| mode === "gemini"/);
  assert.match(background, /normalizedGenerationMode = \(mode\)[\s\S]*mode === "gemini" \? "gemini" : "browser"/);
  assert.match(background, /if \(isLocalWebMode\(mode\) && browserRunning >= MAX_BROWSER_CONCURRENCY\)/);
  assert.match(background, /concreteBrowserConversationUrl\(runtime\.conversationUrl, provider\)/);
});
