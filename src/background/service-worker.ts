// Transitional source recovery: the service worker is now generated from this
// TypeScript entry. Remaining in-file module markers will be extracted one at a
// time under the generation architecture baseline.
// @ts-nocheck

import {
  BROWSER_LAUNCH_GAP_MS,
  MAX_BROWSER_CONCURRENCY,
  MAX_CONCURRENCY,
  cancelTask,
  complete,
  createQueueSnapshot,
  emptyQueue,
  enqueue,
  fail,
  reconcileQueue,
  restoreQueueSnapshot
} from "../domain/queue";
import { appendAspectRatioPrompt } from "../domain/aspect-ratio";
import { createTaskScopeKey, parseTaskScopeKey } from "./task-scope";
import { createTaskNotificationId, notificationIdToCanvasUrl } from "./notification-target";
import { isTerminalRunStatus } from "../domain/task-run";
import { isDuplicateTerminalRunEvent, projectRunToLegacyTask, resolveTaskRuntime, runEventPatch, runEventStatus } from "../domain/run-projection";
import { TaskRunRepository } from "../storage/task-run-repository";
import { NodeCanvasDatabase } from "../storage/database";
import { ProjectRepository } from "../storage/project-repository";
import { KeyedSerialQueue } from "./keyed-serial-queue";
import { base64ToBytes, bytesToBase64, decodeBase64, sha256Hex } from "./binary";
import { CHATGPT_ADAPTER_VERSION, isExtensionMessage } from "./protocol";
import { concreteChatGptConversationUrl, resolveTaskConversationUrl } from "./chatgpt-url";
import { probeAdapter, sendWithCurrentChatGptAdapter } from "./chatgpt-adapter-bridge";
import { TaskTabGrouper } from "./task-tab-grouper";
import { ConversationUnavailableError, TabRegistry } from "./tab-registry";
import { apiWorkerRequest, waitForApiWorkerJob } from "./api-worker-client";
import { cancelTeamGatewayJob, teamGatewayRequest, teamGatewayResultRequest, teamGatewaySettings } from "./team-gateway-http";
import { TEAM_TASKBOX_BASE_URL, TEAM_TASKBOX_WORKER_API_KEY } from "../team-taskbox-config";
import { applyTaskMessage, getTaskInputs } from "./generation-projector";

var database = new NodeCanvasDatabase();
var projectRepository = new ProjectRepository(database);
var taskRunRepository = new TaskRunRepository(database.runs);

