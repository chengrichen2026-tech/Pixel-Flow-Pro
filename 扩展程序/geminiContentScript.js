// @ts-check
(() => {
  const GEMINI_ADAPTER_VERSION = 6;
  const scope = globalThis;
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  const taskKey = input => `${input.projectId}:${input.taskId}`;
  const activeTasks = scope.__pixelFlowGeminiActiveTasks ?? new Set();
  scope.__pixelFlowGeminiActiveTasks = activeTasks;

  class GeminiAdapterError extends Error {
    constructor(reason, message) {
      super(message);
      this.reason = reason;
    }
  }

  const conversationUrl = () => location.href.startsWith("https://gemini.google.com/app") ? location.href : "https://gemini.google.com/app";
  const pageMessage = message => chrome.runtime.sendMessage({ ...message, conversationUrl: conversationUrl(), browserProvider: "gemini" });

  function editor() {
    return [...document.querySelectorAll('.ql-editor[contenteditable="true"], rich-textarea div[contenteditable="true"][role="textbox"], div[contenteditable="true"][role="textbox"], textarea[aria-label*="Gemini" i]')]
      .find(target => target.isConnected && target.getClientRects().length > 0);
  }

  function sendButton() {
    const direct = document.querySelector('button[aria-label*="Send message" i], button[aria-label*="发送"], button.send-button, button[data-test-id="send-button"]');
    if (direct instanceof HTMLButtonElement) return direct;
    return [...document.querySelectorAll("button")].find(button => /^(send|发送)$/i.test(`${button.getAttribute("aria-label") || ""} ${button.textContent || ""}`.trim()) || button.querySelector('mat-icon[data-mat-icon-name="send"], mat-icon[fonticon="send"]'));
  }

  function stopButton() {
    return document.querySelector('button[aria-label*="Stop" i], button[aria-label*="停止"], button[data-test-id="stop-button"]');
  }

  function responseBlocks() {
    const selectors = ["model-response", '[data-test-id="model-response"]', ".model-response", "message-content"];
    for (const selector of selectors) {
      const blocks = [...document.querySelectorAll(selector)];
      if (blocks.length) return blocks;
    }
    return [];
  }

  function responseText(block) {
    if (!block) return "";
    const clone = block.cloneNode(true);
    clone.querySelectorAll("button, mat-icon, svg, style, script").forEach(node => node.remove());
    return (clone.innerText || clone.textContent || "").trim();
  }

  function generatedImages(block) {
    if (!block) return [];
    const candidates = [...block.querySelectorAll('img[alt*="generated" i], img[alt*="生成"], .generated-image img, img[src*="googleusercontent.com"]')];
    return [...new Map(candidates.filter(image => {
      const src = image.currentSrc || image.src || "";
      const marked = /generated|生成|ai/i.test(`${image.alt || ""} ${image.getAttribute("aria-label") || ""}`);
      const large = image.naturalWidth >= 256 && image.naturalHeight >= 256;
      return Boolean(src) && image.complete && large && (marked || src.includes("googleusercontent.com"));
    }).map(image => [image.currentSrc || image.src, image])).values()];
  }

  async function waitForEditor(timeoutMs = 30_000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const current = editor();
      if (current) return current;
      await sleep(250);
    }
    const signIn = document.querySelector('a[href*="accounts.google.com"], button[aria-label*="Sign in" i]');
    throw new GeminiAdapterError(signIn ? "login_required" : "selector_missing", signIn ? "请先登录 Gemini 后重试" : "找不到 Gemini 输入框，请刷新页面后重试");
  }

  const decodeBase64 = base64 => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  };

  function composerRoot() {
    return editor()?.closest('fieldset, input-area-v2, .input-area-container, [data-test-id="input-area"]') || document;
  }

  /**
   * @param {Element} input
   * @returns {input is HTMLInputElement}
   */
  function usableUploadInput(input) {
    if (!(input instanceof HTMLInputElement) || !input.isConnected || input.disabled || input.hasAttribute("capture") || input.hasAttribute("webkitdirectory")) return false;
    const accept = (input.accept || input.getAttribute("accept") || "").toLowerCase();
    return !accept || accept.includes("*/*") || /image\/|\.(?:png|jpe?g|webp|gif|avif|heic|heif)\b/i.test(accept);
  }

  function imageUploadInput(root = composerRoot()) {
    const local = [...root.querySelectorAll('input[type="file"]')];
    const global = root === document ? [] : [...document.querySelectorAll('input[type="file"]')];
    const candidates = [...new Set([...local, ...global])].filter(usableUploadInput);
    return candidates.sort((left, right) => {
      const leftAccept = (left.accept || left.getAttribute("accept") || "").toLowerCase();
      const rightAccept = (right.accept || right.getAttribute("accept") || "").toLowerCase();
      return Number(!/image\//i.test(leftAccept)) - Number(!/image\//i.test(rightAccept));
    })[0];
  }

  function attachmentPreviewCount(root = composerRoot()) {
    return Math.max(
      root.querySelectorAll("uploader-file-preview").length,
      root.querySelectorAll('file-preview, [data-test-id*="file-preview"], [data-test-id*="attachment-preview"]').length,
      root.querySelectorAll('button[aria-label*="Remove file" i], button[aria-label*="Remove attachment" i], button[aria-label*="删除文件"], button[aria-label*="移除文件"]').length
    );
  }

  function visibleUploadBusy(root = composerRoot()) {
    return [...root.querySelectorAll('[role="progressbar"], mat-progress-spinner, .upload-progress')]
      .some(node => node.isConnected && node.getClientRects().length > 0 && node.getAttribute("aria-hidden") !== "true");
  }

  async function findUploadInput() {
    for (let attempt = 0; attempt < 15; attempt += 1) {
      const input = imageUploadInput();
      if (input) return input;
      await sleep(100);
    }
    return undefined;
  }

  function dispatchCodePaste(file) {
    const target = editor();
    if (!target) return false;
    const transfer = new DataTransfer();
    transfer.items.add(file);
    target.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, composed: true, clipboardData: transfer }));
    return true;
  }

  function dispatchCodeDrop(file) {
    const target = editor();
    if (!target) return false;
    const transfer = new DataTransfer();
    transfer.items.add(file);
    for (const type of ["dragenter", "dragover", "drop"]) {
      target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, composed: true, dataTransfer: transfer }));
    }
    return true;
  }

  async function waitForUploadSignal(expectedPreviewCount, timeoutMs) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const root = composerRoot();
      if (attachmentPreviewCount(root) >= expectedPreviewCount || visibleUploadBusy(root)) return true;
      await sleep(100);
    }
    return false;
  }

  async function uploadImages(input, images) {
    if (!images?.length) return;
    await pageMessage({ type: "TASK_STATUS", projectId: input.projectId, taskId: input.taskId, status: "uploading" });
    const previewsBefore = attachmentPreviewCount();
    if (previewsBefore > 0) throw new GeminiAdapterError("upload_failed", "Gemini 输入区已有附件，已停止发送以避免混入上一次参考图");
    for (const [index, image] of images.entries()) {
      const file = new File([decodeBase64(image.base64)], image.name || `reference-${index + 1}.png`, { type: image.mimeType || "image/png" });
      const expectedPreviewCount = previewsBefore + index + 1;
      const fileInput = await findUploadInput();
      if (fileInput) {
        const transfer = new DataTransfer();
        transfer.items.add(file);
        fileInput.value = "";
        fileInput.files = transfer.files;
        fileInput.dispatchEvent(new Event("input", { bubbles: true }));
        fileInput.dispatchEvent(new Event("change", { bubbles: true }));
      } else {
        if (!dispatchCodePaste(file)) throw new GeminiAdapterError("selector_missing", `找不到 Gemini 第 ${index + 1} 张图片的代码上传目标`);
        if (!await waitForUploadSignal(expectedPreviewCount, 2_000)) dispatchCodeDrop(file);
      }
      const started = Date.now();
      while (Date.now() - started < 60_000) {
        const root = composerRoot();
        if (!visibleUploadBusy(root) && attachmentPreviewCount(root) >= expectedPreviewCount) break;
        await sleep(500);
      }
      const root = composerRoot();
      if (visibleUploadBusy(root) || attachmentPreviewCount(root) < expectedPreviewCount) {
        throw new GeminiAdapterError("upload_failed", `Gemini 第 ${index + 1} 张参考图上传超时`);
      }
    }
  }

  const normalizePromptText = value => String(value || "").replace(/\u00a0/g, " ").replace(/\r\n?/g, "\n").trim();

  function promptText(target) {
    return target instanceof HTMLTextAreaElement ? target.value : target.innerText || target.textContent || "";
  }

  function promptMatches(target, prompt) {
    return normalizePromptText(promptText(target)) === normalizePromptText(prompt);
  }

  async function setPrompt(target, prompt) {
    target.focus();
    if (target instanceof HTMLTextAreaElement) {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      setter?.call(target, prompt);
    } else {
      const selection = getSelection();
      const range = document.createRange();
      range.selectNodeContents(target);
      selection?.removeAllRanges();
      selection?.addRange(range);
      const inserted = document.execCommand("insertText", false, prompt);
      if (!inserted || !promptMatches(target, prompt)) {
        const paragraph = document.createElement("p");
        paragraph.textContent = prompt;
        target.replaceChildren(paragraph);
      }
    }
    target.dispatchEvent(new InputEvent("input", { bubbles: true, composed: true, inputType: "insertText", data: prompt }));
    target.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    const started = Date.now();
    while (Date.now() - started < 2_000) {
      if (promptMatches(target, prompt)) return;
      await sleep(100);
    }
    throw new GeminiAdapterError("prompt_input_failed", "Gemini 没有写入提示词，请刷新页面后重试");
  }

  async function waitForSendButton(target, prompt, timeoutMs = 5_000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const button = sendButton();
      if (promptMatches(target, prompt) && button && !button.disabled && button.getAttribute("aria-disabled") !== "true") return button;
      await sleep(100);
    }
    throw new GeminiAdapterError("selector_missing", "Gemini 没有识别已输入的提示词，请刷新标签页后重试");
  }

  async function imageToPayload(image) {
    const response = await fetch(image.currentSrc || image.src);
    if (!response.ok) throw new GeminiAdapterError("download_failed", `Gemini 图片下载失败：HTTP ${response.status}`);
    const blob = await response.blob();
    const buffer = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < buffer.length; offset += 0x8000) binary += String.fromCharCode(...buffer.subarray(offset, offset + 0x8000));
    return { base64: btoa(binary), mimeType: blob.type || "image/png" };
  }

  async function waitForResult(input, previousResponseCount, timeoutMs = 10 * 60_000) {
    const started = Date.now();
    let stableSource = "";
    let stableCount = 0;
    while (Date.now() - started < timeoutMs) {
      const blocks = responseBlocks();
      const latest = blocks.at(-1);
      const images = blocks.length >= previousResponseCount ? generatedImages(latest) : [];
      const signature = images.map(image => image.currentSrc || image.src).join("|");
      if (signature && signature === stableSource && !stopButton()) stableCount += 1;
      else stableCount = 0;
      stableSource = signature;
      if (images.length && stableCount >= 2) {
        return { images: await Promise.all(images.map(imageToPayload)), responseText: responseText(latest) };
      }
      const text = responseText(latest);
      if (blocks.length > previousResponseCount && !stopButton() && /无法.*(生成|图片)|can't.*generate|cannot.*generate|policy|政策/i.test(text)) {
        throw new GeminiAdapterError("content_policy", "Gemini 未生成图片：可能受到内容政策限制");
      }
      await sleep(750);
    }
    throw new GeminiAdapterError("timeout", "等待 Gemini 生图结果超时");
  }

  async function submitTask(input) {
    const key = taskKey(input);
    if (activeTasks.has(key)) return { accepted: true, duplicate: true };
    activeTasks.add(key);
    try {
      await pageMessage({ type: "TASK_STATUS", projectId: input.projectId, taskId: input.taskId, status: "waiting_page" });
      await waitForEditor();
      const previousResponseCount = responseBlocks().length;
      await uploadImages(input, input.images || []);
      await pageMessage({ type: "TASK_STATUS", projectId: input.projectId, taskId: input.taskId, status: "sending" });
      const promptEditor = await waitForEditor();
      const prompt = input.prompt || "";
      await setPrompt(promptEditor, prompt);
      const button = await waitForSendButton(promptEditor, prompt);
      button.click();
      await sleep(500);
      await pageMessage({ type: "TASK_STATUS", projectId: input.projectId, taskId: input.taskId, status: "generating" });
      const result = await waitForResult(input, previousResponseCount);
      await pageMessage({ type: "TASK_RESULT", projectId: input.projectId, taskId: input.taskId, ...result });
      return { accepted: true };
    } catch (error) {
      await pageMessage({
        type: "TASK_ERROR",
        projectId: input.projectId,
        taskId: input.taskId,
        reason: error instanceof GeminiAdapterError ? error.reason : "gemini_error",
        detail: error instanceof Error ? error.message : String(error)
      }).catch(() => {});
      return { accepted: false, error: error instanceof Error ? error.message : String(error) };
    } finally {
      activeTasks.delete(key);
    }
  }

  async function resumeTask(input) {
    const key = taskKey(input);
    if (activeTasks.has(key)) return { accepted: true, duplicate: true };
    activeTasks.add(key);
    try {
      const result = await waitForResult(input, 0);
      await pageMessage({ type: "TASK_RESULT", projectId: input.projectId, taskId: input.taskId, ...result, recovery: true });
      return { accepted: true };
    } catch (error) {
      await pageMessage({ type: "TASK_ERROR", projectId: input.projectId, taskId: input.taskId, reason: error instanceof GeminiAdapterError ? error.reason : "gemini_error", detail: error instanceof Error ? error.message : String(error), recovery: true }).catch(() => {});
      return { accepted: false, error: error instanceof Error ? error.message : String(error) };
    } finally {
      activeTasks.delete(key);
    }
  }

  const previous = scope.__pixelFlowGeminiMessageListener;
  if (previous) chrome.runtime.onMessage.removeListener(previous);
  const listener = (message, _sender, sendResponse) => {
    if (message?.type === "CHECK_GEMINI_ADAPTER") {
      sendResponse({ adapterVersion: GEMINI_ADAPTER_VERSION, submitActive: activeTasks.has(taskKey(message)), url: conversationUrl() });
      return false;
    }
    if (message?.type === "EXECUTE_IN_GEMINI") {
      void submitTask(message).then(sendResponse);
      return true;
    }
    if (message?.type === "RESUME_GEMINI_RESULT") {
      void resumeTask(message).then(sendResponse);
      return true;
    }
    return false;
  };
  scope.__pixelFlowGeminiMessageListener = listener;
  chrome.runtime.onMessage.addListener(listener);
})();
