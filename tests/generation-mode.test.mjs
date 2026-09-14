import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { readBackgroundSource } from "./helpers/background-source.mjs";

const root = new URL("../", import.meta.url);

test("browser runs wait for an in-flight mode save", async () => {
  const source = await readFile(new URL("src/App.tsx", root), "utf8");
  assert.match(source, /const pendingSettingsSave=useRef<Promise<void>>\(Promise\.resolve\(\)\)/);
  assert.match(source, /const trackSave=async\(saving:Promise<void>\)/);
  assert.match(source, /await pendingSettingsSave\.current/);
  assert.match(source, /const currentTask=useStore\.getState\(\)\.project\?\.graph\.nodes\.find/);
  assert.match(source, /aria-label="生图模式"/);
  assert.match(source, /aria-label="GPT Web 执行位置"/);
  assert.match(source, /generationModeForProvider\('gpt_web',next\)/);
});

test("running ChatGPT task groups stay expanded so background tabs are not frozen", async () => {
  const source = await readBackgroundSource();
  assert.match(source, /title: TASK_TAB_GROUP_TITLE,[\s\S]*?collapsed: false/);
  assert.doesNotMatch(source, /title: TASK_TAB_GROUP_TITLE,[\s\S]*?collapsed: true/);
  assert.match(source, /if \(message\.type === "TASK_RESULT"\) \{\s*await tabRegistry\.hibernate\(key\)/);
});

test("a new run clears stale status detail before queueing", async () => {
  const source = await readBackgroundSource();
  assert.match(source, /status: "queued",\s*detail: void 0/);
});

test("manual-action errors prefer the concrete conversation URL reported by the page", async () => {
  const source = await readBackgroundSource();
  assert.match(source, /function resolveTaskConversationUrl/);
  assert.match(source, /concreteChatGptConversationUrl\(message\.conversationUrl\)/);
  assert.match(source, /\?\? concreteChatGptConversationUrl\(senderUrl\)/);
});

test("opening a task recovers from a stale tab mapping", async () => {
  const source = await readBackgroundSource();
  assert.match(source, /expectedUrl === "https:\/\/chatgpt\.com\/" && liveConversationUrl/);
  assert.match(source, /if \(!\(error instanceof ConversationUnavailableError\)\) throw error/);
  assert.match(source, /this\.taskTabs\.set\(taskId, \{ conversationUrl: conversationUrl \?\? previous\?\.conversationUrl \?\? "https:\/\/chatgpt\.com\/" \}\)/);
});

test("waiting for a ChatGPT task tab fails closed on removal or timeout", async () => {
  const background = await readBackgroundSource();
  assert.match(background, /async function waitForTabReady\(tabId, timeoutMs = 30_000\)/);
  assert.match(background, /chrome\.tabs\.onRemoved\.addListener\(removed\)/);
  assert.match(background, /ChatGPT任务标签页在准备完成前被关闭/);
  assert.match(background, /等待ChatGPT任务标签页就绪超过30秒/);
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
  const background = await readBackgroundSource();
  const app = await readFile(new URL("src/App.tsx", root), "utf8");
  assert.match(content, /await input\.onManualAction\?\.\(\)/);
  assert.match(content, /10 \* 6e4/);
  assert.match(background, /else if \(message\.type === "TASK_ERROR"\)/);
  assert.match(app, /taskRunStatus\(n\),active=isActiveTaskRun\(n\),statusText=taskStatusLabel\(n\)/);
  assert.match(app, /role="status">\{n\.statusDetail\}/);
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
  const background = await readBackgroundSource();
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
  assert.match(background, /const resumedMessage = \{ \.\.\.message, expectedConversationUrl: observedUrl \}/);
  assert.match(background, /tabRegistry\.updateConversation\(key, observedUrl\)/);
  assert.match(background, /browserTaskMessages\.set\(key, resumedMessage\)/);
  assert.match(background, /conversationUrl: observedUrl/);
});

test("API mode submits persistent jobs and reconnects with apiJobId", async () => {
  const source = await readBackgroundSource();
  const manifest = await readFile(new URL("public/manifest.json", root), "utf8");
  assert.match(source, /API_WORKER_URL = "http:\/\/127\.0\.0\.1:43129"/);
  assert.match(source, /apiJobId: jobId/);
  assert.match(source, /const runtime = resolveTaskRuntime\(task, latestRun\)/);
  assert.match(source, /const runtimeTask = \{ \.\.\.task, apiJobId: runtime\.providerJobId/);
  assert.match(source, /let jobId = task\.apiJobId;\s*if \(!jobId\) \{\s*await persistAndBroadcast\(\{ type: "TASK_STATUS", projectId, taskId, status: "sending"/);
  assert.match(manifest, /http:\/\/127\.0\.0\.1:43129\/\*/);
});

test("generation messages persist TaskRun and project projection in one transaction", async () => {
  const background = await readBackgroundSource();
  assert.match(background, /var taskRunRepository = new TaskRunRepository\(database\.runs\)/);
  assert.match(background, /await startTaskRun\(message\.projectId, taskId\)/);
  assert.match(background, /mutateGenerationState\(message\.projectId/);
  assert.match(background, /this\.database\.projects, this\.database\.assets, this\.database\.runs/);
  assert.match(background, /runEventStatus\(message\)/);
  assert.match(background, /taskRunRepository\.advance\(run\.id, status/);
  assert.match(background, /projectRunToLegacyTask\(run\)/);
  assert.match(background, /isDuplicateTerminalRunEvent\(run\.status, status\)/);
  assert.doesNotMatch(background, /mirrorTaskMessageToRun/);
  assert.match(background, /runStatus: "canceled", detail: "任务已取消"/);
  assert.match(background, /await startTaskRun\(projectId, taskId\);\s*await persistAndBroadcast\(\{ type: "TASK_STATUS", projectId, taskId, status: "generating", runStatus: "delivering"/);
});

test("normal, batch and retry actions share one run interface", async () => {
  const background = await readBackgroundSource();
  const store = await readFile(new URL("src/store.ts", root), "utf8");
  assert.match(store, /const requestTaskRuns = async \(projectId:string,taskIds:string\[\]\)/);
  assert.match(store, /type:"RUN_TASKS",projectId,taskIds/);
  assert.match(store, /await requestTaskRuns\(p\.id,\[taskId\]\)/);
  assert.match(store, /await requestTaskRuns\(p\.id,children\.map\(child=>child\.task\.id\)\)/);
  assert.doesNotMatch(store, /get\(\)\.updateNode\(taskId,\{status:"queued"/);
  assert.doesNotMatch(store, /node\.kind==="task"&&failedIds\.has\(node\.id\)\?\{\.\.\.node,status:"queued"/);
  assert.match(store, /const taskIds=p\.graph\.nodes\.filter\(n=>n\.kind==="task"\)\.map\(n=>n\.id\)/);
  assert.match(background, /const providerJobId = run\?\.providerJobId \|\| task\?\.apiJobId/);
  assert.match(background, /run\?\.conversationUrl \?\? \(task\?\.kind === "task" \? task\.conversationUrl/);
  assert.match(background, /run \? run\.status === "completed" : task\.status === "completed"/);
});

test("normal API generation does not show a status detail as an alert", async () => {
  const source = await readBackgroundSource();
  const app = await readFile(new URL("src/App.tsx", root), "utf8");
  const store = await readFile(new URL("src/store.ts", root), "utf8");
  assert.match(source, /status: "sending", detail: void 0/);
  assert.match(source, /status: "generating", detail: void 0, apiJobId: jobId/);
  assert.doesNotMatch(source, /正在重连本机 API 任务|正在向本机 API 任务服务提交请求/);
  assert.doesNotMatch(source, /API 任务已由本机服务持久执行，扩展重载后可恢复/);
  assert.match(app, /className=\{`status-detail \$\{active\?'is-progress':'\'\}`\}/);
  assert.match(store, /status:"queued",runtimeStatus:"queued" as const,statusDetail:undefined/);
});

test("switching to browser mode clears inherited API job state", async () => {
  const modeUi = await readFile(new URL("src/App.tsx", root), "utf8");
  const background = await readBackgroundSource();
  assert.match(modeUi, /apiJobId:undefined,statusDetail:undefined/);
  assert.match(modeUi, /next!==['"]browser['"]\?\{conversationUrl:undefined\}:\{\}/);
  assert.match(modeUi, /modeLocked\(n\.status\)/);
  assert.match(background, /providerJobId: event\.clearApiJobId \? null : event\.apiJobId/);
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
  const background = await readBackgroundSource();
  assert.match(content, /CHATGPT_ADAPTER_VERSION = 28/);
  assert.match(background, /CHATGPT_ADAPTER_VERSION = 28/);
  assert.match(content, /__gptNodeCanvasMessageListener/);
  assert.match(content, /removeListener\(previousMessageListener\)/);
  assert.match(content, /addListener\(currentMessageListener\)/);
  assert.doesNotMatch(content, /if \(contentScriptScope\.__gptNodeCanvasAdapterVersion !== CHATGPT_ADAPTER_VERSION\)/);
});

test("browser results are recovered by a service-worker alarm without opening the conversation", async () => {
  const content = await readFile(new URL("public/contentScript.js", root), "utf8");
  const background = await readBackgroundSource();
  assert.match(background, /BROWSER_RESULT_RECOVERY_ALARM = "pixel-flow-browser-result-recovery"/);
  assert.match(background, /scheduleBrowserResultRecoveryAlarm\(\)/);
  assert.match(background, /if \(browserTaskMessages\.size > 0\) scheduleBrowserResultRecoveryAlarm\(\)/);
  assert.match(background, /async function reconcileBrowserTaskResults\(\)/);
  assert.match(background, /type: "RESUME_CHATGPT_RESULT"/);
  assert.match(background, /alarm\.name === BROWSER_RESULT_RECOVERY_ALARM/);
  assert.match(background, /if \(message\.phase !== "submitted" \|\| adapterState\?\.submitActive/);
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
  assert.match(content, /type: "TASK_ERROR",\s*recovery: true/);
  assert.match(background, /message\.type === "TASK_ERROR" && recoveryMessageState\?\.phase === "submitted" && !message\.recovery/);
});

test("extension reload reconstructs recovery state for persisted generating browser tasks", async () => {
  const background = await readBackgroundSource();
  assert.match(background, /for \(const project of await projectRepository\.listProjects\(\)\)/);
  assert.match(background, /const latestRuns = await taskRunRepository\.latestByProject\(project\.id\)/);
  assert.match(background, /!runtime\.active \|\| !\["sending", "submitted", "generating", "delivering"\]\.includes\(runtime\.status\)/);
  assert.match(background, /const conversationUrl = concreteChatGptConversationUrl\(runtime\.conversationUrl\)/);
  assert.match(background, /const storedMessage = browserTaskMessages\.get\(key\)/);
  assert.match(background, /\.\.\.storedMessage/);
  assert.match(background, /phase: "submitted"/);
  assert.match(background, /if \(!queue\.running\.includes\(key\)\) queue\.running\.push\(key\)/);
  assert.match(background, /tabRegistry\.map\(key, void 0, conversationUrl\)/);
  assert.match(background, /pendingMessage\?\.phase === "submitted" && \["preparing_tab", "uploading", "sending"\]\.includes\(message\.status\)/);
});

test("extension startup prunes stale scheduler slots before advancing live tasks", async () => {
  const background = await readBackgroundSource();
  assert.match(background, /async function reconcileSchedulerSnapshot\(\)/);
  assert.match(background, /await reconcileTaskRunProjections\(\)/);
  assert.match(background, /const runtime = resolveTaskRuntime\(task, latestRuns\.get\(task\.id\)\)/);
  assert.match(background, /if \(!runtime\.active\) continue/);
  assert.match(background, /queue = reconcileQueue\(queue, new Set\(liveScopes\.keys\(\)\)\)/);
  assert.match(background, /activeTaskScopes[\s\S]*runningKeys\.has\(entry\[0\]\)/);
  assert.match(background, /reconcileSchedulerSnapshot\(\)\.then\(\(\) => recoverInterruptedApiTasks\(\)\)/);
  assert.match(background, /task\.generationMode === "browser" && runtime\.status !== "queued" && !concreteChatGptConversationUrl\(runtime\.conversationUrl\)/);
  assert.match(background, /reason: "browser_interrupted"/);
  assert.match(background, /ChatGPT任务在建立可恢复对话前被中断，请重新运行/);
  assert.match(background, /tabRegistry\.pruneMappings\(liveTaskKeys\)/);
  assert.match(background, /browserTaskMessages\.keys\(\)[\s\S]*!liveTaskKeys\.has\(key\)[\s\S]*browserTaskMessages\.delete\(key\)/);
  assert.match(background, /await tabRegistry\.closeOrphanedManagedTabs\(\)/);
  assert.match(background, /this\.tabs\.query\(\{ groupId: group\.id \}\)/);
});

test("hidden ChatGPT tabs receive page activity signals while reference images upload", async () => {
  const content = await readFile(new URL("public/contentScript.js", root), "utf8");
  assert.match(content, /function signalBackgroundPageActivity\(\)/);
  assert.match(content, /const uploadStartedAt = Date\.now\(\)/);
  assert.match(content, /Date\.now\(\) - uploadStartedAt > 6e4/);
  assert.match(content, /document\.hidden && Date\.now\(\) - lastBackgroundWake > 1500/);
  assert.match(content, /signalBackgroundPageActivity\(\)/);
});

test("ChatGPT result detection wakes on DOM changes instead of relying only on throttled timers", async () => {
  const content = await readFile(new URL("public/contentScript.js", root), "utf8");
  assert.match(content, /async function waitForPageChange\(timeoutMs = 500\)/);
  assert.match(content, /new MutationObserver\(finish\)/);
  assert.match(content, /attributeFilter: \["src", "aria-busy"\]/);
  assert.match(content, /await waitForPageChange\(500\)/);
  assert.match(content, /await waitForPageChange\(200\)/);
  assert.match(content, /await waitForPageChange\(250\)/);
  assert.doesNotMatch(content, /new Promise\(\(resolve\) => setTimeout\(resolve, (?:200|250|500)\)\)/);
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
  const background = await readBackgroundSource();
  const executeTask = background.slice(background.indexOf("async function executeTask"), background.indexOf("async function startWaitingTasks"));
  assert.match(executeTask, /const request = await prepareTaskRequest[\s\S]*?prompt: request\.prompt,[\s\S]*?images: request\.images,[\s\S]*?startedAt: Date\.now\(\),[\s\S]*?phase: "preparing_tab"\s*\n\s*};/);
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
  const background = await readBackgroundSource();
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
