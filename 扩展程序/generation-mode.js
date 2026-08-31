(() => {
  const modeCache = new Map();
  const modeSavePromises = new Map();
  let databasePromise;

  function openDatabase() {
    if (!databasePromise) databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open("gpt-node-canvas");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return databasePromise;
  }

  function projectId() {
    return document.querySelector(".project-picker select")?.value || "";
  }

  function taskId(card) {
    return card.closest(".react-flow__node-task")?.getAttribute("data-id") || "";
  }

  async function readTaskMode(projectId, taskId) {
    const key = `${projectId}:${taskId}`;
    if (modeCache.has(key)) return modeCache.get(key);
    const db = await openDatabase();
    const transaction = db.transaction("projects", "readonly");
    const project = await new Promise((resolve, reject) => {
      const request = transaction.objectStore("projects").get(projectId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const mode = project?.graph?.nodes?.find((node) => node.id === taskId && node.kind === "task")?.generationMode === "browser" ? "browser" : "api";
    modeCache.set(key, mode);
    return mode;
  }

  async function saveTaskMode(projectId, taskId, mode) {
    const db = await openDatabase();
    const transaction = db.transaction("projects", "readwrite");
    const store = transaction.objectStore("projects");
    const project = await new Promise((resolve, reject) => {
      const request = store.get(projectId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (!project) throw new Error("找不到当前画布");
    project.graph.nodes = project.graph.nodes.map((node) => node.id === taskId && node.kind === "task" ? {
      ...node,
      generationMode: mode,
      ...(mode === "browser" ? { apiJobId: void 0, statusDetail: void 0 } : {})
    } : node);
    project.updatedAt = Date.now();
    await new Promise((resolve, reject) => {
      const request = store.put(project);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    modeCache.set(`${projectId}:${taskId}`, mode);
  }

  async function getSettings() {
    if (globalThis.chrome?.storage?.local) return chrome.storage.local.get(["pixelFlowApiKey"]);
    return { pixelFlowApiKey: localStorage.getItem("pixelFlowApiKey") || "" };
  }

  async function saveSettings(apiKey) {
    if (globalThis.chrome?.storage?.local) return chrome.storage.local.set({ pixelFlowApiKey: apiKey });
    localStorage.setItem("pixelFlowApiKey", apiKey);
  }

  async function clearSettings() {
    if (globalThis.chrome?.storage?.local) return chrome.storage.local.remove("pixelFlowApiKey");
    localStorage.removeItem("pixelFlowApiKey");
  }

  function closeSettings() {
    document.querySelector(".api-settings-backdrop")?.remove();
  }

  async function openSettings() {
    if (document.querySelector(".api-settings-backdrop")) return;
    const { pixelFlowApiKey } = await getSettings();
    const backdrop = document.createElement("div");
    backdrop.className = "api-settings-backdrop";
    backdrop.innerHTML = `
      <section class="api-settings" role="dialog" aria-modal="true" aria-labelledby="api-settings-title">
        <header><div><strong id="api-settings-title">API 生图设置</strong><small>密钥只保存在当前浏览器本地</small></div><button type="button" data-action="close" aria-label="关闭 API 设置">×</button></header>
        <label>接口地址<input value="https://aihub.rbmanon.cn/v1" readonly></label>
        <label>模型<input value="gpt-image-2" readonly></label>
        <label>质量<input value="medium" readonly></label>
        <label>API Key<input class="api-key-input" type="password" autocomplete="off" placeholder="${pixelFlowApiKey ? "已保存；留空表示不修改" : "请输入完整 API Key"}"></label>
        <p class="api-settings-note">纯文字任务调用 /images/generations；包含参考图时调用 /images/edits，并以 JSON Base64 Data URL 上传多张图片。</p>
        <footer><button type="button" data-action="clear">清除 Key</button><button class="primary" type="button" data-action="save">保存</button></footer>
      </section>`;
    backdrop.addEventListener("click", async (event) => {
      const action = event.target instanceof Element ? event.target.closest("[data-action]")?.getAttribute("data-action") : "";
      if (event.target === backdrop || action === "close") closeSettings();
      if (action === "save") {
        const value = backdrop.querySelector(".api-key-input")?.value.trim();
        if (value) await saveSettings(value);
        closeSettings();
        updateSettingsButton();
      }
      if (action === "clear") {
        await clearSettings();
        closeSettings();
        updateSettingsButton();
      }
    });
    document.body.append(backdrop);
    backdrop.querySelector(".api-key-input")?.focus();
  }

  async function updateSettingsButton() {
    const button = document.querySelector(".api-settings-button");
    if (!button) return;
    const { pixelFlowApiKey } = await getSettings();
    button.dataset.configured = pixelFlowApiKey ? "true" : "false";
    button.title = pixelFlowApiKey ? "API Key 已配置" : "API Key 未配置";
  }

  function enhanceTopbar() {
    const actions = document.querySelector(".topbar-actions");
    if (!actions || actions.querySelector(".api-settings-button")) return;
    const button = document.createElement("button");
    button.className = "api-settings-button";
    button.type = "button";
    button.textContent = "API 设置";
    button.addEventListener("click", openSettings);
    actions.prepend(button);
    updateSettingsButton();
  }

  async function enhanceCard(card) {
    if (card.querySelector(".generation-mode") || card.dataset.modeEnhancing === "true") return;
    card.dataset.modeEnhancing = "true";
    try {
      const header = card.querySelector(".task-card__header");
      const currentProjectId = projectId();
      const currentTaskId = taskId(card);
      if (!header || !currentProjectId || !currentTaskId) return;
      const mode = await readTaskMode(currentProjectId, currentTaskId);
      const key = `${currentProjectId}:${currentTaskId}`;
      if (mode === "api") {
        const saving = saveTaskMode(currentProjectId, currentTaskId, "api");
        modeSavePromises.set(key, saving);
        await saving;
        if (modeSavePromises.get(key) === saving) modeSavePromises.delete(key);
      }
      if (card.querySelector(".generation-mode")) return;
      const label = document.createElement("label");
      label.className = "generation-mode nodrag nowheel";
      label.title = "生图模式";
      const select = document.createElement("select");
      select.setAttribute("aria-label", "生图模式");
      select.innerHTML = '<option value="browser">GPT-web</option><option value="api">API</option>';
      select.value = mode;
      select.addEventListener("change", async () => {
        const activeStatus = card.querySelector(".task-status")?.getAttribute("data-status");
        if (["queued", "waiting_page", "uploading", "sending", "generating", "manual_action"].includes(activeStatus)) {
          select.value = await readTaskMode(currentProjectId, currentTaskId);
          return;
        }
        const saving = saveTaskMode(currentProjectId, currentTaskId, select.value);
        modeSavePromises.set(key, saving);
        await saving;
        if (modeSavePromises.get(key) === saving) modeSavePromises.delete(key);
        card.dataset.generationMode = select.value;
        if (select.value === "api") updateSettingsButton();
      });
      label.append(select);
      header.insertBefore(label, header.querySelector(".task-status"));
      card.dataset.generationMode = select.value;
    } finally {
      delete card.dataset.modeEnhancing;
    }
  }

  function enhanceAll() {
    enhanceTopbar();
    document.querySelectorAll(".task-card").forEach((card) => void enhanceCard(card));
  }

  document.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest(".run-button") : null;
    if (!(button instanceof HTMLButtonElement)) return;
    if (button.dataset.apiModeBypass === "1") {
      delete button.dataset.apiModeBypass;
      return;
    }
    const card = button.closest(".task-card");
    const selectedMode = card?.querySelector(".generation-mode select")?.value;
    const key = `${projectId()}:${taskId(card)}`;
    const pendingModeSave = modeSavePromises.get(key);
    if (selectedMode !== "api" && !pendingModeSave) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void (async () => {
      await pendingModeSave;
      if (selectedMode === "api") {
        const { pixelFlowApiKey } = await getSettings();
        if (!pixelFlowApiKey) {
          openSettings();
          return;
        }
      }
      button.dataset.apiModeBypass = "1";
      button.click();
    })();
  }, true);

  let enhanceFrame = 0;
  new MutationObserver((mutations) => {
    if (!mutations.some((mutation) => [...mutation.addedNodes].some((node) => node instanceof Element && (node.matches(".topbar,.task-card") || node.querySelector(".topbar,.task-card"))))) return;
    cancelAnimationFrame(enhanceFrame);
    enhanceFrame = requestAnimationFrame(enhanceAll);
  }).observe(document.body || document.documentElement, { childList: true, subtree: true });
  document.addEventListener("DOMContentLoaded", enhanceAll, { once: true });
})();
