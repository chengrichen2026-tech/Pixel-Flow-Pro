import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("browser runs wait for an in-flight mode save", async () => {
  const source = await readFile(new URL("production/generation-mode.js", root), "utf8");
  assert.match(source, /const pendingModeSave = modeSavePromises\.get\(key\)/);
  assert.match(source, /if \(selectedMode !== "api" && !pendingModeSave\) return/);
  assert.match(source, /await pendingModeSave/);
});

test("running ChatGPT task groups stay expanded so background tabs are not frozen", async () => {
  const source = await readFile(new URL("public/background.js", root), "utf8");
  assert.match(source, /title: TASK_TAB_GROUP_TITLE,[\s\S]*?collapsed: false/);
  assert.doesNotMatch(source, /title: TASK_TAB_GROUP_TITLE,[\s\S]*?collapsed: true/);
  assert.match(source, /if \(message\.type === "TASK_RESULT"\) \{\s*await tabRegistry\.hibernate\(key\)/);
});

test("a new run clears stale status detail before queueing", async () => {
  const source = await readFile(new URL("public/background.js", root), "utf8");
  assert.match(source, /status: "queued",\s*detail: void 0/);
});

test("manual-action errors prefer the concrete conversation URL reported by the page", async () => {
  const source = await readFile(new URL("public/background.js", root), "utf8");
  assert.match(source, /concreteChatGptConversationUrl\(message\.conversationUrl\) \?\? concreteChatGptConversationUrl\(senderUrl\)/);
});

test("opening a task recovers from a stale tab mapping", async () => {
  const source = await readFile(new URL("public/background.js", root), "utf8");
  assert.match(source, /expectedUrl === "https:\/\/chatgpt\.com\/" && liveConversationUrl/);
  assert.match(source, /if \(!\(error instanceof ConversationUnavailableError\)\) throw error/);
  assert.match(source, /this\.taskTabs\.set\(taskId, \{ conversationUrl: conversationUrl \?\? previous\?\.conversationUrl \}\)/);
});

test("ChatGPT temporary generation errors retry automatically with a hard limit", async () => {
  const source = await readFile(new URL("public/contentScript.js", root), "utf8");
  assert.match(source, /function findTemporaryRetryButton\(\)/);
  assert.match(source, /const retryButton = !isGenerating \? findTemporaryRetryButton\(\) : void 0/);
  assert.match(source, /if \(automaticRetryCount >= 2\)/);
  assert.match(source, /retryButton\.click\(\)/);
});

test("manual send keeps the task alive until the user submits and the result returns", async () => {
  const content = await readFile(new URL("public/contentScript.js", root), "utf8");
  const background = await readFile(new URL("public/background.js", root), "utf8");
  const modeUi = await readFile(new URL("production/generation-mode.js", root), "utf8");
  assert.match(content, /await input\.onManualAction\?\.\(\)/);
  assert.match(content, /10 \* 6e4/);
  assert.match(background, /else if \(message\.type === "TASK_ERROR"\)/);
  assert.doesNotMatch(modeUi, /task-status\[data-status="manual_action"\]/);
});

test("ChatGPT send confirmation never falls back to native form submission", async () => {
  const source = await readFile(new URL("public/contentScript.js", root), "utf8");
  assert.doesNotMatch(source, /requestSubmit\(/);
  assert.match(source, /const retrySendButton = findSendButton\(\)/);
  assert.match(source, /if \(retrySendButton && !retrySendButton\.disabled\) retrySendButton\.click\(\)/);
  assert.match(source, /15e3,[\s\S]*?synthetic click was not accepted/);
  assert.match(source, /15e3,[\s\S]*?second ChatGPT send click was not accepted/);
});

test("a new ChatGPT conversation URL gets a hydration grace period before rejection", async () => {
  const source = await readFile(new URL("public/contentScript.js", root), "utf8");
  assert.match(source, /let pendingConversationStartedAt = 0/);
  assert.match(source, /Date\.now\(\) - pendingConversationStartedAt <= 15e3/);
  assert.match(source, /if \(!submittedTurnIsStillVisible\(previousUserTurnCount, prompt\)\)/);
});

test("conversation continuity ignores Markdown markers removed by ChatGPT rendering", async () => {
  const source = await readFile(new URL("public/contentScript.js", root), "utf8");
  assert.match(source, /function normalizeComparableTurnText\(text\)/);
  assert.match(source, /function normalizeSemanticTurnText\(text\)/);
  assert.match(source, /replace\(\/\[\^\\p\{L\}\\p\{N\}\]\+\/gu, ""\)/);
  assert.match(source, /const submittedText = normalizeSemanticTurnText\(prompt\)/);
  assert.match(source, /const latestText = normalizeSemanticTurnText\(turns\.at\(-1\)/);
  assert.match(source, /```\[a-z0-9_-\]\*\|```/);
  assert.match(source, /`\(\[\^`\]\*\)`/);
  assert.match(source, /submittedText\.slice\(0, 80\)/);
  assert.match(source, /submittedText\.slice\(-80\)/);
  assert.match(source, /lockedConversationUrl = `\$\{current\.origin\}\$\{current\.pathname\}`/);
});

test("long image prompts resume across ChatGPT full-page navigation", async () => {
  const content = await readFile(new URL("public/contentScript.js", root), "utf8");
  const background = await readFile(new URL("public/background.js", root), "utf8");
  assert.match(content, /"RESUME_CHATGPT_RESULT"/);
  assert.match(content, /async function resumeTask\(input\)/);
  assert.match(content, /ChatGPT 对话已打开，但没有找到已发送的任务消息/);
  assert.match(background, /var browserTaskMessages/);
  assert.match(background, /"browserTaskMessages"/);
  assert.match(background, /async function saveBrowserTaskMessages\(\)/);
  assert.match(background, /function recoveryMessage\(message\)/);
  assert.match(background, /return \{ \.\.\.message, images: \[\] \}/);
  assert.match(background, /browserTaskMessages\.set\(key, recoveryMessage\(message\)\)/);
  assert.match(background, /await saveBrowserTaskMessages\(\)/);
  assert.match(background, /await schedulerReady/);
  assert.match(background, /chrome\.tabs\.onUpdated\.addListener/);
  assert.match(background, /const observedUrl = changeInfo\.url \?\? tab\.url/);
  assert.match(background, /changeInfo\.status !== "complete" && !changeInfo\.url/);
  assert.match(background, /observedUrl\.includes\("\?prompt="\)/);
  assert.match(background, /world: "MAIN"/);
  assert.match(background, /type: "RESUME_CHATGPT_RESULT"/);
});

test("API mode submits persistent jobs and reconnects with apiJobId", async () => {
  const source = await readFile(new URL("public/background.js", root), "utf8");
  const manifest = await readFile(new URL("public/manifest.json", root), "utf8");
  assert.match(source, /API_WORKER_URL = "http:\/\/127\.0\.0\.1:43129"/);
  assert.match(source, /apiJobId: jobId/);
  assert.match(source, /if \(task\?\.apiJobId\)/);
  assert.match(manifest, /http:\/\/127\.0\.0\.1:43129\/\*/);
});

test("normal API generation does not show a status detail as an alert", async () => {
  const source = await readFile(new URL("public/background.js", root), "utf8");
  const app = await readFile(new URL("src/App.tsx", root), "utf8");
  const store = await readFile(new URL("src/store.ts", root), "utf8");
  assert.match(source, /status: "sending", detail: void 0/);
  assert.match(source, /status: "generating", detail: void 0, apiJobId: jobId/);
  assert.doesNotMatch(source, /正在重连本机 API 任务|正在向本机 API 任务服务提交请求/);
  assert.doesNotMatch(source, /API 任务已由本机服务持久执行，扩展重载后可恢复/);
  assert.match(app, /\['failed','manual_action'\]\.includes\(n\.status\)/);
  assert.match(store, /status:"queued",statusDetail:undefined/);
});

test("switching to browser mode clears inherited API job state", async () => {
  const modeUi = await readFile(new URL("production/generation-mode.js", root), "utf8");
  const background = await readFile(new URL("public/background.js", root), "utf8");
  assert.match(modeUi, /mode === "browser" \? \{ apiJobId: void 0, statusDetail: void 0 \}/);
  assert.match(modeUi, /\["queued", "waiting_page", "uploading", "sending", "generating", "manual_action"\]\.includes\(activeStatus\)/);
  assert.match(background, /message\.clearApiJobId \? void 0/);
});

test("browser results preserve the original latest-assistant-turn writeback path", async () => {
  const source = await readFile(new URL("public/contentScript.js", root), "utf8");
  assert.match(source, /const images = \[\.\.\.latest\.querySelectorAll\("img"\)\]/);
  assert.doesNotMatch(source, /existingImageSources/);
  assert.doesNotMatch(source, /collectGeneratedImageSources/);
  assert.match(source, /isTransientResponseText\(responseText\) \? "" : responseText/);
  assert.match(source, /\(\?:\\d\+\\s\*\(\?:s\|m\|h/);
});

test("reinjected ChatGPT adapter replaces a stale page listener after extension reload", async () => {
  const content = await readFile(new URL("public/contentScript.js", root), "utf8");
  const background = await readFile(new URL("public/background.js", root), "utf8");
  assert.match(content, /CHATGPT_ADAPTER_VERSION = 24/);
  assert.match(background, /CHATGPT_ADAPTER_VERSION = 24/);
  assert.match(content, /__gptNodeCanvasMessageListener/);
  assert.match(content, /removeListener\(previousMessageListener\)/);
  assert.match(content, /addListener\(currentMessageListener\)/);
  assert.doesNotMatch(content, /if \(contentScriptScope\.__gptNodeCanvasAdapterVersion !== CHATGPT_ADAPTER_VERSION\)/);
});

test("browser results are recovered by a service-worker alarm without opening the conversation", async () => {
  const content = await readFile(new URL("public/contentScript.js", root), "utf8");
  const background = await readFile(new URL("public/background.js", root), "utf8");
  assert.match(background, /BROWSER_RESULT_RECOVERY_ALARM = "pixel-flow-browser-result-recovery"/);
  assert.match(background, /scheduleBrowserResultRecoveryAlarm\(\)/);
  assert.match(background, /if \(browserTaskMessages\.size > 0\) scheduleBrowserResultRecoveryAlarm\(\)/);
  assert.match(background, /async function reconcileBrowserTaskResults\(\)/);
  assert.match(background, /type: "RESUME_CHATGPT_RESULT"/);
  assert.match(background, /alarm\.name === BROWSER_RESULT_RECOVERY_ALARM/);
  assert.match(background, /message\.phase !== "submitted" \|\| adapterState\?\.submitActive/);
  assert.match(background, /const concreteUrl = concreteChatGptConversationUrl\(mapped\.conversationUrl\)/);
  assert.match(background, /Date\.now\(\) - \(message\.submittedAt \?\? message\.startedAt \?\? 0\) > 12e4/);
  assert.match(background, /await chrome\.tabs\.reload\(mapped\.tabId\)/);
  assert.match(content, /__gptNodeCanvasActiveResumeTasks/);
  assert.match(content, /__gptNodeCanvasActiveSubmitTasks/);
  assert.match(content, /activeSubmitTasks\.has\(resumeKey\)/);
  assert.match(content, /taskPhases\.set\(taskKey, "preparing_tab"\)/);
  assert.match(content, /await input\.onPhase\?\.\("submitted"\)/);
  assert.match(content, /signalBackgroundPageActivity\(\)/);
  assert.match(content, /activeResumeTasks\.has\(resumeKey\)/);
});

test("hidden ChatGPT tabs receive page activity signals while reference images upload", async () => {
  const content = await readFile(new URL("public/contentScript.js", root), "utf8");
  assert.match(content, /function signalBackgroundPageActivity\(\)/);
  assert.match(content, /const uploadStartedAt = Date\.now\(\)/);
  assert.match(content, /Date\.now\(\) - uploadStartedAt > 6e4/);
  assert.match(content, /document\.hidden && Date\.now\(\) - lastBackgroundWake > 1500/);
  assert.match(content, /signalBackgroundPageActivity\(\)/);
});

test("multiple ChatGPT reference images upload sequentially and recognize current file tiles", async () => {
  const content = await readFile(new URL("public/contentScript.js", root), "utf8");
  assert.match(content, /\[data-composer-grid\] \[role="group"\]\[aria-label\]/);
  assert.match(content, /for \(const \[index, image\] of images\.entries\(\)\)/);
  assert.match(content, /expectedAttachmentCount \+= 1/);
  assert.match(content, /countComposerAttachments\(\) < expectedAttachmentCount/);
  assert.match(content, /await waitForStableComposerAttachments\(expectedAttachmentCount, index \+ 1\)/);
  assert.match(content, /\\u7B2C \$\{index \+ 1\} \\u5F20\\u53C2\\u8003\\u56FE/);
});

test("ChatGPT waits for every reference image to finish a stable upload before sending", async () => {
  const content = await readFile(new URL("public/contentScript.js", root), "utf8");
  assert.match(content, /function composerAttachmentSignature\(\)/);
  assert.match(content, /button\[aria-label\^="\\u6253\\u5F00\\u56FE\\u7247\\uFF1A"\]/);
  assert.match(content, /async function waitForStableComposerAttachments\(expectedCount, imageNumber\)/);
  assert.match(content, /attachmentCount === expectedCount && !composerIsUploading\(\)/);
  assert.match(content, /Date\.now\(\) - stableSince >= 3e3/);
  assert.doesNotMatch(content, /naturalWidth > 0/);
  assert.match(content, /if \(removeButtons\.length > 0\) return removeButtons\.length/);
  assert.match(content, /return removeButtons\.map\(\(button\) => button\.getAttribute\("aria-label"\)/);
  assert.match(content, /findUploadInput\(\) \?\? resolvedInput/);
  assert.match(content, /任务开始前已有附件/);
});

test("ChatGPT upload selects the file input belonging to the active composer", async () => {
  const content = await readFile(new URL("public/contentScript.js", root), "utf8");
  assert.match(content, /const region = findComposerRegion\(\);[\s\S]*?region\.querySelector\(selector\)/);
  assert.match(content, /document\.querySelectorAll\(selector\)/);
  assert.match(content, /candidates\.at\(-1\)/);
});

test("browser tasks keep reference upload and prompt submission in one adapter transaction", async () => {
  const background = await readFile(new URL("public/background.js", root), "utf8");
  const executeTask = background.slice(background.indexOf("async function executeTask"), background.indexOf("async function startWaitingTasks"));
  assert.match(executeTask, /prompt: appendAspectRatioPrompt[\s\S]*?images,[\s\S]*?startedAt: Date\.now\(\),[\s\S]*?phase: "preparing_tab"\s*\n\s*};/);
  assert.doesNotMatch(executeTask, /world: "MAIN"/);
  assert.doesNotMatch(executeTask, /images: \[\]/);
});

test("images can be dropped onto the canvas at the pointer position", async () => {
  const app = await readFile(new URL("src/App.tsx", root), "utf8");
  const manifest = await readFile(new URL("public/manifest.json", root), "utf8");
  assert.match(app, /onDrop=\{async event=>/);
  assert.match(app, /screenToFlowPosition\(\{x:event\.clientX,y:event\.clientY\}\)/);
  assert.match(app, /text\/uri-list/);
  assert.match(manifest, /https:\/\/\*\.oaiusercontent\.com\/\*/);
});

test("trackpad pan works over prompt text and left-drag creates a partial selection box", async () => {
  const app = await readFile(new URL("src/App.tsx", root), "utf8");
  assert.match(app, /selectionOnDrag selectionMode=\{SelectionMode\.Partial\} panOnDrag=\{\[1,2\]\} panOnScroll/);
  assert.match(app, /className="task-prompt nodrag"/);
});

test("the canvas uses the default arrow cursor while idle", async () => {
  const theme = await readFile(new URL("production/pixel-flow-theme.css", root), "utf8");
  assert.match(theme, /\.flow-stage \.react-flow__pane\.selection\{cursor:default\}/);
  assert.match(theme, /\.flow-stage \.react-flow__pane\.dragging\{cursor:grabbing\}/);
});

test("hidden ChatGPT task tabs receive internal refresh signals without foreground activation", async () => {
  const content = await readFile(new URL("public/contentScript.js", root), "utf8");
  const background = await readFile(new URL("public/background.js", root), "utf8");
  assert.match(content, /document\.hidden && Date\.now\(\) - started > 15e3/);
  assert.match(content, /function signalBackgroundPageActivity\(\)/);
  assert.match(content, /window\.dispatchEvent\(new Event\("focus"\)\)/);
  assert.match(content, /document\.dispatchEvent\(new Event\("visibilitychange"\)\)/);
  assert.doesNotMatch(content, /WAKE_TASK_TAB/);
  assert.doesNotMatch(background, /pulseTaskTab|WAKE_TASK_TAB/);
  assert.match(background, /message\.type === "TASK_STATUS" \|\| message\.type === "TASK_RESULT"/);
});

test("Windows API Worker has install, start, uninstall, and health-check scripts", async () => {
  const packageJson = await readFile(new URL("package.json", root), "utf8");
  const install = await readFile(new URL("api-worker/install-windows.ps1", root), "utf8");
  const start = await readFile(new URL("api-worker/start-windows.ps1", root), "utf8");
  const uninstall = await readFile(new URL("api-worker/uninstall-windows.ps1", root), "utf8");
  assert.match(packageJson, /api-worker:install:windows/);
  assert.match(packageJson, /api-worker:start:windows/);
  assert.match(packageJson, /api-worker:uninstall:windows/);
  assert.match(install, /\[Environment\]::GetFolderPath\("Startup"\)/);
  assert.match(install, /Node\.js 20 or newer/);
  assert.match(start, /Invoke-RestMethod -Uri \$healthUrl/);
  assert.match(start, /api-worker\.windows\.pid/);
  assert.match(uninstall, /Get-CimInstance Win32_Process/);
  assert.match(uninstall, /CommandLine\.Contains\(\$serverPath\)/);
});
