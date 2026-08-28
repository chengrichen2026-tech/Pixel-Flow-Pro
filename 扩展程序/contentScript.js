"use strict";
(() => {
  // src/shared/protocol.ts
  var CHATGPT_ADAPTER_VERSION = 23;
  var taskTypes = /* @__PURE__ */ new Set([
    "RUN_TASK",
    "CANCEL_TASK",
    "OPEN_TASK_TAB",
    "CLOSE_TASK_TAB",
    "HIBERNATE_TASK_TABS",
    "TASK_STATUS",
    "TASK_RESULT",
    "TASK_ERROR",
    "DOWNLOAD_ASSET",
    "SHOW_NOTIFICATION",
    "CHECK_CHATGPT_ADAPTER",
    "RESUME_CHATGPT_RESULT",
    "EXECUTE_IN_CHATGPT",
    "EXECUTE_IN_CHATGPT_V2",
    "EXECUTE_IN_CHATGPT_V3"
  ]);
  function isExtensionMessage(value) {
    if (!value || typeof value !== "object") return false;
    const message = value;
    if (message.type === "HIBERNATE_TASK_TABS") {
      return typeof message.projectId === "string" && Array.isArray(message.taskIds) && message.taskIds.every((taskId) => typeof taskId === "string");
    }
    return typeof message.type === "string" && taskTypes.has(message.type) && typeof message.projectId === "string" && typeof message.taskId === "string";
  }

  // src/shared/chatgptUrl.ts
  function safeChatGptUrl(url) {
    return url?.startsWith("https://chatgpt.com/") ? url : "https://chatgpt.com/";
  }
  function comparableChatGptUrl(url) {
    const parsed = new URL(safeChatGptUrl(url));
    const pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    return `${parsed.origin}${pathname}`;
  }
  function expectedChatGptConversationMatches(actualUrl, expectedUrl) {
    return actualUrl?.startsWith("https://chatgpt.com/") === true && comparableChatGptUrl(actualUrl) === comparableChatGptUrl(expectedUrl);
  }

  // src/chatgpt/adapter.ts
  var assistantSelector = '[data-message-author-role="assistant"], [data-turn="assistant"]';
  var userSelector = '[data-message-author-role="user"], [data-turn="user"]';
  var stopSelector = '[data-testid="stop-button"], button[aria-label*="Stop" i], button[aria-label*="\u505C\u6B62"]';
  function assistantTurns() {
    return [...document.querySelectorAll(assistantSelector)].filter((turn) => !turn.parentElement?.closest(assistantSelector));
  }
  var AdapterError = class extends Error {
    constructor(reason, message) {
      super(message);
      this.reason = reason;
      this.name = "AdapterError";
    }
  };
  function pageText() {
    return document.body?.innerText || document.body?.textContent || "";
  }
  function findComposer() {
    return document.querySelector(
      '#prompt-textarea, [data-testid="composer-input"], textarea[placeholder*="Message" i], textarea[placeholder*="\u53D1\u9001"], [contenteditable="true"][role="textbox"]'
    );
  }
  function findSendButton() {
    return document.querySelector(
      '[data-testid="send-button"], button[aria-label*="Send" i], button[aria-label*="\u53D1\u9001"]'
    );
  }
  function findComposerRegion() {
    const composer = findComposer();
    return composer?.closest('form, [data-testid="composer"], [data-type="unified-composer"]') ?? composer?.parentElement;
  }
  function findUploadInput() {
    const region = findComposerRegion();
    const knownSelectors = [
      "#upload-files",
      '[data-testid="upload-photos-input"]'
    ];
    if (region) {
      for (const selector of knownSelectors) {
        const input = region.querySelector(selector);
        if (input && !input.disabled) return input;
      }
      const regionalFallback = region.querySelector('input[type="file"][accept*="image"]:not([capture]), input[type="file"]:not([capture])');
      if (regionalFallback && !regionalFallback.disabled) return regionalFallback;
    }
    for (const selector of knownSelectors) {
      const candidates = [...document.querySelectorAll(selector)];
      const input = candidates.find((candidate) => candidate.closest('form, [data-testid="composer"], [data-type="unified-composer"]')) ?? candidates.at(-1);
      if (input && !input.disabled) return input;
    }
    if (!region) return void 0;
    const fallbackSelectors = [
      'input[type="file"][accept*="image"]:not([capture])',
      'input[type="file"]:not([capture])'
    ];
    for (const selector of fallbackSelectors) {
      const input = region.querySelector(selector);
      if (input && !input.disabled) return input;
    }
    return void 0;
  }
  function findAttachmentButton() {
    const direct = document.querySelector(
      '#composer-plus-btn, [data-testid="composer-plus-btn"], button[aria-label*="Attach" i], button[aria-label*="Upload" i], button[aria-label*="\u6DFB\u52A0\u6587\u4EF6"], button[aria-label*="\u4E0A\u4F20\u6587\u4EF6"]'
    );
    if (direct) return direct;
    return [...document.querySelectorAll("button")].find(
      (button) => /添加文件|上传文件|attach|upload/i.test((button.getAttribute("aria-label") || button.textContent || "").trim())
    );
  }
  function countComposerAttachments() {
    const region = findComposerRegion();
    if (!region) return 0;
    const removeButtons = region.querySelectorAll([
      'button[aria-label*="Remove file" i]',
      'button[aria-label*="Remove attachment" i]',
      'button[aria-label*="\u79FB\u9664\u6587\u4EF6"]',
      'button[aria-label*="\u5220\u9664\u6587\u4EF6"]',
      'button[aria-label*="\u79FB\u9664\u9644\u4EF6"]',
      'button[aria-label*="\u5220\u9664\u9644\u4EF6"]'
    ].join(","));
    if (removeButtons.length > 0) return removeButtons.length;
    const previews = region.querySelectorAll([
      '[data-testid="composer-attachment"]',
      '[data-testid="attachment-preview"]',
      '[data-testid="file-thumbnail"]',
      '[data-testid^="file-thumbnail-"]',
      '[data-testid="composer-file"]',
      '[data-composer-grid] [role="group"][aria-label]',
      'button[aria-label^="打开图片："]',
      'button[aria-label^="Open image:"]'
    ].join(","));
    if (previews.length > 0) return previews.length;
    return 0;
  }
  function composerIsUploading() {
    const region = findComposerRegion();
    return Boolean(region?.querySelector([
      '[data-testid*="upload-progress"]',
      '[data-testid*="attachment-loading"]',
      '[data-testid*="file-upload"] [role="progressbar"]',
      '[data-composer-grid] [role="progressbar"]',
      '[data-composer-grid] [aria-busy="true"]',
      '[data-composer-grid] [data-state="loading"]',
      '[data-composer-grid] [data-state="uploading"]',
      '[aria-label*="Uploading" i]',
      '[aria-label*="\u6B63\u5728\u4E0A\u4F20"]'
    ].join(",")));
  }
  function composerAttachmentSignature() {
    const region = findComposerRegion();
    if (!region) return "";
    const removeButtons = [...region.querySelectorAll([
      'button[aria-label*="Remove file" i]',
      'button[aria-label*="Remove attachment" i]',
      'button[aria-label*="\u79FB\u9664\u6587\u4EF6"]',
      'button[aria-label*="\u5220\u9664\u6587\u4EF6"]',
      'button[aria-label*="\u79FB\u9664\u9644\u4EF6"]',
      'button[aria-label*="\u5220\u9664\u9644\u4EF6"]'
    ].join(","))];
    if (removeButtons.length > 0) {
      return removeButtons.map((button) => button.getAttribute("aria-label") || button.textContent || "attachment").join("||");
    }
    const cards = [...region.querySelectorAll([
      '[data-testid="composer-attachment"]',
      '[data-testid="attachment-preview"]',
      '[data-testid="file-thumbnail"]',
      '[data-testid^="file-thumbnail-"]',
      '[data-testid="composer-file"]',
      '[data-composer-grid] [role="group"][aria-label]',
      'button[aria-label^="\u6253\u5F00\u56FE\u7247\uFF1A"]',
      'button[aria-label^="Open image:"]'
    ].join(","))];
    return cards.map((card) => {
      const image = card.querySelector("img");
      return [
        card.getAttribute("aria-label") || "",
        card.getAttribute("data-state") || "",
        image?.currentSrc || image?.getAttribute("src") || ""
      ].join("|");
    }).join("||");
  }
  async function waitForStableComposerAttachments(expectedCount, imageNumber) {
    const startedAt = Date.now();
    let stableSince = 0;
    let previousSignature = "";
    let lastBackgroundWake = 0;
    while (Date.now() - startedAt <= 6e4) {
      const attachmentCount = countComposerAttachments();
      const signature = composerAttachmentSignature();
      const ready = attachmentCount === expectedCount && !composerIsUploading() && Boolean(signature);
      if (ready && signature === previousSignature) {
        stableSince ||= Date.now();
        if (Date.now() - stableSince >= 3e3) return;
      } else {
        stableSince = 0;
      }
      previousSignature = signature;
      if (document.hidden && Date.now() - lastBackgroundWake > 1500) {
        lastBackgroundWake = Date.now();
        signalBackgroundPageActivity();
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new AdapterError("upload_failed", `第 ${imageNumber} 张参考图没有完成上传稳定，已停止发送提示词`);
  }
  function inspectPage() {
    const text = pageText();
    const loginButton = [...document.querySelectorAll("button")].some((button) => /^(登录|log\s*in)$/i.test((button.innerText || button.textContent || "").trim()));
    if (loginButton || document.querySelector('a[href*="/auth/login"], button[data-testid="login-button"]')) {
      return { ready: false, reason: "login_required" };
    }
    if (/验证码|安全检查|verify you are human|captcha|checking your browser/i.test(text)) {
      return { ready: false, reason: "verification_required" };
    }
    if (/usage limit|reached.*limit|使用上限|达到.*限制|try again later/i.test(text)) {
      return { ready: false, reason: "usage_limited" };
    }
    const composer = findComposer();
    if (!composer) return { ready: false, reason: "selector_missing" };
    return {
      ready: true,
      composer,
      fileInput: findUploadInput()
    };
  }
  function assertExpectedConversation(expectedConversationUrl) {
    if (!expectedChatGptConversationMatches(location.href, expectedConversationUrl)) {
      throw new AdapterError("conversation_unavailable", "\u7B49\u5F85\u671F\u95F4\u6807\u7B7E\u9875\u5207\u6362\u5230\u4E86\u5176\u4ED6 ChatGPT \u5BF9\u8BDD");
    }
  }
  function normalizeTurnText(text) {
    return text.replace(/\s+/g, " ").trim();
  }
  function normalizeComparableTurnText(text) {
    return normalizeTurnText(text).replace(/```[a-z0-9_-]*|```/gi, " ").replace(/`([^`]*)`/g, "$1").replace(/(^|\s)#{1,6}\s+/g, "$1").replace(/\s+/g, " ").trim();
  }
  function normalizeSemanticTurnText(text) {
    return normalizeComparableTurnText(text).replace(/[^\p{L}\p{N}]+/gu, "");
  }
  function submittedTurnIsStillVisible(previousUserTurnCount, prompt) {
    const turns = [...document.querySelectorAll(userSelector)];
    if (turns.length <= previousUserTurnCount) return false;
    const submittedText = normalizeSemanticTurnText(prompt);
    if (!submittedText) return true;
    const latestText = normalizeSemanticTurnText(turns.at(-1)?.innerText || turns.at(-1)?.textContent || "");
    if (latestText.includes(submittedText)) return true;
    if (submittedText.length < 160) return false;
    return latestText.includes(submittedText.slice(0, 80)) && latestText.includes(submittedText.slice(-80));
  }
  function createCompletionConversationCheck(expectedConversationUrl, previousUserTurnCount, prompt) {
    let lockedConversationUrl = expectedConversationUrl;
    let pendingConversationUrl;
    let pendingConversationStartedAt = 0;
    let continuityChecks = 0;
    return () => {
      try {
        const current = new URL(location.href);
        if (current.origin === "https://chatgpt.com" && /^\/c\/[^/]+\/?$/.test(current.pathname) && submittedTurnIsStillVisible(previousUserTurnCount, prompt)) {
          lockedConversationUrl = `${current.origin}${current.pathname}`;
          pendingConversationUrl = void 0;
          pendingConversationStartedAt = 0;
          continuityChecks = 0;
          return true;
        }
      } catch {
      }
      if (lockedConversationUrl) {
        if (expectedChatGptConversationMatches(location.href, lockedConversationUrl)) {
          pendingConversationUrl = void 0;
          pendingConversationStartedAt = 0;
          continuityChecks = 0;
          return true;
        }
        if (!location.href.startsWith("https://chatgpt.com/")) {
          throw new AdapterError("conversation_unavailable", "\u7B49\u5F85\u671F\u95F4\u6807\u7B7E\u9875\u5207\u6362\u5230\u4E86\u5176\u4ED6 ChatGPT \u5BF9\u8BDD");
        }
        if (pendingConversationUrl !== location.href) {
          pendingConversationUrl = location.href;
          pendingConversationStartedAt = Date.now();
          continuityChecks = 0;
        }
        if (!submittedTurnIsStillVisible(previousUserTurnCount, prompt)) {
          if (Date.now() - pendingConversationStartedAt <= 15e3) return false;
          throw new AdapterError("conversation_unavailable", "\u7B49\u5F85\u671F\u95F4\u6807\u7B7E\u9875\u5207\u6362\u5230\u4E86\u5176\u4ED6 ChatGPT \u5BF9\u8BDD");
        }
        if (pendingConversationUrl === location.href) {
          continuityChecks += 1;
        }
        if (continuityChecks >= 3) {
          lockedConversationUrl = location.href;
          pendingConversationUrl = void 0;
          pendingConversationStartedAt = 0;
          continuityChecks = 0;
          return true;
        }
        return false;
      }
      if (expectedChatGptConversationMatches(location.href, void 0)) return true;
      try {
        const current = new URL(location.href);
        if (current.origin === "https://chatgpt.com" && /^\/c\/[^/]+\/?$/.test(current.pathname)) {
          lockedConversationUrl = `${current.origin}${current.pathname}`;
          return true;
        }
      } catch {
      }
      throw new AdapterError("conversation_unavailable", "\u7B49\u5F85\u671F\u95F4\u6807\u7B7E\u9875\u5207\u6362\u5230\u4E86\u5176\u4ED6 ChatGPT \u5BF9\u8BDD");
    };
  }
  function isTemporaryRetryError(turn) {
    const text = normalizeTurnText(turn?.innerText || turn?.textContent || "");
    return /出了点问题/.test(text) && /重试/.test(text) || /something went wrong/i.test(text) && /try again/i.test(text);
  }
  function findTemporaryRetryButton() {
    return [...document.querySelectorAll("button")].find((button) => {
      const label = normalizeTurnText(button.innerText || button.textContent || button.getAttribute("aria-label") || "");
      if (!/^(?:重试|try again)$/i.test(label)) return false;
      const regionText = normalizeTurnText(button.parentElement?.innerText || button.parentElement?.textContent || "");
      return /出了点问题/.test(regionText) || /something went wrong/i.test(regionText);
    });
  }
  async function waitForReadyPage(expectedConversationUrl, timeoutMs = 3e4) {
    const started = Date.now();
    assertExpectedConversation(expectedConversationUrl);
    let page = inspectPage();
    while (!page.ready && page.reason === "selector_missing") {
      if (Date.now() - started > timeoutMs) {
        throw new AdapterError("selector_missing", "\u7B49\u5F85 30 \u79D2\u540E\u4ECD\u672A\u627E\u5230 ChatGPT \u8F93\u5165\u533A");
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
      assertExpectedConversation(expectedConversationUrl);
      page = inspectPage();
    }
    if (!page.ready) {
      throw new AdapterError(page.reason, `ChatGPT \u9875\u9762\u672A\u5C31\u7EEA\uFF1A${page.reason}`);
    }
    return page;
  }
  function setComposerText(composer, text) {
    composer.focus();
    if (composer instanceof HTMLTextAreaElement || composer instanceof HTMLInputElement) {
      const prototype = composer instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
      setter?.call(composer, text);
    } else {
      composer.textContent = text;
    }
    composer.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
    composer.dispatchEvent(new Event("change", { bubbles: true }));
  }
  function generatedImageSource(image) {
    const src = image.currentSrc || image.src;
    if (!src) return false;
    if (/files\.oaiusercontent\.com|oaidalleapiprodscus|backend-api\/(?:files|estuary\/content)|\/file-[^/]+/i.test(src)) return true;
    if (src.startsWith("blob:") || src.startsWith("data:image/")) return true;
    return image.width >= 256 || image.naturalWidth >= 256;
  }
  function isTransientResponseText(text) {
    const normalized = normalizeTurnText(text);
    return /^(?:正在思考|正在生成|正在创建|请稍等)/.test(normalized) || /^(?:thinking|generating|creating|please wait)/i.test(normalized);
  }
  function extractLatestResult() {
    const turns = assistantTurns();
    const latest = turns.at(-1);
    if (!latest) return { images: [], responseText: "" };
    const images = [...latest.querySelectorAll("img")].filter(generatedImageSource).map((image) => image.currentSrc || image.src);
    const textSource = latest.cloneNode(true);
    textSource.querySelectorAll([
      "button",
      '[role="button"]',
      '[contenteditable="true"]',
      '[data-testid*="copy" i]',
      '[data-testid*="edit" i]',
      '[data-testid*="feedback" i]',
      '[data-testid*="share" i]',
      "script",
      "style",
      "svg"
    ].join(",")).forEach((element) => element.remove());
    textSource.querySelectorAll("br").forEach((element) => element.replaceWith("\n"));
    textSource.querySelectorAll("p, li, h1, h2, h3, h4, h5, h6, pre, blockquote, tr").forEach((element) => element.append("\n"));
    const responseText = (textSource.textContent || "").split("\n").map((line) => line.trim().replace(/^ChatGPT\s*(?:说|said)\s*[:：]?\s*/i, "").replace(/^Worked for\s+\d+\s*(?:s|m|h|sec(?:ond)?s?|min(?:ute)?s?|hours?)\s*/i, "").replace(/^思考了\s*\d+\s*(?:秒|分钟|小时)\s*/i, "").trim()).filter((line) => !/^(?:编辑|复制|edit|copy)$/i.test(line)).filter(Boolean).join("\n").trim();
    return {
      images: [...new Set(images)],
      responseText: isTransientResponseText(responseText) ? "" : responseText
    };
  }
  function decodeImage(input) {
    const binary = atob(input.base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new File([bytes], input.name, { type: input.mimeType });
  }
  async function waitUntil(check, timeoutMs, failure) {
    const started = Date.now();
    while (!check()) {
      if (Date.now() - started > timeoutMs) throw failure;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  function signalBackgroundPageActivity() {
    window.dispatchEvent(new Event("focus"));
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: false }));
    document.dispatchEvent(new Event("visibilitychange"));
  }
  async function uploadImages(fileInput, images) {
    if (images.length === 0) return;
    let resolvedInput = fileInput ?? findUploadInput();
    if (!resolvedInput) {
      const attachmentButton = findAttachmentButton();
      if (!attachmentButton) throw new AdapterError("upload_failed", "\u627E\u4E0D\u5230 ChatGPT \u56FE\u7247\u4E0A\u4F20\u5165\u53E3");
      attachmentButton.click();
      await waitUntil(
        () => Boolean(findUploadInput()),
        5e3,
        new AdapterError("upload_failed", "\u6253\u5F00\u9644\u4EF6\u83DC\u5355\u540E\u4ECD\u627E\u4E0D\u5230\u56FE\u7247\u4E0A\u4F20\u63A7\u4EF6")
      );
      resolvedInput = findUploadInput();
    }
    if (!resolvedInput) throw new AdapterError("upload_failed", "\u627E\u4E0D\u5230 ChatGPT \u56FE\u7247\u4E0A\u4F20\u63A7\u4EF6");
    if (typeof DataTransfer === "undefined") throw new AdapterError("upload_failed", "\u6D4F\u89C8\u5668\u4E0D\u652F\u6301\u56FE\u7247\u4F20\u9012");
    let expectedAttachmentCount = countComposerAttachments();
    if (expectedAttachmentCount > 0) {
      throw new AdapterError("upload_failed", "ChatGPT 输入区在任务开始前已有附件，已停止发送以避免混入上一次参考图");
    }
    for (const [index, image] of images.entries()) {
      resolvedInput = findUploadInput() ?? resolvedInput;
      const transfer = new DataTransfer();
      transfer.items.add(decodeImage(image));
      resolvedInput.files = transfer.files;
      resolvedInput.dispatchEvent(new Event("input", { bubbles: true }));
      resolvedInput.dispatchEvent(new Event("change", { bubbles: true }));
      expectedAttachmentCount += 1;
      const uploadStartedAt = Date.now();
      let lastBackgroundWake = 0;
      while (countComposerAttachments() < expectedAttachmentCount || composerIsUploading()) {
        if (Date.now() - uploadStartedAt > 6e4) {
          throw new AdapterError("upload_failed", `\u7B2C ${index + 1} \u5F20\u53C2\u8003\u56FE\u6CA1\u6709\u51FA\u73B0\u5728 ChatGPT \u8F93\u5165\u533A`);
        }
        if (document.hidden && Date.now() - lastBackgroundWake > 1500) {
          lastBackgroundWake = Date.now();
          signalBackgroundPageActivity();
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      await waitForStableComposerAttachments(expectedAttachmentCount, index + 1);
    }
  }
  async function waitForCompletion(previousTurnCount, assertConversation, timeoutMs = 10 * 6e4) {
    const started = Date.now();
    let previousSignature = "";
    let stableChecks = 0;
    let automaticRetryCount = 0;
    let lastBackgroundWake = 0;
    while (Date.now() - started <= timeoutMs) {
      if (document.hidden && Date.now() - started > 15e3 && Date.now() - lastBackgroundWake > 30e3) {
        lastBackgroundWake = Date.now();
        signalBackgroundPageActivity();
      }
      if (!assertConversation()) {
        stableChecks = 0;
        await new Promise((resolve) => setTimeout(resolve, 500));
        continue;
      }
      const turns = assistantTurns();
      const latest = turns.at(-1) ?? null;
      const result = extractLatestResult();
      const signature = JSON.stringify(result);
      const hasNewTurn = turns.length > previousTurnCount;
      const isGenerating = Boolean(document.querySelector(stopSelector));
      const hasMeaningfulResult = Boolean(result.responseText || result.images.length > 0);
      const retryButton = !isGenerating ? findTemporaryRetryButton() : void 0;
      if (retryButton) {
        if (automaticRetryCount >= 2) {
          throw new AdapterError("retry_exhausted", "ChatGPT 连续两次生成失败，已停止自动重试");
        }
        automaticRetryCount += 1;
        retryButton.click();
        previousSignature = "";
        stableChecks = 0;
        await new Promise((resolve) => setTimeout(resolve, 1e3));
        continue;
      }
      if (hasNewTurn && !isGenerating && !isTemporaryRetryError(latest) && hasMeaningfulResult) {
        stableChecks = signature === previousSignature ? stableChecks + 1 : 0;
        if (stableChecks >= 3) return;
      } else {
        stableChecks = 0;
      }
      previousSignature = signature;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new AdapterError("timeout", "\u7B49\u5F85 ChatGPT \u751F\u6210\u7ED3\u679C\u8D85\u65F6");
  }
  async function imageUrlToBase64(url) {
    const response = await fetch(url, { credentials: "include" });
    if (!response.ok) throw new AdapterError("network_error", `\u8BFB\u53D6\u751F\u6210\u56FE\u7247\u5931\u8D25\uFF1A${response.status}`);
    const blob = await response.blob();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    const chunk = 32768;
    for (let index = 0; index < bytes.length; index += chunk) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
    }
    return { base64: btoa(binary), mimeType: blob.type || "image/png" };
  }
  async function submitTask(input) {
    const page = await waitForReadyPage(input.expectedConversationUrl);
    if (!input.prompt.trim() && input.images.length === 0) {
      throw new AdapterError("selector_missing", "\u4EFB\u52A1\u6CA1\u6709\u53EF\u53D1\u9001\u7684\u56FE\u7247\u6216\u6587\u5B57");
    }
    const previousUserTurnCount = document.querySelectorAll(userSelector).length;
    const previousTurnCount = assistantTurns().length;
    assertExpectedConversation(input.expectedConversationUrl);
    await uploadImages(page.fileInput, input.images);
    assertExpectedConversation(input.expectedConversationUrl);
    setComposerText(page.composer, input.prompt);
    await waitUntil(
      () => {
        const sendButton2 = findSendButton();
        return Boolean(sendButton2 && !sendButton2.disabled);
      },
      2e4,
      new AdapterError("selector_missing", "\u586B\u5199\u5185\u5BB9\u540E\uFF0CChatGPT \u53D1\u9001\u6309\u94AE\u4ECD\u672A\u51FA\u73B0")
    );
    const sendButton = findSendButton();
    if (!sendButton || sendButton.disabled) {
      throw new AdapterError("selector_missing", "ChatGPT \u53D1\u9001\u6309\u94AE\u5728\u70B9\u51FB\u524D\u6D88\u5931");
    }
    assertExpectedConversation(input.expectedConversationUrl);
    sendButton.click();
    try {
      await waitUntil(
        () => document.querySelectorAll(userSelector).length > previousUserTurnCount,
        15e3,
        new Error("synthetic click was not accepted")
      );
    } catch {
      const retrySendButton = findSendButton();
      if (retrySendButton && !retrySendButton.disabled) retrySendButton.click();
      try {
        await waitUntil(
          () => document.querySelectorAll(userSelector).length > previousUserTurnCount,
          15e3,
          new Error("second ChatGPT send click was not accepted")
        );
      } catch {
        await input.onManualAction?.();
        await waitUntil(
          () => document.querySelectorAll(userSelector).length > previousUserTurnCount,
          10 * 6e4,
          new AdapterError("manual_action_timeout", "等待 10 分钟后仍未检测到手动发送，已停止任务")
        );
      }
    }
    const assertCompletionConversation = createCompletionConversationCheck(
      input.expectedConversationUrl,
      previousUserTurnCount,
      input.prompt
    );
    await waitForCompletion(previousTurnCount, assertCompletionConversation);
    if (!assertCompletionConversation()) {
      throw new AdapterError("conversation_unavailable", "\u7B49\u5F85\u671F\u95F4\u6807\u7B7E\u9875\u5207\u6362\u5230\u4E86\u5176\u4ED6 ChatGPT \u5BF9\u8BDD");
    }
    const result = extractLatestResult();
    return {
      images: await Promise.all(result.images.map(imageUrlToBase64)),
      responseText: result.responseText
    };
  }
  async function resumeTask(input) {
    await waitUntil(
      () => document.querySelectorAll(userSelector).length > 0,
      3e4,
      new AdapterError("conversation_unavailable", "ChatGPT 对话已打开，但没有找到已发送的任务消息")
    );
    const assertCompletionConversation = createCompletionConversationCheck(void 0, 0, input.prompt);
    await waitForCompletion(0, assertCompletionConversation);
    const result = extractLatestResult();
    return {
      images: await Promise.all(result.images.map(imageUrlToBase64)),
      responseText: result.responseText
    };
  }

  // src/chatgpt/contentScript.ts
  async function report(message) {
    await chrome.runtime.sendMessage(message);
  }
  var contentScriptScope = globalThis;
  var activeResumeTasks = contentScriptScope.__gptNodeCanvasActiveResumeTasks ?? /* @__PURE__ */ new Set();
  contentScriptScope.__gptNodeCanvasActiveResumeTasks = activeResumeTasks;
  var previousMessageListener = contentScriptScope.__gptNodeCanvasMessageListener;
  if (typeof previousMessageListener === "function") {
    try {
      chrome.runtime.onMessage.removeListener(previousMessageListener);
    } catch {
    }
  }
  var currentMessageListener = (raw, _sender, sendResponse) => {
      if (!isExtensionMessage(raw)) return false;
      if (raw.type === "CHECK_CHATGPT_ADAPTER") {
        sendResponse({ adapterVersion: CHATGPT_ADAPTER_VERSION });
        return false;
      }
      if (raw.type !== "EXECUTE_IN_CHATGPT_V3" && raw.type !== "RESUME_CHATGPT_RESULT") return false;
      const message = raw;
      sendResponse({ accepted: true });
      if (raw.type === "RESUME_CHATGPT_RESULT") {
        const resumeKey = `${message.projectId}:${message.taskId}`;
        signalBackgroundPageActivity();
        if (activeResumeTasks.has(resumeKey)) return true;
        activeResumeTasks.add(resumeKey);
        void resumeTask({ prompt: message.prompt }).then((result) => report({
          type: "TASK_RESULT",
          projectId: message.projectId,
          taskId: message.taskId,
          images: result.images,
          responseText: result.responseText,
          conversationUrl: location.href
        })).catch((error) => report({
          type: "TASK_ERROR",
          projectId: message.projectId,
          taskId: message.taskId,
          reason: error instanceof AdapterError ? error.reason : "network_error",
          detail: error instanceof Error ? error.message : "ChatGPT 页面恢复监听失败",
          conversationUrl: location.href
        })).finally(() => activeResumeTasks.delete(resumeKey));
        return true;
      }
      if (!expectedChatGptConversationMatches(location.href, message.expectedConversationUrl)) {
        void report({
          type: "TASK_ERROR",
          projectId: message.projectId,
          taskId: message.taskId,
          reason: "conversation_unavailable",
          detail: "\u5F53\u524D\u6807\u7B7E\u9875\u4E0D\u662F\u8FD9\u4E2A\u4EFB\u52A1\u4FDD\u5B58\u7684 ChatGPT \u5BF9\u8BDD\uFF0C\u5DF2\u505C\u6B62\u53D1\u9001"
        });
        return true;
      }
      void submitTask({
        prompt: message.prompt,
        images: message.images,
        expectedConversationUrl: message.expectedConversationUrl,
        onManualAction: () => report({
          type: "TASK_STATUS",
          projectId: message.projectId,
          taskId: message.taskId,
          status: "manual_action",
          detail: "ChatGPT 没有接受自动发送，请打开真实对话后手动点击发送；Pixel Flow 会继续等待并自动回写结果"
        })
      }).then((result) => report({
        type: "TASK_RESULT",
        projectId: message.projectId,
        taskId: message.taskId,
        images: result.images,
        responseText: result.responseText,
        conversationUrl: location.href
      })).catch((error) => {
        const reason = error instanceof AdapterError ? error.reason : "network_error";
        return report({
          type: "TASK_ERROR",
          projectId: message.projectId,
          taskId: message.taskId,
          reason,
          detail: error instanceof Error ? error.message : "ChatGPT \u9875\u9762\u6267\u884C\u5931\u8D25",
          conversationUrl: location.href
        });
      });
    return true;
  };
  contentScriptScope.__gptNodeCanvasAdapterVersion = CHATGPT_ADAPTER_VERSION;
  contentScriptScope.__gptNodeCanvasMessageListener = currentMessageListener;
  chrome.runtime.onMessage.addListener(currentMessageListener);
})();