// src/background/serviceWorker.ts
var tabRegistry = new TabRegistry(chrome.tabs, new TaskTabGrouper(chrome.tabs, chrome.tabGroups));
var projectWrites = new KeyedSerialQueue();
var schedulerWrites = new KeyedSerialQueue();
var activeTabWrites = new KeyedSerialQueue();
var queue = emptyQueue();
var pendingScopes = /* @__PURE__ */ new Map();
var browserTaskMessages = /* @__PURE__ */ new Map();
var resumedBrowserUrls = /* @__PURE__ */ new Map();
var browserRecoveryReloadedAt = /* @__PURE__ */ new Map();
var lastBrowserLaunchAt = 0;
var schedulerReady = chrome.storage.session.get(["schedulerState", "activeTaskTabs", "browserTaskMessages"]).then(async ({ schedulerState, activeTaskTabs, browserTaskMessages: storedBrowserTaskMessages }) => {
  const restored = restoreQueueSnapshot(schedulerState);
  queue = restored.queue;
  for (const [key, projectId] of restored.pendingScopes) {
    const scope = parseTaskScopeKey(key) ?? { projectId, taskId: key };
    pendingScopes.set(key, scope);
  }
  if (Array.isArray(activeTaskTabs)) {
    for (const entry of activeTaskTabs) {
      if (Array.isArray(entry) && typeof entry[0] === "string" && typeof entry[1] === "number") {
        tabRegistry.map(entry[0], entry[1]);
      }
    }
  }
  if (Array.isArray(storedBrowserTaskMessages)) {
    for (const entry of storedBrowserTaskMessages) if (Array.isArray(entry) && typeof entry[0] === "string") browserTaskMessages.set(entry[0], recoveryMessage(entry[1]));
    await saveBrowserTaskMessages();
  }
  await reconcileTaskRunProjections();
  for (const project of await projectRepository.listProjects()) {
    const latestRuns = await taskRunRepository.latestByProject(project.id);
    for (const task of project.graph.nodes) {
      if (task.kind !== "task" || task.generationMode !== "browser") continue;
      const runtime = resolveTaskRuntime(task, latestRuns.get(task.id));
      if (!runtime.active || !["sending", "submitted", "generating", "delivering"].includes(runtime.status)) continue;
      const conversationUrl = concreteChatGptConversationUrl(runtime.conversationUrl);
      if (!conversationUrl) continue;
      const key = createTaskScopeKey(project.id, task.id);
      const storedMessage = browserTaskMessages.get(key);
      browserTaskMessages.set(key, recoveryMessage({
          ...storedMessage,
          type: "EXECUTE_IN_CHATGPT_V3",
          projectId: project.id,
          taskId: task.id,
          prompt: appendAspectRatioPrompt(task.prompt, task.aspectRatio ?? "auto"),
          images: [],
          expectedConversationUrl: conversationUrl,
          startedAt: latestRuns.get(task.id)?.startedAt ?? Date.now(),
          submittedAt: latestRuns.get(task.id)?.updatedAt ?? Date.now(),
          phase: "submitted"
        }));
      if (!queue.running.includes(key)) queue.running.push(key);
      pendingScopes.set(key, { projectId: project.id, taskId: task.id });
      tabRegistry.map(key, void 0, conversationUrl);
    }
  }
  await saveBrowserTaskMessages();
  await saveScheduler();
});
void schedulerReady.then(() => {
  if (browserTaskMessages.size > 0) scheduleBrowserResultRecoveryAlarm();
});
async function saveBrowserTaskMessages() {
  await chrome.storage.session.set({ browserTaskMessages: [...browserTaskMessages] });
}
function recoveryMessage(message) {
  return { ...message, images: [] };
}
async function saveScheduler() {
  await chrome.storage.session.set({
    schedulerState: createQueueSnapshot(
      queue,
      new Map([...pendingScopes].map(([key, scope]) => [key, scope.projectId]))
    )
  });
}
chrome.action.onClicked.addListener(() => {
  void chrome.tabs.create({ url: chrome.runtime.getURL("index.html") });
});
async function waitForTabReady(tabId, timeoutMs = 30_000) {
  const current = await chrome.tabs.get(tabId);
  if (current.status === "complete") return;
  await new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(updated);
      chrome.tabs.onRemoved.removeListener(removed);
    };
    const updated = (changedId, info) => {
      if (changedId !== tabId || info.status !== "complete") return;
      cleanup();
      resolve();
    };
    const removed = (removedId) => {
      if (removedId !== tabId) return;
      cleanup();
      reject(new Error("ChatGPT任务标签页在准备完成前被关闭"));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("等待ChatGPT任务标签页就绪超过30秒"));
    }, timeoutMs);
    chrome.tabs.onUpdated.addListener(updated);
    chrome.tabs.onRemoved.addListener(removed);
  });
}
async function broadcast(message) {
  try {
    await chrome.runtime.sendMessage(message);
  } catch {
  }
}
async function persistAndBroadcast(message) {
  let applied = false;
  await projectWrites.run(message.projectId, async () => {
    await projectRepository.mutateGenerationState(message.projectId, async (project) => {
      const task = project.graph.nodes.find((node) => node.id === message.taskId && node.kind === "task");
      if (!task) return project;
      let run = await taskRunRepository.latest(message.projectId, message.taskId);
      if (!run) run = await taskRunRepository.start(message.projectId, message.taskId, task.generationMode === "api" ? "api" : task.generationMode === "team" ? "team" : task.generationMode === "team_web" ? "team_web" : "browser");
      const status = runEventStatus(message);
      if (!status || isDuplicateTerminalRunEvent(run.status, status)) return project;
      run = await taskRunRepository.advance(run.id, status, runEventPatch(message));
      applied = true;
      return applyTaskMessage(project, message, (blob) => projectRepository.saveAsset(blob), run);
    });
  });
  if (applied) await broadcast({ ...message, persisted: true });
}
async function reconcileTaskRunProjections() {
  for (const project of await projectRepository.listProjects()) {
    const latestRuns = await taskRunRepository.latestByProject(project.id);
    if (latestRuns.size === 0) continue;
    const needsProjection = project.graph.nodes.some((node) => {
      if (node.kind !== "task") return false;
      const run = latestRuns.get(node.id);
      if (!run) return false;
      const projection = projectRunToLegacyTask(run);
      return node.status !== projection.status
        || node.runtimeStatus !== projection.runtimeStatus
        || node.recoverableResult !== projection.recoverableResult
        || node.statusDetail !== projection.statusDetail
        || node.apiJobId !== projection.apiJobId
        || node.conversationUrl !== (projection.conversationUrl ?? node.conversationUrl);
    });
    if (!needsProjection) continue;
    await projectWrites.run(project.id, () => projectRepository.mutateProject(project.id, (current) => ({
      ...current,
      graph: {
        ...current.graph,
        nodes: current.graph.nodes.map((node) => {
          if (node.kind !== "task") return node;
          const run = latestRuns.get(node.id);
          if (!run) return node;
          const projection = projectRunToLegacyTask(run);
          return { ...node, ...projection, conversationUrl: projection.conversationUrl ?? node.conversationUrl };
        })
      }
    })));
  }
}
async function startTaskRun(projectId, taskId) {
  const project = await projectRepository.loadProject(projectId);
  const task = project?.graph.nodes.find((node) => node.id === taskId && node.kind === "task");
  if (!task) throw new Error("找不到本地任务");
  return taskRunRepository.start(projectId, taskId, task.generationMode === "api" ? "api" : task.generationMode === "team" ? "team" : task.generationMode === "team_web" ? "team_web" : "browser");
}
async function removeActiveScope(key) {
  await activeTabWrites.run("active-tabs", async () => {
    const state = await chrome.storage.session.get(["activeTaskScopes", "activeTaskTabs"]);
    const active = new Map(
      Array.isArray(state.activeTaskScopes) ? state.activeTaskScopes : []
    );
    active.delete(key);
    const tabs = new Map(
      Array.isArray(state.activeTaskTabs) ? state.activeTaskTabs : []
    );
    tabs.delete(key);
    await chrome.storage.session.set({ activeTaskScopes: [...active], activeTaskTabs: [...tabs] });
  });
}
async function rememberActiveTab(key, tabId) {
  await activeTabWrites.run("active-tabs", async () => {
    const state = await chrome.storage.session.get("activeTaskTabs");
    const tabs = new Map(
      Array.isArray(state.activeTaskTabs) ? state.activeTaskTabs : []
    );
    tabs.set(key, tabId);
    await chrome.storage.session.set({ activeTaskTabs: [...tabs] });
  });
}
var API_RECOVERY_ALARM = "pixel-flow-api-recovery";
var BROWSER_RESULT_RECOVERY_ALARM = "pixel-flow-browser-result-recovery";
var TEAM_WEB_WORKER_ALARM = "pixel-flow-team-web-worker";
var TEAM_WEB_PROJECT_ID = "pixel-flow-team-web-worker";
var TEAM_WEB_ACTIVE_STORAGE = "pixelFlowTeamWebWorkerActiveJob";
var TEAM_WEB_ACTIVE_JOBS_STORAGE = "pixelFlowTeamWebWorkerActiveJobs";
const TEAM_WEB_MAX_CONCURRENCY = 5;
const activeTeamWebJobs = new Map();
const teamWebDeliveries = new Map();
const teamResultDownloads = new Map();
let teamWebTickPromise;
function singleFlight(map, key, run) {
  if (map.has(key)) return map.get(key);
  const pending = Promise.resolve().then(run);
  map.set(key, pending);
  pending.catch(() => { if (map.get(key) === pending) map.delete(key); });
  return pending;
}
var teamWebWorkerReady = Promise.all([
  schedulerReady,
  chrome.storage.local.get([TEAM_WEB_ACTIVE_STORAGE, TEAM_WEB_ACTIVE_JOBS_STORAGE])
]).then(([, stored]) => {
  const restored = Array.isArray(stored[TEAM_WEB_ACTIVE_JOBS_STORAGE]) ? stored[TEAM_WEB_ACTIVE_JOBS_STORAGE] : stored[TEAM_WEB_ACTIVE_STORAGE] ? [stored[TEAM_WEB_ACTIVE_STORAGE]] : [];
  for (const active of restored.filter(item => item?.job?.id)) {
    activeTeamWebJobs.set(active.job.id, active);
    const conversationUrl = concreteChatGptConversationUrl(active.conversationUrl);
    if (!conversationUrl) continue;
    const key = createTaskScopeKey(TEAM_WEB_PROJECT_ID, active.job.id);
    const message = recoveryMessage({
    type: "EXECUTE_IN_CHATGPT_V3",
    projectId: TEAM_WEB_PROJECT_ID,
    taskId: active.job.id,
    prompt: active.job.prompt,
    images: [],
    expectedConversationUrl: conversationUrl,
    startedAt: active.startedAt,
    submittedAt: active.submittedAt ?? active.startedAt,
    phase: "submitted"
  });
    browserTaskMessages.set(key, message);
    tabRegistry.map(key, void 0, conversationUrl);
  }
  if (activeTeamWebJobs.size) scheduleBrowserResultRecoveryAlarm();
});
void teamWebWorkerReady.then(() => teamWebWorkerTick()).catch(() => void 0);
function scheduleApiRecoveryAlarm() {
  chrome.alarms.create(API_RECOVERY_ALARM, { delayInMinutes: 0.5, periodInMinutes: 0.5 });
}
function scheduleBrowserResultRecoveryAlarm() {
  chrome.alarms.create(BROWSER_RESULT_RECOVERY_ALARM, { delayInMinutes: 0.5, periodInMinutes: 0.5 });
}
function scheduleTeamWebWorkerAlarm() {
  chrome.alarms.create(TEAM_WEB_WORKER_ALARM, { delayInMinutes: 0.5, periodInMinutes: 0.5 });
}
async function reconcileBrowserTaskResults() {
  await schedulerReady;
  if (browserTaskMessages.size === 0) {
    await chrome.alarms.clear(BROWSER_RESULT_RECOVERY_ALARM);
    return;
  }
  for (const [key, message] of browserTaskMessages) {
    if (!queue.running.includes(key) && ![...activeTeamWebJobs.values()].some(active => createTaskScopeKey(TEAM_WEB_PROJECT_ID, active.job.id) === key)) continue;
    try {
      const mapped = await tabRegistry.ensure(key, message.expectedConversationUrl);
      let adapterState = await probeAdapter(chrome.tabs, mapped.tabId, message);
      if (!adapterState) {
        await chrome.scripting.executeScript({ target: { tabId: mapped.tabId }, files: ["contentScript.js"] });
        adapterState = await probeAdapter(chrome.tabs, mapped.tabId, message);
      }
      if (message.phase !== "submitted" || adapterState?.submitActive || teamWebDeliveries.has(message.taskId)) continue;
      const concreteUrl = concreteChatGptConversationUrl(mapped.conversationUrl);
      if (!concreteUrl) continue;
      await chrome.tabs.sendMessage(mapped.tabId, { ...message, type: "RESUME_CHATGPT_RESULT", images: [] });
      const lastReloadedAt = browserRecoveryReloadedAt.get(key) ?? 0;
      if (Date.now() - (message.submittedAt ?? message.startedAt ?? 0) > 12e4 && Date.now() - lastReloadedAt > 9e4) {
        browserRecoveryReloadedAt.set(key, Date.now());
        await chrome.tabs.reload(mapped.tabId);
      }
    } catch {
    }
  }
}
const TEAM_GATEWAY_CHUNK_CHARACTERS = 6e5;
const TEAM_GATEWAY_CHUNK_PACE_MS = 250;
async function submitTeamGatewayJob(input, existingJobId, onJobCreated) {
  const health = await teamGatewayRequest("/health");
  if (Number(health.protocolVersion || 1) < 2) {
    const submitted = await teamGatewayRequest("/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    });
    await onJobCreated?.(submitted.id);
    return submitted;
  }
  if (Number(health.protocolVersion || 1) < 4) {
    throw new Error("团队任务箱版本过旧，暂不支持 Flare / Sunburst 模型选择");
  }
  if (input.provider === "chatgpt_web" && Number(health.protocolVersion || 1) < 5) {
    throw new Error("团队任务箱版本过旧，暂不支持 Team Web");
  }
  const images = Array.isArray(input.images) ? input.images : [];
  const submitted = existingJobId ? { id: existingJobId } : await teamGatewayRequest("/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestId: input.requestId,
        prompt: input.prompt,
        ratio: input.ratio,
        imageCount: images.length,
        resultDelivery: input.provider === "chatgpt_web" && Number(health.protocolVersion) >= 10 ? "storage" : input.provider === "chatgpt_web" && Number(health.protocolVersion) >= 6 ? "bundle" : "direct",
        imageModel: input.imageModel === "sunburst" ? "sunburst" : "flare",
        provider: input.provider === "chatgpt_web" ? "chatgpt_web" : "codex_cloud"
      })
  });
  await onJobCreated?.(submitted.id);
  try {
    for (let imageIndex = 0; imageIndex < images.length; imageIndex += 1) {
      const image = images[imageIndex];
      const totalChunks = Math.max(1, Math.ceil(image.base64.length / TEAM_GATEWAY_CHUNK_CHARACTERS));
      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
        await teamGatewayRequest(`/jobs/${submitted.id}/input-chunks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageIndex,
            chunkIndex,
            totalChunks,
            name: image.name,
            mimeType: image.mimeType,
            base64: image.base64.slice(chunkIndex * TEAM_GATEWAY_CHUNK_CHARACTERS, (chunkIndex + 1) * TEAM_GATEWAY_CHUNK_CHARACTERS)
          })
        });
        if (chunkIndex + 1 < totalChunks) await new Promise((resolveWait) => setTimeout(resolveWait, TEAM_GATEWAY_CHUNK_PACE_MS));
      }
    }
    return await teamGatewayRequest(`/jobs/${submitted.id}/submit`, { method: "POST" });
  } catch (error) {
    void teamGatewayRequest(`/jobs/${submitted.id}`, { method: "DELETE" }).catch(() => {});
    throw error;
  }
}
async function downloadTeamGatewayImages(job) {
  return singleFlight(teamResultDownloads, job.id, () => downloadTeamGatewayImagesOnce(job));
}
async function downloadTeamGatewayImagesOnce(job) {
  const images = Array.isArray(job.images) ? job.images : [];
  if (images.every((image) => typeof image.base64 === "string")) return images;
  return (await Promise.all(images.map(async (image, fallbackIndex) => {
    if (typeof image.downloadUrl === "string") {
      if (!image.downloadUrl.startsWith("https://")) throw new Error("团队生图直传地址无效");
      let response;
      if (typeof image.proxyPath === "string" && image.proxyPath.startsWith("/jobs/")) {
        try {
          response = await teamGatewayResultRequest(image.proxyPath);
        } catch (error) {
          if (Number(error?.status || 0) > 0 && Number(error.status) < 500) throw error;
          response = await fetch(image.downloadUrl, { cache: "no-store" });
        }
      } else {
        response = await fetch(image.downloadUrl, { cache: "no-store" });
      }
      if (!response.ok) throw new Error(`团队生图直传下载返回 HTTP ${response.status}`);
      const buffer = await response.arrayBuffer();
      if (Number.isInteger(image.byteLength) && buffer.byteLength !== image.byteLength) {
        throw new Error("团队生图直传文件大小校验失败");
      }
      if (typeof image.sha256 === "string" && await sha256Hex(buffer) !== image.sha256) {
        throw new Error("团队生图直传文件完整性校验失败");
      }
      if (image.mimeType === "application/vnd.pixel-flow.images+json") {
        const bundle = JSON.parse(new TextDecoder().decode(buffer));
        if (!Array.isArray(bundle.images) || bundle.images.length < 1 || bundle.images.length > 10) throw new Error("团队结果包格式无效");
        if (bundle.version === 1 && bundle.images.every(item => /^image\/(png|jpeg|webp)$/.test(item.mimeType) && typeof item.base64 === "string" && /^[A-Za-z0-9+/]+={0,2}$/.test(item.base64))) return bundle.images;
        if (bundle.version === 2 && bundle.images.every(item => /^image\/(png|jpeg|webp)$/.test(item.mimeType) && typeof item.downloadUrl === "string" && item.downloadUrl.startsWith("https://") && Number.isInteger(item.byteLength) && typeof item.sha256 === "string")) {
          return Promise.all(bundle.images.map(async item => {
            const response = await fetch(item.downloadUrl, { cache: "no-store" });
            if (!response.ok) throw new Error(`团队生图图片下载返回 HTTP ${response.status}`);
            const imageBuffer = await response.arrayBuffer();
            if (imageBuffer.byteLength !== item.byteLength || await sha256Hex(imageBuffer) !== item.sha256) throw new Error("团队生图图片完整性校验失败");
            return { base64: bytesToBase64(imageBuffer), mimeType: item.mimeType };
          }));
        }
        throw new Error("团队结果包格式无效");
      }
      return [{ base64: bytesToBase64(buffer), mimeType: image.mimeType || response.headers.get("Content-Type") || "image/png" }];
    }
    const imageIndex = Number.isInteger(image.imageIndex) ? image.imageIndex : fallbackIndex;
    const chunks = [];
    for (let chunkIndex = 0; chunkIndex < image.totalChunks; chunkIndex += 1) {
      const chunk = await teamGatewayRequest(`/jobs/${job.id}/result-chunks/${imageIndex}/${chunkIndex}`);
      chunks.push(chunk.base64);
      if (chunkIndex + 1 < image.totalChunks) await new Promise((resolveWait) => setTimeout(resolveWait, TEAM_GATEWAY_CHUNK_PACE_MS));
    }
    return {
      base64: chunks.join(""),
      mimeType: image.mimeType || "image/png"
    };
  }))).flat();
}
async function createTeamPreview(image) {
  if (typeof createImageBitmap !== "function" || typeof OffscreenCanvas !== "function") return null;
  const source = new Blob([base64ToBytes(image.base64)], { type: image.mimeType || "image/png" });
  const bitmap = await createImageBitmap(source);
  try {
    const scale = Math.min(1, 480 / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, width, height);
    const preview = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.78 });
    return {
      base64: bytesToBase64(await preview.arrayBuffer()),
      mimeType: "image/jpeg"
    };
  } finally {
    bitmap.close();
  }
}
async function teamWebWorkerSettings() {
  const values = await chrome.storage.local.get([
    "pixelFlowTeamWebWorkerRelayUrl",
    "pixelFlowTeamWebWorkerDeviceToken",
    "pixelFlowTeamWebWorkerId",
    "pixelFlowTeamWebWorkerEnabled"
  ]);
  const relayUrl = TEAM_TASKBOX_BASE_URL;
  const deviceToken = typeof values.pixelFlowTeamWebWorkerDeviceToken === "string" ? values.pixelFlowTeamWebWorkerDeviceToken.trim() : "";
  const workerId = typeof values.pixelFlowTeamWebWorkerId === "string" ? values.pixelFlowTeamWebWorkerId.trim() : "";
  return { relayUrl, deviceToken, workerId, enabled: values.pixelFlowTeamWebWorkerEnabled === true };
}
function teamWebWorkerErrorMessage(payload, status) {
  const message = typeof payload?.message === "string" ? payload.message.trim() : "";
  if (message) return message;
  const error = payload?.error;
  if (typeof error === "string" && error.trim()) return error.trim();
  if (error && typeof error.message === "string" && error.message.trim()) return error.message.trim();
  if (error && typeof error.code === "string" && error.code.trim()) return error.code.trim();
  return `网页生图任务箱返回 HTTP ${status}`;
}
async function teamWebWorkerRequest(path, options = {}) {
  const settings = await teamWebWorkerSettings();
  if (!settings.enabled || !settings.relayUrl || !settings.deviceToken || !settings.workerId) throw new Error("网页生图机尚未配对或已暂停");
  let lastError;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(`${settings.relayUrl}/web-worker${path}`, {
        ...options,
        headers: {
          Authorization: `Bearer ${TEAM_TASKBOX_WORKER_API_KEY}`,
          "X-Pixel-Web-Worker-Token": settings.deviceToken,
          ...(options.body ? { "Content-Type": "application/json" } : {}),
          ...(options.headers || {})
        }
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok) return payload;
      const error = new Error(teamWebWorkerErrorMessage(payload, response.status));
      error.status = response.status;
      if (response.status !== 429 && response.status < 500) throw error;
      lastError = error;
      if (attempt === 4) throw error;
      const retryAfter = Number(response.headers.get("Retry-After"));
      await new Promise((resolveWait) => setTimeout(resolveWait, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1e3 : Math.min(16e3, 1e3 * 2 ** attempt)));
    } catch (error) {
      if (Number.isFinite(Number(error?.status))) throw error;
      lastError = error;
      if (attempt === 4) throw error;
      await new Promise((resolveWait) => setTimeout(resolveWait, Math.min(16e3, 1e3 * 2 ** attempt)));
    }
  }
  throw lastError ?? new Error("网页生图任务箱持续不可用");
}
async function saveActiveTeamWebJobs() {
  const jobs = [...activeTeamWebJobs.values()];
  if (jobs.length) await chrome.storage.local.set({ [TEAM_WEB_ACTIVE_JOBS_STORAGE]: jobs });
  else await chrome.storage.local.remove(TEAM_WEB_ACTIVE_JOBS_STORAGE);
  await chrome.storage.local.remove(TEAM_WEB_ACTIVE_STORAGE);
}
function activeTeamWebKey(active) {
  return active?.job?.id ? createTaskScopeKey(TEAM_WEB_PROJECT_ID, active.job.id) : "";
}
async function downloadTeamWebInputs(job) {
  return Promise.all((job.inputImages || []).map(async (descriptor) => {
    const chunks = [];
    for (let chunkIndex = 0; chunkIndex < descriptor.totalChunks; chunkIndex += 1) {
      const chunk = await teamWebWorkerRequest(`/jobs/${job.id}/input-chunks/${descriptor.imageIndex}/${chunkIndex}`);
      chunks.push(chunk.base64);
    }
    return {
      name: descriptor.name,
      mimeType: descriptor.mimeType || "image/png",
      base64: chunks.join("")
    };
  }));
}
async function uploadTeamWebImage(jobId, image, endpoint, imageIndex, name) {
  const totalChunks = Math.max(1, Math.ceil(image.base64.length / TEAM_GATEWAY_CHUNK_CHARACTERS));
  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
    await teamWebWorkerRequest(`/jobs/${jobId}/${endpoint}`, {
      method: "POST",
      body: JSON.stringify({
        imageIndex,
        chunkIndex,
        totalChunks,
        name,
        mimeType: image.mimeType || "image/png",
        base64: image.base64.slice(chunkIndex * TEAM_GATEWAY_CHUNK_CHARACTERS, (chunkIndex + 1) * TEAM_GATEWAY_CHUNK_CHARACTERS)
      })
    });
    if (chunkIndex + 1 < totalChunks) await new Promise((resolveWait) => setTimeout(resolveWait, TEAM_GATEWAY_CHUNK_PACE_MS));
  }
}
async function uploadTeamWebStorageResult(jobId, image, imageIndex) {
  const mimeType = image.mimeType || "image/png";
  if (!/^image\/(png|jpeg|webp)$/.test(mimeType)) throw new Error("网页生图结果格式无效");
  const bytes = base64ToBytes(image.base64);
  const metadata = {
    imageIndex,
    fileName: `result-${imageIndex + 1}.${mimeType === "image/jpeg" ? "jpg" : mimeType.slice(6)}`,
    mimeType,
    byteLength: bytes.byteLength,
    sha256: await sha256Hex(bytes.buffer)
  };
  const ticket = await teamWebWorkerRequest(`/jobs/${jobId}/result-storage-upload`, {
    method: "POST", body: JSON.stringify(metadata)
  });
  const upload = await fetch(ticket.uploadUrl, {
    method: "PUT", headers: { "Content-Type": mimeType }, body: bytes
  });
  if (!upload.ok) throw new Error(`对象存储上传返回 HTTP ${upload.status}`);
  await teamWebWorkerRequest(`/jobs/${jobId}/result-storage-complete`, {
    method: "POST", body: JSON.stringify({ ...metadata, uploadId: ticket.uploadId, eTag: upload.headers.get("Etag") || "" })
  });
}
async function clearActiveTeamWebJob(closeTab = true, expected) {
  if (!expected || activeTeamWebJobs.get(expected.job.id) !== expected) return;
  const key = activeTeamWebKey(expected);
  if (key) {
    browserTaskMessages.delete(key);
    resumedBrowserUrls.delete(key);
    browserRecoveryReloadedAt.delete(key);
    await saveBrowserTaskMessages();
    await removeActiveScope(key);
    if (closeTab) await tabRegistry.hibernate(key).catch(() => void 0);
  }
  if (activeTeamWebJobs.get(expected.job.id) !== expected) return;
  activeTeamWebJobs.delete(expected.job.id);
  teamWebDeliveries.delete(expected.job.id);
  await saveActiveTeamWebJobs();
  if (browserTaskMessages.size === 0) await chrome.alarms.clear(BROWSER_RESULT_RECOVERY_ALARM);
}
async function failActiveTeamWebJob(reason, detail, expected) {
  if (!expected || activeTeamWebJobs.get(expected.job.id) !== expected) return;
  const job = expected.job;
  if (!job) return;
  await teamWebWorkerRequest(`/jobs/${job.id}/fail`, {
    method: "POST",
    body: JSON.stringify({ error: detail || "ChatGPT 网页执行失败" })
  }).catch(() => void 0);
  if (activeTeamWebJobs.get(expected.job.id) !== expected) return;
  if (["login_required", "verification_required", "usage_limited"].includes(reason)) {
    await chrome.storage.local.set({ pixelFlowTeamWebWorkerEnabled: false });
  }
  await clearActiveTeamWebJob(true, expected);
}
async function completeActiveTeamWebJob(message) {
  const active = activeTeamWebJobs.get(message.taskId);
  if (!active || active.job.id !== message.taskId) return;
  return singleFlight(teamWebDeliveries, active.job.id, () => deliverTeamWebJob(message, active)).catch(async (error) => {
    const status = Number(error?.status);
    const retryable = !Number.isFinite(status) || status === 429 || status >= 500;
    if (!retryable) {
      await failActiveTeamWebJob("delivery_error", typeof error?.message === "string" ? error.message : String(error), active);
      return;
    }
    if (activeTeamWebJobs.get(active.job.id) !== active) return;
    active.phase = "delivering";
    active.deliveryError = typeof error?.message === "string" ? error.message : String(error);
    await saveActiveTeamWebJobs();
    scheduleBrowserResultRecoveryAlarm();
    await teamWebWorkerRequest(`/jobs/${active.job.id}/heartbeat`, {
      method: "POST",
      body: JSON.stringify({ phase: "delivering" })
    }).catch(() => void 0);
  });
}
async function deliverTeamWebJob(message, active) {
  if (!active || !Array.isArray(message.images) || message.images.length === 0) throw new Error("ChatGPT 已结束，但没有取得生成图片");
  const generatedAt = Date.now();
  const generationStartedAt = active.generationStartedAt ?? active.submittedAt ?? active.startedAt;
  await teamWebWorkerRequest(`/jobs/${active.job.id}/generated`, {
    method: "POST",
    body: JSON.stringify({ generationStartedAt, generatedAt, generationDurationMs: Math.max(0, generatedAt - generationStartedAt) })
  });
  active.phase = "delivering";
  await saveActiveTeamWebJobs();
  if (active.job.resultDelivery === "bundle") {
    // Both bundle endpoints belonged to the retired Cloudflare staging relay.
    // Any legacy bundle task claimed by a direct worker must use taskbox
    // storage, independent of the combined result size.
    await teamWebWorkerRequest(`/jobs/${active.job.id}/use-storage`, { method: "POST" });
    await Promise.all(message.images.map((image, imageIndex) => uploadTeamWebStorageResult(active.job.id, image, imageIndex)));
    await teamWebWorkerRequest(`/jobs/${active.job.id}/result-storage-finalize`, {
      method: "POST",
      body: JSON.stringify({ resultCount: message.images.length })
    });
  } else if (active.job.resultDelivery === "storage") {
    await Promise.all(message.images.map((image, imageIndex) => uploadTeamWebStorageResult(active.job.id, image, imageIndex)));
    await teamWebWorkerRequest(`/jobs/${active.job.id}/result-storage-finalize`, {
      method: "POST", body: JSON.stringify({ resultCount: message.images.length })
    });
  } else {
    for (let imageIndex = 0; imageIndex < message.images.length; imageIndex += 1) {
      await uploadTeamWebImage(active.job.id, message.images[imageIndex], "result-chunks", imageIndex, `result-${imageIndex + 1}.png`);
    }
  }
  if (active.job.resultDelivery === "chunks") await teamWebWorkerRequest(`/jobs/${active.job.id}/complete`, {
    method: "POST", body: JSON.stringify({ resultCount: message.images.length })
  });
  const preview = await createTeamPreview(message.images[0]).catch(() => null);
  if (preview) await uploadTeamWebImage(active.job.id, preview, "preview-chunks", 0, "preview-1.jpg").catch(() => void 0);
  await clearActiveTeamWebJob(true, active);
  await updateScheduler(async () => void 0);
  await chrome.notifications.create(`team-web-worker:${active.job.id}`, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icon.svg"),
    title: "Team Web 已完成",
    message: `已回传 ${message.images.length} 张图片`
  });
  setTimeout(() => void teamWebWorkerTick(), 1e3);
}
async function handleTeamWebPageTaskMessage(message, senderTab) {
  await teamWebWorkerReady;
  const active = activeTeamWebJobs.get(message.taskId);
  if (message.projectId !== TEAM_WEB_PROJECT_ID || message.taskId !== active?.job.id) return false;
  const key = activeTeamWebKey(active);
  if (!key || !tabRegistry.ownsTab(key, senderTab?.id)) return false;
  if (message.type !== "TASK_RESULT" && teamWebDeliveries.has(message.taskId)) return true;
  const conversationUrl = resolveTaskConversationUrl(message, senderTab?.url);
  if (conversationUrl) {
    tabRegistry.updateConversation(key, conversationUrl);
    active.conversationUrl = conversationUrl;
  }
  if (message.type === "TASK_STATUS") {
    const pending = browserTaskMessages.get(key);
    const phase = message.status === "generating" ? "submitted" : message.status;
    if (pending) {
      browserTaskMessages.set(key, { ...pending, phase, submittedAt: phase === "submitted" ? pending.submittedAt ?? Date.now() : pending.submittedAt });
      await saveBrowserTaskMessages();
    }
    if (activeTeamWebJobs.get(active.job.id) !== active) return true;
    active.phase = phase;
    if (phase === "submitted") {
      active.submittedAt ??= Date.now();
      active.generationStartedAt ??= Date.now();
    }
    await saveActiveTeamWebJobs();
    await teamWebWorkerRequest(`/jobs/${active.job.id}/heartbeat`, { method: "POST", body: JSON.stringify({ phase: active.phase }) }).catch(() => void 0);
    if (message.status === "manual_action") {
      await teamWebWorkerRequest("/heartbeat", { method: "POST", body: JSON.stringify({ state: "needs_action", detail: message.detail || "请在执行机完成 ChatGPT 手动发送" }) }).catch(() => void 0);
    }
    return true;
  }
  if (message.type === "TASK_RESULT") {
    const expected = active;
    await completeActiveTeamWebJob(message).catch(async (error) => {
      await failActiveTeamWebJob("delivery_error", error instanceof Error ? error.message : String(error), expected);
    });
    return true;
  }
  if (message.type === "TASK_ERROR") {
    if (teamWebDeliveries.has(message.taskId)) return true;
    await failActiveTeamWebJob(message.reason, message.detail, active);
    return true;
  }
  return false;
}
async function startActiveTeamWebJob(active) {
  if (!active) return;
  const key = activeTeamWebKey(active);
  const waitMs = Math.max(0, BROWSER_LAUNCH_GAP_MS - (Date.now() - lastBrowserLaunchAt));
  if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
  lastBrowserLaunchAt = Date.now();
  const images = await downloadTeamWebInputs(active.job);
  const mapped = await tabRegistry.ensure(key, active.conversationUrl);
  await rememberActiveTab(key, mapped.tabId);
  await waitForTabReady(mapped.tabId);
  const message = {
    type: "EXECUTE_IN_CHATGPT",
    projectId: TEAM_WEB_PROJECT_ID,
    taskId: active.job.id,
    expectedConversationUrl: active.conversationUrl,
    prompt: appendAspectRatioPrompt(active.job.prompt, active.job.ratio ?? "auto"),
    images,
    startedAt: active.startedAt,
    phase: "preparing_tab"
  };
  browserTaskMessages.set(key, recoveryMessage(message));
  await saveBrowserTaskMessages();
  scheduleBrowserResultRecoveryAlarm();
  await sendWithCurrentChatGptAdapter(chrome.tabs, chrome.scripting, mapped.tabId, message);
}
async function teamWebWorkerTick() {
  if (teamWebTickPromise) return teamWebTickPromise;
  teamWebTickPromise = teamWebWorkerTickOnce().finally(() => { teamWebTickPromise = undefined; });
  return teamWebTickPromise;
}
async function teamWebWorkerTickOnce() {
  await Promise.all([schedulerReady, teamWebWorkerReady]);
  const settings = await teamWebWorkerSettings();
  if (!settings.enabled || !settings.relayUrl || !settings.deviceToken || !settings.workerId) {
    await chrome.alarms.clear(TEAM_WEB_WORKER_ALARM);
    return;
  }
  scheduleTeamWebWorkerAlarm();
  for (const expected of [...activeTeamWebJobs.values()]) {
    let remote;
    try {
      remote = await teamWebWorkerRequest(`/jobs/${expected.job.id}/status`);
    } catch (error) {
      const status = Number(error?.status);
      if (status === 404 || status === 410) {
        await clearActiveTeamWebJob(true, expected);
        await updateScheduler(async () => void 0);
        return;
      }
    }
    if (remote && ["completed", "failed", "canceled"].includes(remote.status)) {
      await clearActiveTeamWebJob(true, expected);
      await updateScheduler(async () => void 0);
      return;
    }
    const key = activeTeamWebKey(expected);
    if (!browserTaskMessages.has(key) && !concreteChatGptConversationUrl(expected.conversationUrl)) {
      await failActiveTeamWebJob("worker_interrupted", "网页生图机在建立 ChatGPT 对话前被中断，请重新运行该任务", expected);
      continue;
    }
    if (!concreteChatGptConversationUrl(expected.conversationUrl)) {
      await startActiveTeamWebJob(expected).catch(async (error) => {
        await failActiveTeamWebJob("start_error", error instanceof Error ? error.message : String(error), expected);
      });
      continue;
    }
    await teamWebWorkerRequest(`/jobs/${expected.job.id}/heartbeat`, { method: "POST", body: JSON.stringify({ phase: expected.phase }) }).catch(() => void 0);
  }
  let localBrowserRunning = 0;
  for (const key of queue.running) if (await taskGenerationMode(key) === "browser") localBrowserRunning += 1;
  while (activeTeamWebJobs.size + localBrowserRunning < TEAM_WEB_MAX_CONCURRENCY) {
    const claimed = await teamWebWorkerRequest("/claim", { method: "POST", body: JSON.stringify({ supportsBundle: true, supportsStorage: true }) });
    if (!claimed.job || activeTeamWebJobs.has(claimed.job.id)) break;
    const expected = { job: claimed.job, startedAt: Date.now(), phase: "claimed" };
    activeTeamWebJobs.set(expected.job.id, expected);
    await saveActiveTeamWebJobs();
    await startActiveTeamWebJob(expected).catch(async (error) => {
      await failActiveTeamWebJob("start_error", error instanceof Error ? error.message : String(error), expected);
    });
  }
}
async function finalizeTeamGatewayJob(jobId, images) {
  try {
    const preview = images[0] ? await createTeamPreview(images[0]) : null;
    if (preview) {
      const job = await teamGatewayRequest(`/jobs/${jobId}`);
      if (job.provider === "chatgpt_web") { await teamGatewayRequest(`/jobs/${jobId}/acknowledge`, { method: "POST" }); teamResultDownloads.delete(jobId); return; }
      const totalChunks = Math.max(1, Math.ceil(preview.base64.length / TEAM_GATEWAY_CHUNK_CHARACTERS));
      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
        await teamGatewayRequest(`/jobs/${jobId}/preview-chunks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageIndex: 0,
            chunkIndex,
            totalChunks,
            name: "preview-1.jpg",
            mimeType: preview.mimeType,
            base64: preview.base64.slice(chunkIndex * TEAM_GATEWAY_CHUNK_CHARACTERS, (chunkIndex + 1) * TEAM_GATEWAY_CHUNK_CHARACTERS)
          })
        });
      }
    }
  } catch {
  }
  await teamGatewayRequest(`/jobs/${jobId}/acknowledge`, { method: "POST" });
  teamResultDownloads.delete(jobId);
}
async function waitForTeamGatewayJob(jobId, onProgress) {
  let lastDetail;
  while (true) {
    const job = await readTeamGatewayJob(jobId, async () => {
      const reconnectDetail = "团队服务暂时不可达，正在自动重连";
      if (reconnectDetail !== lastDetail) { lastDetail = reconnectDetail; await onProgress?.(reconnectDetail, "submitted"); }
    });
    if (job.status === "completed") {
      await onProgress?.("图片已生成，正在写回画布", "delivering");
      return downloadTeamGatewayImages(job);
    }
    if (job.status === "failed") throw new Error(job.error || "团队生图失败");
    if (job.status === "canceled") throw new Error("团队任务已取消");
    const generated = Boolean(job.generatedAt || job.generated_at);
    const detail = job.detail || (job.status === "queued" ? "等待团队执行机接单" : generated ? "图片已生成，正在回传结果" : "团队执行机处理中");
    const runStatus = job.status === "uploading" ? "uploading" : job.status === "queued" ? "submitted" : generated || /回传|写回/.test(detail) ? "delivering" : "generating";
    if (detail !== lastDetail) { lastDetail = detail; await onProgress?.(detail, runStatus); }
    await new Promise((resolve) => setTimeout(resolve, 2e3));
  }
}
async function readTeamGatewayJob(jobId, onReconnect) {
  while (true) {
    try {
      return await teamGatewayRequest(`/jobs/${jobId}`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      if (detail !== "无法连接团队生图服务，请检查网关地址、网络和服务状态") throw error;
      await onReconnect?.(error);
      await new Promise((resolve) => setTimeout(resolve, 2e3));
    }
  }
}
async function recoverTeamTaskResult(projectId, taskId, requestedJobId) {
  const project = await projectRepository.loadProject(projectId);
  const task = project?.graph.nodes.find((node) => node.id === taskId && node.kind === "task");
  if (!project || !task || !["team", "team_web"].includes(task.generationMode)) throw new Error("找不到团队生图任务");
  const run = await taskRunRepository.latest(projectId, taskId);
  const jobId = requestedJobId || run?.providerJobId;
  if (!jobId) throw new Error("没有可恢复的云端任务");
  const existingResults = project.graph.edges.filter(
    (edge) => edge.source === taskId && edge.kind === "output"
  );
  if (existingResults.length > 0 && (run ? run.status === "completed" : task.status === "completed")) {
    return { recovered: false, existingResults: existingResults.length };
  }
  const job = await teamGatewayRequest(`/jobs/${jobId}`);
  if (job.status !== "completed") throw new Error(job.error || `云端任务尚未完成：${job.status}`);
  const images = await downloadTeamGatewayImages(job);
  if (!images.length) throw new Error("云端任务没有可恢复的图片");
  await startTaskRun(projectId, taskId);
  await persistAndBroadcast({ type: "TASK_STATUS", projectId, taskId, status: "generating", runStatus: "delivering", detail: "正在恢复云端结果", apiJobId: jobId });
  await persistAndBroadcast({ type: "TASK_RESULT", projectId, taskId, images, responseText: "" });
  await finalizeTeamGatewayJob(jobId, images).catch(() => {});
  return { recovered: true, resultCount: images.length, jobId };
}
async function prepareTaskRequest(project, taskId, task) {
  const inputs = getTaskInputs(project.graph, taskId);
  const text = inputs
    .filter((input) => input.node.kind === "text")
    .map((input) => input.node.kind === "text" ? input.node.text : "")
    .filter(Boolean);
  const images = await Promise.all(inputs.flatMap((input) => {
    if (input.node.kind !== "image" && input.node.kind !== "result") return [];
    const assetNode = input.node;
    return [projectRepository.loadAsset(assetNode.assetId).then(async (blob) => {
      if (!blob) throw new Error(`找不到参考图片：${assetNode.assetId}`);
      return {
        name: `${input.label}.${blob.type.split("/")[1] || "png"}`,
        mimeType: blob.type || "image/png",
        base64: bytesToBase64(await blob.arrayBuffer())
      };
    })];
  }));
  const ratio = task.aspectRatio ?? "auto";
  return {
    prompt: appendAspectRatioPrompt([...text, task.prompt].filter(Boolean).join("\n\n"), ratio),
    ratio,
    images
  };
}
async function executeApiTask(projectId, taskId, project, task) {
  const key = createTaskScopeKey(projectId, taskId);
  try {
    const { pixelFlowApiKey } = await chrome.storage.local.get("pixelFlowApiKey");
    if (typeof pixelFlowApiKey !== "string" || !pixelFlowApiKey.trim()) {
      throw new Error("请先点击顶部“API 设置”并保存 API Key");
    }
    const request = await prepareTaskRequest(project, taskId, task);
    let jobId = task.apiJobId;
    if (!jobId) {
      await persistAndBroadcast({ type: "TASK_STATUS", projectId, taskId, status: "sending", detail: void 0 });
      const submitted = await apiWorkerRequest("/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: pixelFlowApiKey,
          ...request
        })
      });
      jobId = submitted.id;
    }
    await persistAndBroadcast({ type: "TASK_STATUS", projectId, taskId, status: "generating", detail: void 0, apiJobId: jobId });
    scheduleApiRecoveryAlarm();
    const images = await waitForApiWorkerJob(jobId);
    const handled = await updateScheduler(async () => {
      if (!queue.running.includes(key)) return false;
      await persistAndBroadcast({ type: "TASK_RESULT", projectId, taskId, images, responseText: "" });
      queue = complete(queue, key);
      pendingScopes.delete(key);
      await removeActiveScope(key);
      return true;
    });
    if (!handled) return;
    void apiWorkerRequest(`/jobs/${jobId}`, { method: "DELETE" }).catch(() => {});
    await chrome.notifications.create(createTaskNotificationId(projectId, taskId), {
      type: "basic",
      iconUrl: chrome.runtime.getURL("icon.svg"),
      title: "API 生图完成",
      message: `已生成 ${images.length} 张图片`
    });
  } catch (error) {
    const handled = await updateScheduler(async () => {
      if (!queue.running.includes(key)) return false;
      queue = fail(queue, key, "api_error");
      pendingScopes.delete(key);
      await removeActiveScope(key);
      return true;
    });
    if (!handled) return;
    await persistAndBroadcast({
      type: "TASK_ERROR",
      projectId,
      taskId,
      reason: "api_error",
      detail: error instanceof Error ? error.message : "API 生图失败"
    });
  }
}
async function executeTeamTask(projectId, taskId, project, task) {
  const key = createTaskScopeKey(projectId, taskId);
  try {
    await teamGatewaySettings();
    const request = await prepareTaskRequest(project, taskId, task);
    const runs = await taskRunRepository.list(projectId, taskId);
    const run = runs.at(-1);
    if (!run || isTerminalRunStatus(run.status)) throw new Error("找不到可恢复的团队任务运行");
    const previousRun = runs.at(-2);
    const submissionRunId = previousRun?.detail === "Invalid task run transition: sending -> uploading" ? previousRun.id : run.id;
    let jobId = task.apiJobId;
    let resumeUpload = false;
    if (jobId && run.status === "uploading") {
      const remoteJob = await readTeamGatewayJob(jobId);
      resumeUpload = remoteJob.status === "uploading";
      if (!resumeUpload) {
        await persistAndBroadcast({ type: "TASK_STATUS", projectId, taskId, status: "generating", runStatus: "submitted", detail: "云端任务已提交，正在恢复进度", apiJobId: jobId });
      }
    }
    if (!jobId || resumeUpload) {
      if (!jobId) await persistAndBroadcast({ type: "TASK_STATUS", projectId, taskId, status: "sending", detail: void 0 });
      const submitted = await submitTeamGatewayJob({
        requestId: `${projectId}:${taskId}:${submissionRunId}`,
        ...request,
        imageModel: task.teamImageModel === "sunburst" ? "sunburst" : "flare",
        provider: task.generationMode === "team_web" ? "chatgpt_web" : "codex_cloud",
      }, jobId, async (createdJobId) => {
        jobId = createdJobId;
        await persistAndBroadcast({
          type: "TASK_STATUS",
          projectId,
          taskId,
          status: "uploading",
          runStatus: "uploading",
          detail: "云端任务已创建，正在上传输入",
          apiJobId: createdJobId
        });
      });
      jobId = submitted.id;
      await persistAndBroadcast({ type: "TASK_STATUS", projectId, taskId, status: "generating", runStatus: "submitted", detail: "任务已提交，等待执行机接单", apiJobId: jobId });
    }
    scheduleApiRecoveryAlarm();
    const images = await waitForTeamGatewayJob(jobId, (detail, runStatus) => persistAndBroadcast({ type: "TASK_STATUS", projectId, taskId, status: "generating", runStatus, detail, apiJobId: jobId }));
    const handled = await updateScheduler(async () => {
      if (!queue.running.includes(key)) return false;
      await persistAndBroadcast({ type: "TASK_RESULT", projectId, taskId, images, responseText: "" });
      queue = complete(queue, key);
      pendingScopes.delete(key);
      await removeActiveScope(key);
      return true;
    });
    if (!handled) return;
    await finalizeTeamGatewayJob(jobId, images).catch(() => {});
    await chrome.notifications.create(createTaskNotificationId(projectId, taskId), {
      type: "basic",
      iconUrl: chrome.runtime.getURL("icon.svg"),
      title: task.generationMode === "team_web" ? "Team Web 已完成" : "Team Cloud 已完成",
      message: `已生成 ${images.length} 张图片`
    });
  } catch (error) {
    const handled = await updateScheduler(async () => {
      if (!queue.running.includes(key)) return false;
      queue = fail(queue, key, "team_error");
      pendingScopes.delete(key);
      await removeActiveScope(key);
      return true;
    });
    if (!handled) return;
    await persistAndBroadcast({
      type: "TASK_ERROR",
      projectId,
      taskId,
      reason: "team_error",
      detail: error instanceof Error ? error.message : "团队生图失败"
    });
  }
}
async function executeTask(projectId, taskId) {
  const key = createTaskScopeKey(projectId, taskId);
  try {
    const project = await projectRepository.loadProject(projectId);
    const task = project?.graph.nodes.find(
      (node) => node.id === taskId && node.kind === "task"
    );
    if (!project || !task) throw new Error("\u627E\u4E0D\u5230\u672C\u5730\u4EFB\u52A1");
    const latestRun = await taskRunRepository.latest(projectId, taskId);
    const runtime = resolveTaskRuntime(task, latestRun);
    if (latestRun && !runtime.active) throw new Error(`TaskRun已终态：${latestRun.status}`);
    const runtimeTask = { ...task, apiJobId: runtime.providerJobId, conversationUrl: runtime.conversationUrl };
    if (runtimeTask.generationMode === "api") {
      await executeApiTask(projectId, taskId, project, runtimeTask);
      return;
    }
    if (runtimeTask.generationMode === "team" || runtimeTask.generationMode === "team_web") {
      await executeTeamTask(projectId, taskId, project, runtimeTask);
      return;
    }
    if (runtimeTask.apiJobId) {
      await persistAndBroadcast({ type: "TASK_STATUS", projectId, taskId, status: "queued", detail: void 0, clearApiJobId: true });
    }
    const mapped = await tabRegistry.ensure(key, runtimeTask.conversationUrl);
    await rememberActiveTab(key, mapped.tabId);
    await persistAndBroadcast({ type: "TASK_STATUS", projectId, taskId, status: "sending" });
    await waitForTabReady(mapped.tabId);
    await tabRegistry.assertExpected(mapped.tabId, runtimeTask.conversationUrl);
    const request = await prepareTaskRequest(project, taskId, runtimeTask);
    const message = {
      type: "EXECUTE_IN_CHATGPT",
      projectId,
      taskId,
      expectedConversationUrl: runtimeTask.conversationUrl,
      prompt: request.prompt,
      images: request.images,
      startedAt: Date.now(),
      phase: "preparing_tab"
    };
    browserTaskMessages.set(key, recoveryMessage(message));
    await saveBrowserTaskMessages();
    scheduleBrowserResultRecoveryAlarm();
    await sendWithCurrentChatGptAdapter(chrome.tabs, chrome.scripting, mapped.tabId, message);
  } catch (error) {
    const reason = error instanceof ConversationUnavailableError ? "conversation_unavailable" : "selector_missing";
    const handled = await updateScheduler(async () => {
      if (!queue.running.includes(key)) return false;
      queue = fail(queue, key, reason);
      pendingScopes.delete(key);
      await removeActiveScope(key);
      return true;
    });
    if (!handled) return;
    await persistAndBroadcast({
      type: "TASK_ERROR",
      projectId,
      taskId,
      reason,
      detail: error instanceof Error ? error.message : "\u4EFB\u52A1\u542F\u52A8\u5931\u8D25"
    });
  }
}
async function startWaitingTasks() {
  const running = new Set(queue.running);
  const state = await chrome.storage.session.get("activeTaskScopes");
  const active = new Map(
    Array.isArray(state.activeTaskScopes) ? state.activeTaskScopes : []
  );
  for (const key of running) {
    if (active.has(key)) continue;
    const scope = pendingScopes.get(key);
    if (!scope) continue;
    if (await taskGenerationMode(key) === "browser") {
      const waitMs = Math.max(0, BROWSER_LAUNCH_GAP_MS - (Date.now() - lastBrowserLaunchAt));
      if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
      lastBrowserLaunchAt = Date.now();
    }
    active.set(key, scope.projectId);
    void executeTask(scope.projectId, scope.taskId);
  }
  await chrome.storage.session.set({ activeTaskScopes: [...active] });
}
async function taskGenerationMode(key) {
  const scope = pendingScopes.get(key) ?? parseTaskScopeKey(key);
  if (!scope) return "browser";
  const project = await projectRepository.loadProject(scope.projectId);
  const task = project?.graph.nodes.find((node) => node.id === scope.taskId && node.kind === "task");
  return task?.generationMode === "api" ? "api" : task?.generationMode === "team" ? "team" : task?.generationMode === "team_web" ? "team_web" : "browser";
}
async function advanceQueueByMode() {
  let slots = Math.max(0, MAX_CONCURRENCY - queue.running.length);
  if (!slots || !queue.waiting.length) return;
  let browserRunning = activeTeamWebJobs.size;
  for (const key of queue.running) {
    if (await taskGenerationMode(key) === "browser") browserRunning += 1;
  }
  const promoted = [];
  const waiting = [];
  for (const key of queue.waiting) {
    if (!slots) {
      waiting.push(key);
      continue;
    }
    const mode = await taskGenerationMode(key);
    if (mode === "browser" && browserRunning >= MAX_BROWSER_CONCURRENCY) {
      waiting.push(key);
      continue;
    }
    promoted.push(key);
    slots -= 1;
    if (mode === "browser") browserRunning += 1;
  }
  queue = { ...queue, running: [...queue.running, ...promoted], waiting };
}
async function updateScheduler(work) {
  return schedulerWrites.run("scheduler", async () => {
    await schedulerReady;
    const result = await work();
    await advanceQueueByMode();
    await saveScheduler();
    await startWaitingTasks();
    return result;
  });
}
async function reconcileSchedulerSnapshot() {
  await schedulerReady;
  const liveScopes = new Map();
  const interruptedBrowserTasks = [];
  const retryBrowserTasks = [];
  for (const project of await projectRepository.listProjects()) {
    const latestRuns = await taskRunRepository.latestByProject(project.id);
    for (const task of project.graph.nodes) {
      if (task.kind !== "task") continue;
      const runtime = resolveTaskRuntime(task, latestRuns.get(task.id));
      if (!runtime.active) continue;
      if (task.generationMode === "browser" && runtime.status !== "queued" && !concreteChatGptConversationUrl(runtime.conversationUrl)) {
        const key = createTaskScopeKey(project.id, task.id);
        // Match the legacy local GPT Web behavior: a browser task without a
        // concrete conversation is still recoverable work, not a terminal
        // failure. A restart can happen before ChatGPT reports its URL.
        if (browserTaskMessages.has(key)) {
          liveScopes.set(key, { projectId: project.id, taskId: task.id });
        } else {
          liveScopes.set(key, { projectId: project.id, taskId: task.id });
          retryBrowserTasks.push(key);
        }
        continue;
      }
      liveScopes.set(createTaskScopeKey(project.id, task.id), { projectId: project.id, taskId: task.id });
    }
  }
  queue = reconcileQueue(queue, new Set(liveScopes.keys()));
  pendingScopes = new Map([...liveScopes].filter(([key]) => queue.waiting.includes(key) || queue.running.includes(key)));
  const liveTaskKeys = new Set(liveScopes.keys());
  for (const active of activeTeamWebJobs.values()) liveTaskKeys.add(createTaskScopeKey(TEAM_WEB_PROJECT_ID, active.job.id));
  for (const key of [...browserTaskMessages.keys()]) if (!liveTaskKeys.has(key)) browserTaskMessages.delete(key);
  await saveBrowserTaskMessages();
  tabRegistry.pruneMappings(liveTaskKeys);
  await tabRegistry.closeOrphanedManagedTabs();
  const runningKeys = new Set(queue.running);
  const state = await chrome.storage.session.get(["activeTaskScopes", "activeTaskTabs"]);
  const activeTaskScopes = (Array.isArray(state.activeTaskScopes) ? state.activeTaskScopes : []).filter((entry) => Array.isArray(entry) && runningKeys.has(entry[0]));
  const activeTaskTabs = (Array.isArray(state.activeTaskTabs) ? state.activeTaskTabs : []).filter((entry) => Array.isArray(entry) && runningKeys.has(entry[0]));
  await chrome.storage.session.set({ activeTaskScopes, activeTaskTabs });
  await saveScheduler();
  if (retryBrowserTasks.length) {
    queue = enqueue(retryBrowserTasks.reduce((snapshot, key) => cancelTask(snapshot, key), queue), retryBrowserTasks);
    await saveScheduler();
  }
  for (const task of interruptedBrowserTasks) {
    await persistAndBroadcast({
      type: "TASK_ERROR",
      ...task,
      reason: "browser_interrupted",
      detail: "ChatGPT任务在建立可恢复对话前被中断，请重新运行"
    });
  }
}
async function recoverInterruptedApiTasks() {
  await schedulerReady;
  const interruptedByKey = new Map();
  for (const key of queue.running) {
    const scope = pendingScopes.get(key) ?? parseTaskScopeKey(key);
    if (!scope) continue;
    const project = await projectRepository.loadProject(scope.projectId);
    const task = project?.graph.nodes.find((node) => node.id === scope.taskId && node.kind === "task");
    const runtime = task ? resolveTaskRuntime(task, await taskRunRepository.latest(scope.projectId, scope.taskId)) : void 0;
    if (runtime?.active && ["api", "team", "team_web"].includes(task?.generationMode)) interruptedByKey.set(key, { key, ...scope });
  }
  const recoverableStatuses = new Set(["preparing", "uploading", "sending", "submitted", "generating", "delivering"]);
  for (const project of await projectRepository.listProjects()) {
    const latestRuns = await taskRunRepository.latestByProject(project.id);
    for (const task of project.graph.nodes) {
      if (task.kind !== "task" || !["api", "team", "team_web"].includes(task.generationMode)) continue;
      const runtime = resolveTaskRuntime(task, latestRuns.get(task.id));
      if (!runtime.active || !runtime.status || !recoverableStatuses.has(runtime.status)) continue;
      const key = createTaskScopeKey(project.id, task.id);
      interruptedByKey.set(key, { key, projectId: project.id, taskId: task.id });
    }
  }
  const interrupted = [...interruptedByKey.values()];
  if (interrupted.length === 0) return;
  await updateScheduler(async () => {
    for (const item of interrupted) {
      const project = await projectRepository.loadProject(item.projectId);
      const task = project?.graph.nodes.find((node) => node.id === item.taskId && node.kind === "task");
      const runtime = task ? resolveTaskRuntime(task, await taskRunRepository.latest(item.projectId, item.taskId)) : void 0;
      await removeActiveScope(item.key);
      if (!task || !runtime?.active) {
        queue = cancelTask(queue, item.key);
        pendingScopes.delete(item.key);
        continue;
      }
      if (runtime.providerJobId || task?.generationMode === "team" || task?.generationMode === "team_web") {
        pendingScopes.set(item.key, { projectId: item.projectId, taskId: item.taskId });
        if (!queue.running.includes(item.key) && !queue.waiting.includes(item.key)) queue = enqueue(queue, [item.key]);
        continue;
      }
      queue = queue.running.includes(item.key) ? fail(queue, item.key, "api_interrupted") : cancelTask(queue, item.key);
      pendingScopes.delete(item.key);
      await persistAndBroadcast({
        type: "TASK_ERROR",
        projectId: item.projectId,
        taskId: item.taskId,
        reason: task?.generationMode === "team" || task?.generationMode === "team_web" ? "team_interrupted" : "api_interrupted",
        detail: task?.generationMode === "team" || task?.generationMode === "team_web" ? "团队任务在提交前被扩展重载中断，请重新运行" : "API 任务因扩展重载或后台中断而停止；为避免重复计费，未自动重试。请先检查平台调用记录。"
      });
    }
  });
}
async function reconcileCompletedApiTasks() {
  await schedulerReady;
  let activeApiJobs = 0;
  for (const project of await projectRepository.listProjects()) {
    const latestRuns = await taskRunRepository.latestByProject(project.id);
    for (const task of project.graph.nodes) {
      if (task.kind !== "task" || !["api", "team", "team_web"].includes(task.generationMode)) continue;
      const runtime = resolveTaskRuntime(task, latestRuns.get(task.id));
      const jobId = runtime.providerJobId;
      if (!runtime.active || !jobId) continue;
      if (!queue.running.includes(createTaskScopeKey(project.id, task.id))) continue;
      activeApiJobs += 1;
      let job;
      try {
        job = await (["team", "team_web"].includes(task.generationMode) ? teamGatewayRequest : apiWorkerRequest)(`/jobs/${jobId}`);
      } catch {
        continue;
      }
      if (!["completed", "failed", "canceled"].includes(job.status)) continue;
      const completedImages = job.status === "completed" && ["team", "team_web"].includes(task.generationMode) ? await downloadTeamGatewayImages(job) : job.images || [];
      const key = createTaskScopeKey(project.id, task.id);
      const handled = await updateScheduler(async () => {
        if (!queue.running.includes(key)) return false;
        if (job.status === "completed") {
          await persistAndBroadcast({
            type: "TASK_RESULT",
            projectId: project.id,
            taskId: task.id,
            images: completedImages,
            responseText: ""
          });
          queue = complete(queue, key);
        } else {
          await persistAndBroadcast({
            type: "TASK_ERROR",
            projectId: project.id,
            taskId: task.id,
            reason: ["team", "team_web"].includes(task.generationMode) ? "team_error" : "api_error",
            detail: job.error || (["team", "team_web"].includes(task.generationMode) ? "团队生图失败" : "API 生图失败")
          });
          queue = fail(queue, key, ["team", "team_web"].includes(task.generationMode) ? "team_error" : "api_error");
        }
        pendingScopes.delete(key);
        await removeActiveScope(key);
        return true;
      });
      if (!handled) continue;
      activeApiJobs -= 1;
      if (task.generationMode === "team" || task.generationMode === "team_web") {
        void teamGatewayRequest(`/jobs/${jobId}/acknowledge`, { method: "POST" }).then(() => teamResultDownloads.delete(jobId)).catch(() => {});
      } else {
        void apiWorkerRequest(`/jobs/${jobId}`, { method: "DELETE" }).catch(() => {});
      }
      if (job.status === "completed") {
        await chrome.notifications.create(createTaskNotificationId(project.id, task.id), {
          type: "basic",
          iconUrl: chrome.runtime.getURL("icon.svg"),
          title: task.generationMode === "team_web" ? "Team Web 已完成" : task.generationMode === "team" ? "Team Cloud 已完成" : "API Key 已完成",
          message: `已生成 ${completedImages.length} 张图片`
        });
      }
    }
  }
  if (activeApiJobs === 0) await chrome.alarms.clear(API_RECOVERY_ALARM);
}
async function handlePageTaskMessage(message, senderTab) {
  if (message.projectId === TEAM_WEB_PROJECT_ID) return handleTeamWebPageTaskMessage(message, senderTab);
  await schedulerReady;
  const key = createTaskScopeKey(message.projectId, message.taskId);
  if (!tabRegistry.ownsTab(key, senderTab?.id)) return false;
  const conversationUrl = resolveTaskConversationUrl(message, senderTab?.url);
  if (conversationUrl) {
    tabRegistry.updateConversation(key, conversationUrl);
  }
  const handled = await updateScheduler(async () => {
    if (!queue.running.includes(key)) return false;
    const recoveryMessageState = browserTaskMessages.get(key);
    if (message.type === "TASK_ERROR" && recoveryMessageState?.phase === "submitted" && !message.recovery) {
      return true;
    }
    if (message.type === "TASK_STATUS") {
      const pendingMessage = browserTaskMessages.get(key);
      if (pendingMessage?.phase === "submitted" && ["preparing_tab", "uploading", "sending"].includes(message.status)) {
        return true;
      }
      if (pendingMessage) {
        const phase = message.status === "generating" ? "submitted" : message.status;
        browserTaskMessages.set(key, {
          ...pendingMessage,
          phase,
          submittedAt: phase === "submitted" ? pendingMessage.submittedAt ?? Date.now() : pendingMessage.submittedAt
        });
        await saveBrowserTaskMessages();
      }
    }
    await persistAndBroadcast({ ...message, conversationUrl });
    if (message.type === "TASK_RESULT") {
      queue = complete(queue, key);
    } else if (message.type === "TASK_ERROR") {
      queue = fail(queue, key, message.reason);
    } else {
      return true;
    }
    if (message.type === "TASK_RESULT" || message.type === "TASK_ERROR") {
      pendingScopes.delete(key);
      browserTaskMessages.delete(key);
      resumedBrowserUrls.delete(key);
      browserRecoveryReloadedAt.delete(key);
      await saveBrowserTaskMessages();
      if (browserTaskMessages.size === 0) await chrome.alarms.clear(BROWSER_RESULT_RECOVERY_ALARM);
      await removeActiveScope(key);
    }
    return true;
  });
  if (!handled) return false;
  if (message.type === "TASK_RESULT") {
    await tabRegistry.hibernate(key);
    await chrome.notifications.create(createTaskNotificationId(message.projectId, message.taskId), {
      type: "basic",
      iconUrl: chrome.runtime.getURL("icon.svg"),
      title: "\u4EFB\u52A1\u751F\u6210\u5B8C\u6210",
      message: message.images.length ? `\u5DF2\u751F\u6210 ${message.images.length} \u5F20\u56FE\u7247` : "\u4EFB\u52A1\u5B8C\u6210\uFF0C\u4F46\u6CA1\u6709\u751F\u6210\u56FE\u7247"
    });
  }
  return true;
}
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  void (async () => {
    await schedulerReady;
    const observedUrl = changeInfo.url ?? tab.url;
    if (!observedUrl?.startsWith("https://chatgpt.com/") || changeInfo.status !== "complete" && !changeInfo.url) return;
    const key = tabRegistry.taskForTab(tabId);
    const message = key ? browserTaskMessages.get(key) : void 0;
    if (!key || !message || resumedBrowserUrls.get(key) === observedUrl) return;
    if (observedUrl.includes("?prompt=")) {
      if (changeInfo.status !== "complete") return;
      resumedBrowserUrls.set(key, observedUrl);
      await chrome.scripting.executeScript({
        target: { tabId },
        world: "MAIN",
        func: () => document.querySelector('[data-testid="send-button"], #composer-submit-button, button[aria-label*="Send" i], button[aria-label*="发送"]')?.click()
      });
      return;
    }
    if (!/^https:\/\/chatgpt\.com\/c\/[^/]+\/?$/.test(observedUrl) || message.phase !== "submitted") return;
    const resumedMessage = { ...message, expectedConversationUrl: observedUrl };
    resumedBrowserUrls.set(key, observedUrl);
    tabRegistry.updateConversation(key, observedUrl);
    browserTaskMessages.set(key, resumedMessage);
    await saveBrowserTaskMessages();
    const active = [...activeTeamWebJobs.values()].find(candidate => key === activeTeamWebKey(candidate));
    if (active) {
      active.conversationUrl = observedUrl;
      await saveActiveTeamWebJobs();
    } else {
      await persistAndBroadcast({ type: "TASK_STATUS", projectId: message.projectId, taskId: message.taskId, status: "generating", conversationUrl: observedUrl });
    }
    if (!await probeAdapter(chrome.tabs, tabId, resumedMessage)) {
      await chrome.scripting.executeScript({ target: { tabId }, files: ["contentScript.js"] });
    }
    await chrome.tabs.sendMessage(tabId, { ...resumedMessage, type: "RESUME_CHATGPT_RESULT", images: [] });
  })().catch(() => {});
});
chrome.runtime.onMessage.addListener((raw, sender, sendResponse) => {
  if (raw?.type === "TEAM_WEB_WORKER_SETTINGS_CHANGED") {
    sendResponse({ accepted: true });
    void teamWebWorkerTick();
    return false;
  }
  if (!isExtensionMessage(raw)) return false;
  const message = raw;
  if (message.type === "RECOVER_TEAM_RESULT") {
    void recoverTeamTaskResult(message.projectId, message.taskId, message.jobId).then(
      (result) => sendResponse({ accepted: true, ...result }),
      (error) => sendResponse({ accepted: false, error: error instanceof Error ? error.message : String(error) })
    );
    return true;
  }
  if (message.type === "RUN_TASK" || message.type === "RUN_TASKS") {
    void updateScheduler(async () => {
      const taskIds = message.type === "RUN_TASKS" ? [...new Set(message.taskIds)] : [message.taskId];
      const keys = [];
      for (const taskId of taskIds) {
        const key = createTaskScopeKey(message.projectId, taskId);
        await startTaskRun(message.projectId, taskId);
        await persistAndBroadcast({ type: "TASK_STATUS", projectId: message.projectId, taskId, status: "queued", runStatus: "queued", detail: void 0 });
        pendingScopes.set(key, { projectId: message.projectId, taskId });
        keys.push(key);
      }
      queue = enqueue(queue, keys);
    }).then(() => sendResponse({ accepted: true }), (error) => sendResponse({ accepted: false, error: String(error) }));
    return true;
  }
  if (message.type === "CANCEL_TASK") {
    void updateScheduler(async () => {
      const key = createTaskScopeKey(message.projectId, message.taskId);
      const project = await projectRepository.loadProject(message.projectId);
      const task = project?.graph.nodes.find((node) => node.id === message.taskId && node.kind === "task");
      const run = await taskRunRepository.latest(message.projectId, message.taskId);
      const providerJobId = run?.providerJobId || task?.apiJobId;
      if (providerJobId) {
        if (["team", "team_web"].includes(task.generationMode)) {
          await cancelTeamGatewayJob(providerJobId).catch(() => void 0);
        } else {
          await apiWorkerRequest(`/jobs/${providerJobId}`, { method: "DELETE" }).catch(() => void 0);
        }
        teamResultDownloads.delete(providerJobId);
      }
      if (run && !isTerminalRunStatus(run.status)) {
        await persistAndBroadcast({ type: "TASK_STATUS", projectId: message.projectId, taskId: message.taskId, status: "failed", runStatus: "canceled", detail: "任务已取消" });
      }
      queue = cancelTask(queue, key);
      pendingScopes.delete(key);
      browserTaskMessages.delete(key);
      resumedBrowserUrls.delete(key);
      browserRecoveryReloadedAt.delete(key);
      await saveBrowserTaskMessages();
      if (browserTaskMessages.size === 0) await chrome.alarms.clear(BROWSER_RESULT_RECOVERY_ALARM);
      await removeActiveScope(key);
      await tabRegistry.close(key);
    }).then(() => sendResponse({ accepted: true }), (error) => sendResponse({ accepted: false, error: String(error) }));
    return true;
  }
  if (message.type === "OPEN_TASK_TAB") {
    void Promise.all([projectRepository.loadProject(message.projectId), taskRunRepository.latest(message.projectId, message.taskId)]).then(([project, run]) => {
      const task = project?.graph.nodes.find((node) => node.id === message.taskId && node.kind === "task");
      return tabRegistry.open(
        createTaskScopeKey(message.projectId, message.taskId),
        run?.conversationUrl ?? (task?.kind === "task" ? task.conversationUrl : void 0)
      );
    });
    sendResponse({ accepted: true });
    return true;
  }
  if (message.type === "CLOSE_TASK_TAB") {
    void tabRegistry.close(createTaskScopeKey(message.projectId, message.taskId));
    sendResponse({ accepted: true });
    return true;
  }
  if (message.type === "HIBERNATE_TASK_TABS") {
    void (async () => {
      await schedulerReady;
      const protectedTaskKeys = /* @__PURE__ */ new Set([...queue.waiting, ...queue.running]);
      const taskKeys = message.taskIds.map((taskId) => createTaskScopeKey(message.projectId, taskId)).filter((taskKey) => !protectedTaskKeys.has(taskKey));
      sendResponse({ released: await tabRegistry.hibernateMany(taskKeys) });
    })().catch(() => sendResponse({ error: "\u91CA\u653E\u7F51\u9875\u6807\u7B7E\u5931\u8D25" }));
    return true;
  }
  if (message.type === "DOWNLOAD_ASSET") {
    void projectRepository.loadAsset(message.assetId).then(async (blob) => {
      if (!blob) throw new Error("\u627E\u4E0D\u5230\u9700\u8981\u4E0B\u8F7D\u7684\u56FE\u7247");
      const url = `data:${blob.type || "image/png"};base64,${bytesToBase64(await blob.arrayBuffer())}`;
      await chrome.downloads.download({
        url,
        filename: message.fileName ?? `GPT\u8282\u70B9\u753B\u5E03/${message.assetId}.png`,
        saveAs: true
      });
    });
    sendResponse({ accepted: true });
    return true;
  }
  if ((message.type === "TASK_STATUS" || message.type === "TASK_RESULT" || message.type === "TASK_ERROR") && !message.persisted) {
    void handlePageTaskMessage(message, sender.tab).then((accepted) => sendResponse({ accepted }), (error) => sendResponse({ accepted: false, error: String(error) }));
    return true;
  }
  if (message.type === "SHOW_NOTIFICATION") {
    void chrome.notifications.create(createTaskNotificationId(message.projectId, message.taskId), {
      type: "basic",
      iconUrl: chrome.runtime.getURL("icon.svg"),
      title: message.title,
      message: message.message
    });
  }
  return false;
});
void reconcileSchedulerSnapshot().then(() => recoverInterruptedApiTasks()).then(() => updateScheduler(async () => void 0));
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === API_RECOVERY_ALARM) void reconcileCompletedApiTasks();
  if (alarm.name === BROWSER_RESULT_RECOVERY_ALARM) void reconcileBrowserTaskResults();
  if (alarm.name === TEAM_WEB_WORKER_ALARM) void teamWebWorkerTick();
});
chrome.notifications.onClicked.addListener((notificationId) => {
  const url = notificationIdToCanvasUrl(notificationId, chrome.runtime.getURL("index.html"));
  void chrome.tabs.create({ url });
});
