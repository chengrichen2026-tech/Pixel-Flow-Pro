(() => {
  const nativeCanvas = document.documentElement.dataset.pixelFlowCanvas === "native";
  const STORAGE_KEY = "pixelFlowMvpLibraryV1";
  const DB_NAME = "gpt-node-canvas";
  let databasePromise;
  let panel;
  let rail;
  let gallery;
  let activeTab = "prompts";
  let panelMode = "usage";
  let activeLibraryTag = "";
  let searchQuery = "";
  let selectedNodeIdsSnapshot = null;
  const managedObjectUrls = new Set();

  const managedObjectUrl = (blob) => {
    const url = URL.createObjectURL(blob);
    managedObjectUrls.add(url);
    return url;
  };
  const releaseObjectUrls = (root) => {
    root?.querySelectorAll?.("[data-pf-object-url]").forEach((element) => {
      const url = element.getAttribute("data-pf-object-url");
      if (url) { URL.revokeObjectURL(url); managedObjectUrls.delete(url); }
    });
  };

  const makeId = (prefix) => `${prefix}-${crypto.randomUUID()}`;
  const now = () => Date.now();
  const emptyLibrary = () => ({ prompts: [], media: [] });
  const normalizeTags = (tags) => [...new Set((Array.isArray(tags) ? tags : []).map((tag) => String(tag || "").trim()).filter(Boolean))];
  const runCanvasCommand = (command) => new Promise((resolve, reject) => {
    window.dispatchEvent(new CustomEvent("pixel-flow:canvas-command", { detail: { command, resolve, reject } }));
  });
  const promptTags = (item) => {
    if (Array.isArray(item.tags)) return normalizeTags(item.tags);
    const text = `${item.name || ""} ${item.content || ""}`;
    const tags = [];
    if (/构图|排列|堆叠|复刻/.test(text)) tags.push("构图");
    if (/背景|场景|卧室|氛围/.test(text)) tags.push("背景");
    if (/材质|精修|生成规范|功能/.test(text)) tags.push("功能");
    return tags.length ? [...new Set(tags)] : ["功能"];
  };
  const readLibrary = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      return { ...emptyLibrary(), promptSyncMode: parsed?.promptSyncMode, prompts: (parsed?.prompts || []).map((item) => ({ ...item, tags: promptTags(item) })), media: (parsed?.media || []).map((item) => ({ ...item, tags: normalizeTags(item.tags) })) };
    } catch {
      return emptyLibrary();
    }
  };
  const saveLibrary = (library) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(library));
    window.dispatchEvent(new CustomEvent("pixel-flow:library-updated"));
  };
  const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  const libraryCardIcon = (name) => name === "delete"
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z"/><path d="m14 7 3 3"/></svg>';
  const safeFilename = (value) => String(value || "Pixel Flow").replace(/[\\/:*?"<>|]+/g, "-").trim() || "Pixel Flow";

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  function dataUrlToBlob(dataUrl) {
    const [header, encoded] = String(dataUrl).split(",", 2);
    const type = header.match(/^data:([^;]+)/)?.[1] || "application/octet-stream";
    const bytes = Uint8Array.from(atob(encoded || ""), (character) => character.charCodeAt(0));
    return new Blob([bytes], { type });
  }

  async function downloadJson(payload, filename) {
    const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    try {
      if (globalThis.chrome?.downloads) await chrome.downloads.download({ url, filename, saveAs: true });
      else {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        anchor.click();
      }
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    }
  }

  function openCanvasDialog({ title, message, confirmLabel = "确定", tone = "default", inputValue }) {
    return new Promise((resolve) => {
      document.querySelector(".pf-canvas-dialog-backdrop")?.remove();
      const backdrop = document.createElement("div");
      backdrop.className = "pf-canvas-dialog-backdrop";
      const hasInput = typeof inputValue === "string";
      backdrop.innerHTML = `<section class="pf-canvas-dialog" role="dialog" aria-modal="true" aria-labelledby="pf-canvas-dialog-title"><header><strong id="pf-canvas-dialog-title">${escapeHtml(title)}</strong><button data-dialog-result="cancel" aria-label="关闭">×</button></header>${message ? `<p>${escapeHtml(message)}</p>` : ""}${hasInput ? `<input data-dialog-input value="${escapeHtml(inputValue)}" aria-label="画布名称">` : ""}<footer><button data-dialog-result="cancel">取消</button><button class="primary ${tone === "danger" ? "danger" : ""}" data-dialog-result="confirm">${escapeHtml(confirmLabel)}</button></footer></section>`;
      const finish = (value) => { backdrop.remove(); resolve(value); };
      backdrop.addEventListener("click", (event) => {
        const result = event.target instanceof Element ? event.target.closest("[data-dialog-result]")?.getAttribute("data-dialog-result") : null;
        if (result === "cancel" || event.target === backdrop) finish(false);
        if (result === "confirm") finish(hasInput ? backdrop.querySelector("[data-dialog-input]")?.value.trim() || false : true);
      });
      backdrop.addEventListener("keydown", (event) => { if (event.key === "Escape") finish(false); if (event.key === "Enter" && hasInput) finish(backdrop.querySelector("[data-dialog-input]")?.value.trim() || false); });
      document.body.append(backdrop);
      requestAnimationFrame(() => (backdrop.querySelector("[data-dialog-input]") || backdrop.querySelector('[data-dialog-result="confirm"]'))?.focus());
    });
  }

  function tagEditorMarkup(tags = []) {
    return `<fieldset class="pf-tag-editor" data-tag-editor><legend>标签 <small>可选，输入后按 Enter 或逗号新增</small></legend><div data-tag-chips>${normalizeTags(tags).map((tag) => `<button type="button" data-tag-remove="${escapeHtml(tag)}"><span>${escapeHtml(tag)}</span>×</button>`).join("")}</div><input data-tag-input placeholder="输入新标签"></fieldset>`;
  }

  function tagEditorValues(root) {
    return normalizeTags([...root.querySelectorAll("[data-tag-remove]")].map((button) => button.dataset.tagRemove));
  }

  function bindTagEditor(root) {
    const input = root.querySelector("[data-tag-input]");
    const chips = root.querySelector("[data-tag-chips]");
    const add = () => {
      const tag = input?.value.trim().replace(/^[,，]+|[,，]+$/g, "");
      if (!tag || !chips) return;
      if (!tagEditorValues(root).includes(tag)) chips.insertAdjacentHTML("beforeend", `<button type="button" data-tag-remove="${escapeHtml(tag)}"><span>${escapeHtml(tag)}</span>×</button>`);
      input.value = "";
    };
    input?.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === "," || event.key === "，") { event.preventDefault(); add(); } });
    input?.addEventListener("blur", add);
    root.addEventListener("click", (event) => event.target instanceof Element && event.target.closest("[data-tag-remove]")?.remove());
  }

  async function openPromptDialog(prompt = null) {
    const existingAsset = prompt?.exampleAssetId ? await getAsset(prompt.exampleAssetId) : null;
    const existingUrl = existingAsset?.blob ? URL.createObjectURL(existingAsset.blob) : "";
    return new Promise((resolve) => {
      document.querySelector(".pf-prompt-dialog-backdrop")?.remove();
      const backdrop = document.createElement("div");
      backdrop.className = "pf-prompt-dialog-backdrop";
      backdrop.innerHTML = `<section class="pf-prompt-dialog" role="dialog" aria-modal="true" aria-labelledby="pf-prompt-dialog-title"><header><div><strong id="pf-prompt-dialog-title">${prompt ? "编辑提示词" : "新增提示词"}</strong><small>${prompt ? "修改名称、标签、提示词内容或示例图" : "保存一条可重复调用的完整提示词"}</small></div><button type="button" data-prompt-dialog="cancel" aria-label="关闭">×</button></header><div class="pf-prompt-dialog-form"><label>提示词名称<input data-prompt-name value="${escapeHtml(prompt?.name || "")}" placeholder="例如：产品商业海报"></label>${tagEditorMarkup(prompt?.tags)}<label>完整提示词<textarea data-prompt-content placeholder="输入可直接使用的完整提示词">${escapeHtml(prompt?.content || "")}</textarea></label><section class="pf-prompt-example"><div><strong>示例图</strong><small>可选，用于帮助识别提示词，不会自动加入画布</small></div><button type="button" class="pf-prompt-example-preview ${existingUrl ? "has-image" : ""}" data-prompt-dialog="choose-image">${existingUrl ? `<img src="${existingUrl}" alt="当前示例图">` : "<span>上传示例图</span>"}</button><div class="pf-prompt-example-actions"><button type="button" data-prompt-dialog="choose-image">选择图片</button><button type="button" data-prompt-dialog="remove-image" ${existingUrl ? "" : "disabled"}>移除图片</button></div><input type="file" accept="image/*" data-prompt-image hidden></section><p class="pf-prompt-dialog-error" role="alert"></p></div><footer><button type="button" data-prompt-dialog="cancel">取消</button><button type="button" class="primary" data-prompt-dialog="save">${prompt ? "保存修改" : "保存为新提示词"}</button></footer></section>`;
      bindTagEditor(backdrop);
      let selectedFile = null;
      let selectedPreviewUrl = "";
      let removeExample = false;
      const preview = backdrop.querySelector(".pf-prompt-example-preview");
      const fileInput = backdrop.querySelector("[data-prompt-image]");
      const removeButton = backdrop.querySelector('[data-prompt-dialog="remove-image"]');
      const finish = (value) => { if (existingUrl) URL.revokeObjectURL(existingUrl); if (selectedPreviewUrl) URL.revokeObjectURL(selectedPreviewUrl); backdrop.remove(); resolve(value); };
      fileInput.addEventListener("change", () => {
        selectedFile = fileInput.files?.[0] || null;
        if (!selectedFile) return;
        removeExample = false;
        if (selectedPreviewUrl) URL.revokeObjectURL(selectedPreviewUrl);
        selectedPreviewUrl = URL.createObjectURL(selectedFile);
        preview.classList.add("has-image");
        preview.innerHTML = `<img src="${selectedPreviewUrl}" alt="新示例图预览">`;
        removeButton.disabled = false;
      });
      backdrop.addEventListener("click", (event) => {
        const action = event.target instanceof Element ? event.target.closest("[data-prompt-dialog]")?.getAttribute("data-prompt-dialog") : null;
        if (action === "cancel" || event.target === backdrop) finish(false);
        if (action === "choose-image") fileInput.click();
        if (action === "remove-image") { selectedFile = null; removeExample = true; fileInput.value = ""; preview.classList.remove("has-image"); preview.innerHTML = "<span>上传示例图</span>"; removeButton.disabled = true; }
        if (action === "save") {
          const name = backdrop.querySelector("[data-prompt-name]")?.value.trim();
          const content = backdrop.querySelector("[data-prompt-content]")?.value.trim();
          const tags = tagEditorValues(backdrop);
          const error = backdrop.querySelector(".pf-prompt-dialog-error");
          if (!name || !content) { error.textContent = "请填写提示词名称和完整提示词内容"; return; }
          finish({ name, content, tags, selectedFile, removeExample });
        }
      });
      backdrop.addEventListener("keydown", (event) => { if (event.key === "Escape") finish(false); });
      document.body.append(backdrop);
      requestAnimationFrame(() => backdrop.querySelector("[data-prompt-name]")?.focus());
    });
  }

  async function editPrompt(promptId = "") {
    const library = readLibrary();
    const existing = library.prompts.find((item) => item.id === promptId) || null;
    const result = await openPromptDialog(existing);
    if (!result) return;
    const previousAssetId = existing?.exampleAssetId || "";
    let exampleAssetId = result.removeExample ? "" : previousAssetId;
    if (result.selectedFile) {
      exampleAssetId = makeId("asset");
      await putAsset({ id: exampleAssetId, blob: result.selectedFile, createdAt: now() });
    }
    if (existing) Object.assign(existing, { name: result.name, content: result.content, tags: result.tags, exampleAssetId, updatedAt: now() });
    else library.prompts.unshift({ id: makeId("prompt"), name: result.name, content: result.content, tags: result.tags, exampleAssetId, updatedAt: now() });
    saveLibrary(library);
    if (previousAssetId && previousAssetId !== exampleAssetId) await deletePromptAssetIfUnused(previousAssetId, library);
    renderPanel();
    notify(existing ? "提示词已更新" : "提示词已新增");
  }

  function openMediaDialog(media) {
    return new Promise((resolve) => {
      document.querySelector(".pf-media-dialog-backdrop")?.remove();
      const backdrop = document.createElement("div");
      backdrop.className = "pf-media-dialog-backdrop pf-prompt-dialog-backdrop";
      backdrop.innerHTML = `<section class="pf-media-dialog pf-prompt-dialog" role="dialog" aria-modal="true"><header><div><strong>编辑${media.kind === "product" ? "产品素材" : "图库图片"}</strong><small>修改名称，或新增、删除自定义标签</small></div><button type="button" data-media-dialog="cancel" aria-label="关闭">×</button></header><div class="pf-prompt-dialog-form"><label>素材名称<input data-media-name value="${escapeHtml(media.name || "")}"></label>${tagEditorMarkup(media.tags)}</div><footer><button type="button" data-media-dialog="cancel">取消</button><button type="button" class="primary" data-media-dialog="save">保存修改</button></footer></section>`;
      bindTagEditor(backdrop);
      const finish = (value) => { backdrop.remove(); resolve(value); };
      backdrop.addEventListener("click", (event) => {
        const action = event.target instanceof Element ? event.target.closest("[data-media-dialog]")?.dataset.mediaDialog : null;
        if (action === "cancel" || event.target === backdrop) finish(false);
        if (action === "save") {
          const name = backdrop.querySelector("[data-media-name]")?.value.trim();
          if (name) finish({ name, tags: tagEditorValues(backdrop) });
        }
      });
      backdrop.addEventListener("keydown", (event) => { if (event.key === "Escape") finish(false); });
      document.body.append(backdrop);
      requestAnimationFrame(() => backdrop.querySelector("[data-media-name]")?.focus());
    });
  }

  function openDatabase() {
    if (!databasePromise) databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return databasePromise;
  }

  async function getProject(projectId = currentProjectId()) {
    if (!projectId) return null;
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const request = db.transaction("projects", "readonly").objectStore("projects").get(projectId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function getAllProjects() {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const request = db.transaction("projects", "readonly").objectStore("projects").getAll();
      request.onsuccess = () => resolve((request.result || []).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)));
      request.onerror = () => reject(request.error);
    });
  }

  async function putAsset(record) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const request = db.transaction("assets", "readwrite").objectStore("assets").put(record);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async function getAsset(assetId) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const request = db.transaction("assets", "readonly").objectStore("assets").get(assetId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function deleteAsset(assetId) {
    if (!assetId) return;
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const request = db.transaction("assets", "readwrite").objectStore("assets").delete(assetId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async function deletePromptAssetIfUnused(assetId, library) {
    if (!assetId) return;
    const stillUsed = library.prompts.some((item) => item.exampleAssetId === assetId) || library.media.some((item) => item.assetId === assetId);
    if (!stillUsed) await deleteAsset(assetId);
  }

  async function exportCurrentCanvas(projectId = currentProjectId()) {
    const project = await getProject(projectId);
    if (!project) return notify("找不到当前画布", "error");
    const assetIds = [...new Set(project.graph.nodes.flatMap((node) => node.kind === "image" || node.kind === "result" ? [node.assetId] : []))];
    const assets = [];
    for (const assetId of assetIds) {
      const asset = await getAsset(assetId);
      if (!asset?.blob) continue;
      assets.push({ id: assetId, type: asset.blob.type, data: Array.from(new Uint8Array(await asset.blob.arrayBuffer())) });
    }
    await downloadJson({ version: 1, kind: "pixel-flow-canvas", exportedAt: new Date().toISOString(), project, assets }, `${safeFilename(project.name)}.gptcanvas.json`);
    notify(`画布“${project.name}”已存储`);
  }

  async function importCanvas(file) {
    let payload;
    try { payload = JSON.parse(await file.text()); }
    catch { return notify("无法读取画布文件，请确认文件格式正确", "error"); }
    if (payload?.kind !== "pixel-flow-canvas" || !payload.project?.graph?.nodes || !payload.project?.graph?.edges) return notify("这不是有效的 Pixel Flow 画布文件", "error");
    const projectId = makeId("project");
    const assetIdMap = new Map();
    for (const asset of payload.assets || []) {
      if (!asset?.id || !Array.isArray(asset.data)) continue;
      const assetId = makeId("asset");
      assetIdMap.set(asset.id, assetId);
      await putAsset({ id: assetId, blob: new Blob([Uint8Array.from(asset.data)], { type: asset.type || "application/octet-stream" }) });
    }
    const importedAt = now();
    const project = { ...payload.project, id: projectId, name: `${payload.project.name || "导入画布"}（导入）`, graph: { ...payload.project.graph, nodes: payload.project.graph.nodes.map((node) => assetIdMap.has(node.assetId) ? { ...node, assetId: assetIdMap.get(node.assetId) } : node), edges: payload.project.graph.edges.map((edge) => ({ ...edge })) }, createdAt: importedAt, updatedAt: importedAt };
    await runCanvasCommand({ type: "project.import", project });
    window.dispatchEvent(new CustomEvent("pixel-flow:projects-refresh"));
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent("pixel-flow:project-refresh", { detail: { projectId } }));
      void openProjectGallery();
    }, 80);
    notify(`画布“${project.name}”已导入`);
  }

  async function deleteCurrentCanvas() {
    const project = await getProject();
    if (!project) return notify("找不到当前画布", "error");
    if (!await openCanvasDialog({ title: `删除“${project.name}”`, message: "此操作无法撤销，但不会删除在线 ChatGPT 对话。删除后可在存储空间中一键清理未使用图片。", confirmLabel: "删除画布", tone: "danger" })) return;
    await runCanvasCommand({ type: "project.delete", projectId: project.id });
    collapsePanel();
    window.dispatchEvent(new CustomEvent("pixel-flow:projects-refresh"));
    if (document.body.classList.contains("pf-gallery-open")) setTimeout(() => void renderProjectGallery(), 80);
    notify(`画布“${project.name}”已删除`);
  }

  async function deleteCanvasById(projectId) {
    const activeId = currentProjectId();
    if (projectId === activeId) return deleteCurrentCanvas();
    const project = await getProject(projectId);
    if (!project || !await openCanvasDialog({ title: `删除“${project.name}”`, message: "此操作无法撤销。删除后可在存储空间中一键清理未使用图片。", confirmLabel: "删除画布", tone: "danger" })) return;
    await runCanvasCommand({ type: "project.delete", projectId });
    window.dispatchEvent(new CustomEvent("pixel-flow:projects-refresh"));
    await renderProjectGallery();
    notify(`画布“${project.name}”已删除`);
  }

  function formatProjectDate(timestamp) {
    if (!timestamp) return "尚未更新";
    return `更新于 ${new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric" }).format(new Date(timestamp))}`;
  }

  async function projectPreview(project) {
    const nodes = [...project.graph.nodes].filter((node) => node.kind === "result" || node.kind === "image").slice(-4).reverse();
    const previews = [];
    for (const node of nodes) {
      const asset = await getAsset(node.assetId);
      if (asset?.blob) previews.push(managedObjectUrl(asset.blob));
    }
    return previews;
  }

  async function renderProjectGallery() {
    if (!gallery) return;
    releaseObjectUrls(gallery);
    const projects = await getAllProjects();
    gallery.innerHTML = `<header><div><h1>画布</h1><p>管理你的 Pixel Flow 创意项目</p></div><div><button class="primary" data-action="canvas-import">导入画布</button><input type="file" accept="application/json,.json,.gptcanvas.json" data-canvas-import-file hidden></div></header><section class="pf-project-grid"><button class="pf-project-new" data-action="canvas-create"><span>＋</span><strong>新建画布</strong></button>${projects.map((project) => `<article class="pf-project-card" data-project-card="${escapeHtml(project.id)}"><button class="pf-project-preview" data-action="canvas-open" data-project-id="${escapeHtml(project.id)}" aria-label="打开画布 ${escapeHtml(project.name)}"><span data-project-preview="${escapeHtml(project.id)}"></span></button><footer><div><strong>${escapeHtml(project.name)}</strong><small>${formatProjectDate(project.updatedAt)}</small></div><div class="pf-project-card-actions"><button data-action="canvas-card-export" data-project-id="${escapeHtml(project.id)}" aria-label="存储画布 ${escapeHtml(project.name)}" title="存储"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 20h14"/></svg></button><button data-action="canvas-card-rename" data-project-id="${escapeHtml(project.id)}" aria-label="重命名画布 ${escapeHtml(project.name)}" title="重命名"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z"/><path d="m14 7 3 3"/></svg></button><button class="danger" data-action="canvas-card-delete" data-project-id="${escapeHtml(project.id)}" aria-label="删除画布 ${escapeHtml(project.name)}" title="删除"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5"/></svg></button></div></footer></article>`).join("")}</section>`;
    for (const project of projects) {
      const target = gallery.querySelector(`[data-project-preview="${CSS.escape(project.id)}"]`);
      const previews = await projectPreview(project);
      target?.classList.toggle("is-empty", !previews.length);
      if (target) target.innerHTML = previews.length ? previews.map((url) => `<img src="${url}" data-pf-object-url="${url}" loading="lazy" decoding="async" alt="">`).join("") : "暂无预览";
    }
  }

  async function openProjectGallery() {
    panel?.classList.remove("is-open", "is-management");
    document.body.classList.remove("pf-library-expanded", "pf-library-management-open");
    if (!gallery) {
      gallery = document.createElement("section");
      gallery.className = "pf-project-gallery";
      document.body.append(gallery);
    }
    document.body.classList.add("pf-gallery-open");
    if (nativeCanvas) window.dispatchEvent(new CustomEvent("pixel-flow:native-management-active", { detail: { tab: "canvas" } }));
    rail?.querySelectorAll("[data-library-rail-tab]").forEach((button) => button.classList.toggle("is-active", button.dataset.libraryRailTab === "canvas"));
    await renderProjectGallery();
  }

  function closeProjectGallery() {
    document.body.classList.remove("pf-gallery-open", "pf-library-management-open");
    panel?.classList.remove("is-open", "is-management");
    gallery?.querySelectorAll(".is-menu-open").forEach((card) => card.classList.remove("is-menu-open"));
    rail?.querySelector('[data-library-rail-tab="canvas"]')?.classList.remove("is-active");
    if (nativeCanvas) window.dispatchEvent(new CustomEvent("pixel-flow:native-management-active", { detail: { tab: null } }));
  }

  const libraryBackupScopes = {
    prompts: { kind: "pixel-flow-prompt-library", label: "提示词库", filename: "Pixel-Flow-提示词库" },
    products: { kind: "pixel-flow-product-library", label: "产品素材库", filename: "Pixel-Flow-产品素材库" },
    references: { kind: "pixel-flow-gallery-library", label: "图库", filename: "Pixel-Flow-图库" },
    all: { kind: "pixel-flow-asset-library", label: "旧版完整资产库", filename: "Pixel-Flow-资产库" }
  };

  function scopedLibrary(library, scope) {
    if (scope === "prompts") return { ...emptyLibrary(), prompts: library.prompts };
    if (scope === "products") return { ...emptyLibrary(), media: library.media.filter((item) => item.kind === "product") };
    if (scope === "references") return { ...emptyLibrary(), media: library.media.filter((item) => item.kind === "reference") };
    return library;
  }

  async function exportAssetLibrary(scope = "all") {
    const config = libraryBackupScopes[scope];
    if (!config) return notify("未知的资产库类型", "error");
    const library = scopedLibrary(readLibrary(), scope);
    const assetIds = [...new Set([...library.media.map((item) => item.assetId), ...library.prompts.map((item) => item.exampleAssetId)].filter(Boolean))];
    const assets = [];
    for (const assetId of assetIds) {
      const asset = await getAsset(assetId);
      if (asset?.blob) assets.push({ id: assetId, dataUrl: await blobToDataUrl(asset.blob) });
    }
    await downloadJson({ version: 1, kind: config.kind, scope, exportedAt: new Date().toISOString(), library, assets }, `${config.filename}-${new Date().toISOString().slice(0, 10)}.json`);
    notify(`${config.label}已存储：${library.prompts.length} 条提示词，${library.media.length} 张图片`);
  }

  async function importAssetLibrary(file, scope = "all") {
    const config = libraryBackupScopes[scope];
    if (!config) return notify("未知的资产库类型", "error");
    notify(`正在导入${config.label}…`);
    let backup;
    try { backup = JSON.parse(await file.text()); } catch { return notify("资产库文件不是有效 JSON", "error"); }
    if (backup?.kind !== config.kind || backup?.version !== 1 || !backup.library) return notify(`文件类型不匹配：请选择${config.label}备份`, "error");
    try {
      const local = readLibrary();
      const incoming = scopedLibrary({ ...emptyLibrary(), ...backup.library }, scope);
      const replacePrompts = scope === "all" && incoming.promptSyncMode === "replace";
      const previousPromptAssetIds = [...new Set(local.prompts.map((item) => item.exampleAssetId).filter(Boolean))];
      const assetById = new Map((backup.assets || []).map((item) => [item.id, item]));
      const importedAssetIdMap = new Map();
      const importAssetId = async (sourceAssetId) => {
        if (!sourceAssetId) return "";
        if (importedAssetIdMap.has(sourceAssetId)) return importedAssetIdMap.get(sourceAssetId);
        const assetBackup = assetById.get(sourceAssetId);
        if (!assetBackup?.dataUrl) return "";
        const assetId = makeId("asset");
        await putAsset({ id: assetId, blob: dataUrlToBlob(assetBackup.dataUrl), createdAt: now() });
        importedAssetIdMap.set(sourceAssetId, assetId);
        if (importedAssetIdMap.size % 10 === 0) notify(`正在导入${config.label}：已写入 ${importedAssetIdMap.size} 张图片…`);
        return assetId;
      };
      for (const prompt of incoming.prompts || []) {
        const existing = local.prompts.find((item) => item.name === prompt.name);
        const importedExampleAssetId = await importAssetId(prompt.exampleAssetId);
        const exampleAssetId = replacePrompts ? importedExampleAssetId : importedExampleAssetId || existing?.exampleAssetId || "";
        if (existing) Object.assign(existing, prompt, { id: existing.id, exampleAssetId, updatedAt: now() });
        else local.prompts.push({ ...prompt, id: makeId("prompt"), exampleAssetId, updatedAt: now() });
      }
      if (replacePrompts) {
        const incomingNames = new Set((incoming.prompts || []).map((item) => item.name));
        local.prompts = local.prompts.filter((item) => incomingNames.has(item.name));
      }
      for (const media of incoming.media || []) {
        if (!['product','reference'].includes(media.kind)) continue;
        const existing = local.media.find((item) => item.kind === media.kind && item.name === media.name);
        const assetId = await importAssetId(media.assetId) || existing?.assetId;
        if (existing) Object.assign(existing, media, { id: existing.id, assetId: assetId || existing.assetId, createdAt: existing.createdAt || now() });
        else if (assetId) local.media.push({ ...media, id: makeId("media"), assetId, createdAt: now() });
      }
      saveLibrary(local);
      for (const assetId of previousPromptAssetIds) await deletePromptAssetIfUnused(assetId, local);
      renderPanel();
      notify(`${config.label}导入完成：${(incoming.prompts || []).length} 条提示词，${(incoming.media || []).length} 张图片`);
    } catch (error) {
      console.error("Pixel Flow library import failed", error);
      notify(`${config.label}导入失败：${error?.message || "无法读取或写入备份"}`, "error");
    }
  }

  function currentProjectId() {
    return document.querySelector(".project-picker select,.project select")?.value || "";
  }

  function selectedTaskId() {
    return document.querySelector(".react-flow__node-task.selected")?.getAttribute("data-id") || "";
  }

  function selectedImageContainerId() {
    return document.querySelector(".react-flow__node-image_container.selected")?.getAttribute("data-id") || "";
  }

  function selectedCanvasNodeIds() {
    if (Array.isArray(selectedNodeIdsSnapshot)) return [...selectedNodeIdsSnapshot];
    return [...document.querySelectorAll(".react-flow__node.selected[data-id]")].map((node) => node.getAttribute("data-id")).filter(Boolean);
  }

  function canvasPosition(clientX, clientY) {
    const stage = document.querySelector(".flow-stage");
    const viewport = document.querySelector(".react-flow__viewport");
    const rect = stage?.getBoundingClientRect();
    const matrix = viewport ? new DOMMatrixReadOnly(getComputedStyle(viewport).transform) : new DOMMatrixReadOnly();
    return { x: Math.round(((clientX - (rect?.left || 0)) - matrix.m41) / (matrix.a || 1)), y: Math.round(((clientY - (rect?.top || 0)) - matrix.m42) / (matrix.d || 1)) };
  }

  function notify(message, tone = "normal") {
    let toast = document.querySelector(".pf-library-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "pf-library-toast";
      document.body.append(toast);
    }
    toast.textContent = message;
    toast.dataset.tone = tone;
    toast.classList.add("is-visible");
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => toast.classList.remove("is-visible"), 2400);
  }

  async function addMediaNode(media, position, targetTaskId = "") {
    const result = await runCanvasCommand({ type: "media.add", assetId: media.assetId, title: media.name, position, targetTaskId: targetTaskId || undefined });
    return result?.selectedNodeIds?.[0];
  }

  async function applyPrompt(prompt, mode) {
    const taskId = selectedTaskId();
    if (!taskId) return notify("请先选中一个生图任务", "error");
    await runCanvasCommand({ type: "task.applyPrompt", taskId, content: prompt.content, mode });
    notify(mode === "append" ? "提示词已追加" : "提示词已替换");
    setTimeout(() => location.reload(), 350);
  }

  async function createTaskFromPrompt(prompt) {
    const position = canvasPosition(window.innerWidth / 2, window.innerHeight / 2);
    const selectedIds = selectedCanvasNodeIds();
    await runCanvasCommand({ type: "task.createFromPrompt", prompt: prompt.content, position, sourceNodeIds: selectedIds });
    notify(selectedIds.length ? `已创建生图任务并连接 ${selectedIds.length} 个选中图片来源` : "已从提示词创建独立生图任务");
  }

  async function applyMedia(media) {
    const taskId = selectedTaskId();
    const containerId = selectedImageContainerId();
    if (containerId) {
      await runCanvasCommand({ type: "container.addAsset", assetId: media.assetId, title: media.name, containerId });
      notify("已将素材放入选中的图片容器");
      return;
    }
    const project = await getProject();
    if (!project) return notify("找不到当前画布", "error");
    const task = project.graph.nodes.find((node) => node.id === taskId && node.kind === "task");
    const position = task ? { x: task.position.x - 380, y: task.position.y + (task.inputEdgeOrder?.length || 0) * 96 } : canvasPosition(window.innerWidth / 2, window.innerHeight / 2);
    await addMediaNode(media, position, task?.id || "");
    notify(task ? "已将素材放入画布并连接选中任务" : "已将素材作为独立图片放入画布");
  }

  function closeEdgeDisconnect() {
    document.querySelector(".pf-edge-disconnect")?.remove();
    document.querySelectorAll(".react-flow__edge.pf-edge-selected").forEach((edge) => edge.classList.remove("pf-edge-selected"));
  }

  async function showEdgeDisconnect(edgeElement, clientX, clientY) {
    const edgeId = edgeElement.getAttribute("data-id");
    const project = await getProject();
    const edge = project?.graph?.edges?.find((item) => item.id === edgeId);
    closeEdgeDisconnect();
    if (!edge || edge.kind === "output") return;
    edgeElement.classList.add("pf-edge-selected");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "pf-edge-disconnect nodrag nowheel";
    button.dataset.action = "edge-disconnect";
    button.dataset.edgeId = edge.id;
    button.style.left = `${clientX}px`;
    button.style.top = `${clientY}px`;
    button.title = "断开连接";
    button.setAttribute("aria-label", "断开连接");
    button.innerHTML = '<span aria-hidden="true">×</span><small>断开</small>';
    document.body.append(button);
  }

  async function disconnectEdge(edgeId) {
    await runCanvasCommand({ type: "edge.disconnect", edgeId });
    closeEdgeDisconnect();
    notify("连接已断开");
  }

  async function importMedia(files, kind) {
    const library = readLibrary();
    for (const file of files) {
      if (!file.type.startsWith("image/")) continue;
      const assetId = makeId("asset");
      await putAsset({ id: assetId, blob: file, createdAt: now() });
      library.media.unshift({ id: makeId("media"), assetId, kind, name: file.name, tags: [], createdAt: now() });
    }
    saveLibrary(library);
    renderPanel();
    notify(`已导入 ${files.length} 张图片`);
  }

  function tabButton(id, label) {
    return `<button type="button" data-tab="${id}" class="${activeTab === id ? "is-active" : ""}">${label}</button>`;
  }

  function promptMatches(item, query) {
    const matchesSearch = `${item.name} ${item.content} ${(item.tags || []).join(" ")}`.toLowerCase().includes(query);
    return matchesSearch && (!activeLibraryTag || (item.tags || []).includes(activeLibraryTag));
  }

  function libraryTags(library, tab = activeTab) {
    const items = tab === "prompts" ? library.prompts : library.media.filter((item) => item.kind === (tab === "products" ? "product" : "reference"));
    return [...new Set(items.flatMap((item) => normalizeTags(item.tags)))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  }

  function libraryTagFilters(library, tab = activeTab) {
    const tags = libraryTags(library, tab);
    if (!tags.length) return "";
    return `<nav class="pf-prompt-filters" aria-label="标签筛选"><button data-action="library-tag-filter" data-tag="" class="${activeLibraryTag ? "" : "is-active"}">全部</button>${tags.map((tag) => `<button data-action="library-tag-filter" data-tag="${escapeHtml(tag)}" class="${activeLibraryTag === tag ? "is-active" : ""}">${escapeHtml(tag)}</button>`).join("")}</nav>`;
  }

  function promptTagBadges(item) {
    return `<div class="pf-prompt-tags">${(item.tags || []).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>`;
  }

  function promptList(library, query) {
    const items = library.prompts.filter((item) => promptMatches(item, query));
    return `<section class="pf-library-list">${items.map((item) => `<article class="pf-prompt-item pf-tagged-library-card"><div class="pf-prompt-example-thumb" ${item.exampleAssetId ? `data-thumb="${item.exampleAssetId}"` : ""}>${item.exampleAssetId ? "载入中" : "暂无示例图"}</div><header class="pf-management-card-meta"><strong title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</strong><span><button data-action="prompt-edit" data-id="${item.id}" aria-label="编辑提示词 ${escapeHtml(item.name)}" title="编辑">${libraryCardIcon("edit")}</button><button class="danger" data-action="prompt-delete" data-id="${item.id}" aria-label="删除提示词 ${escapeHtml(item.name)}" title="删除">${libraryCardIcon("delete")}</button></span></header>${promptTagBadges(item)}</article>`).join("") || "<p class=\"pf-empty\">没有符合当前筛选的提示词</p>"}</section>`;
  }

  function mediaList(library, kind, query) {
    const items = library.media.filter((item) => item.kind === kind && `${item.name} ${(item.tags || []).join(" ")}`.toLowerCase().includes(query) && (!activeLibraryTag || (item.tags || []).includes(activeLibraryTag)));
    return `<section class="pf-media-grid pf-media-grid--${kind}">${items.map((item) => `<article class="pf-media-item pf-tagged-library-card" data-id="${item.id}"><div data-thumb="${item.assetId}">载入中</div><header class="pf-management-card-meta"><strong title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</strong><span><button data-action="media-edit" data-id="${item.id}" aria-label="编辑素材 ${escapeHtml(item.name)}" title="编辑">${libraryCardIcon("rename")}</button><button class="danger" data-action="media-delete" data-id="${item.id}" aria-label="删除素材 ${escapeHtml(item.name)}" title="删除">${libraryCardIcon("delete")}</button></span></header>${promptTagBadges(item)}</article>`).join("") || "<p class=\"pf-empty\">还没有图片素材</p>"}</section>`;
  }

  function promptUsageList(library, query) {
    const items = library.prompts.filter((item) => promptMatches(item, query));
    return `<section class="pf-library-list pf-usage-list">${items.map((item) => `<article class="pf-prompt-item" data-id="${item.id}"><div class="pf-prompt-example-thumb" ${item.exampleAssetId ? `data-thumb="${item.exampleAssetId}"` : ""}>${item.exampleAssetId ? "载入中" : "暂无示例图"}</div><strong>${escapeHtml(item.name)}</strong>${promptTagBadges(item)}<footer><button data-action="prompt-create-task" data-id="${item.id}">创建任务</button></footer></article>`).join("") || "<p class=\"pf-empty\">没有符合当前筛选的提示词</p>"}</section>`;
  }

  function mediaUsageList(library, kind, query) {
    const items = library.media.filter((item) => item.kind === kind && `${item.name} ${(item.tags || []).join(" ")}`.toLowerCase().includes(query) && (!activeLibraryTag || (item.tags || []).includes(activeLibraryTag)));
    return `<section class="pf-media-grid pf-media-grid--${kind} pf-usage-media-grid">${items.map((item) => kind === "reference"
      ? `<article class="pf-media-item pf-reference-card" draggable="true" data-drag-kind="media" data-id="${item.id}"><button class="pf-reference-thumb" data-action="media-apply" data-id="${item.id}" aria-label="从图库添加 ${escapeHtml(item.name)}"><div data-thumb="${item.assetId}">载入中</div></button><footer class="pf-reference-meta"><strong title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</strong><button class="danger" data-action="media-delete" data-id="${item.id}" aria-label="删除素材 ${escapeHtml(item.name)}" title="删除">${libraryCardIcon("delete")}</button></footer></article>`
      : `<article class="pf-media-item pf-product-card" draggable="true" data-drag-kind="media" data-id="${item.id}"><button class="pf-product-thumb" data-action="media-apply" data-id="${item.id}" aria-label="从产品素材库添加 ${escapeHtml(item.name)}"><div data-thumb="${item.assetId}">载入中</div></button><strong title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</strong></article>`).join("") || "<p class=\"pf-empty\">还没有可调用的图片素材</p>"}</section>`;
  }


  function renderPanel() {
    if (!panel) return;
    releaseObjectUrls(panel);
    const library = readLibrary();
    const query = searchQuery.trim().toLowerCase();
    let content = "";
    if (panelMode === "usage") {
      if (activeTab === "prompts") content = promptUsageList(library, query);
      if (activeTab === "products") content = mediaUsageList(library, "product", query);
      if (activeTab === "references") content = mediaUsageList(library, "reference", query);
      const titles = { prompts: ["调用提示词", "选择提示词直接创建生图任务"], products: ["调用产品素材", "选择并放入当前画布"], references: ["调用图库", "点击调用，双击画布图片可收藏"] };
      const filterBar = ["prompts", "products", "references"].includes(activeTab) ? libraryTagFilters(library) : "";
      const usageSearch = "";
      panel.innerHTML = `<header><div><strong>${titles[activeTab][0]}</strong><small>${titles[activeTab][1]}</small></div><button class="pf-panel-collapse" data-action="panel-collapse" aria-label="收起调用侧栏" title="收起调用侧栏"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3.5 5.5 8l4.5 4.5"/></svg></button></header>${usageSearch}${filterBar}<div class="pf-library-content">${content}</div><footer class="pf-usage-footer"><button data-action="open-library-management" data-library="${activeTab}">前往库管理</button></footer>`;
      rail?.querySelectorAll("[data-library-rail-tab]").forEach((button) => button.classList.toggle("is-active", button.dataset.libraryRailTab === activeTab));
      void hydrateThumbs(panel);
      return;
    }
    if (activeTab === "canvas") {
      const select = document.querySelector(".project-picker select,.project select");
      const options = [...(select?.options || [])].map((option) => `<option value="${escapeHtml(option.value)}" ${option.value === select.value ? "selected" : ""}>${escapeHtml(option.textContent)}</option>`).join("");
      content = `<section class="pf-canvas-manager"><label>当前画布<select data-action="canvas-switch">${options}</select></label><div class="pf-canvas-primary-actions"><button data-action="canvas-create">新建画布</button><button data-action="canvas-rename">重命名</button></div><div class="pf-canvas-file-actions"><button data-action="canvas-import">导入画布</button><button class="primary" data-action="canvas-export">存储当前画布</button><input type="file" accept="application/json,.json,.gptcanvas.json" data-canvas-import-file hidden></div><button class="pf-canvas-delete" data-action="canvas-delete">删除当前画布</button><p>画布会持续保存在当前浏览器中。存储文件包含节点、连线和关联图片，可在另一台设备重新导入。</p><div class="pf-canvas-file-actions"><button data-action="legacy-asset-import">导入旧版完整资产库</button><input type="file" accept="application/json,.json" data-legacy-asset-import-file hidden></div><p>仅用于迁移旧版 <code>pixel-flow-asset-library</code> 完整备份。新备份请到各自库中分别导入。</p></section>`;
    }
    if (activeTab === "prompts") {
      content = promptList(library, query);
    }
    if (activeTab === "products") content = `<div class="pf-media-management-toolbar"><label class="pf-import"><input type="file" accept="image/*" multiple data-import-kind="product">导入产品素材</label></div>${mediaList(library, "product", query)}`;
    if (activeTab === "references") content = `<div class="pf-media-management-toolbar"><label class="pf-import"><input type="file" accept="image/*" multiple data-import-kind="reference">导入图片</label></div>${mediaList(library, "reference", query)}`;
    const titles = { canvas: ["画布管理", "创建、整理与迁移画布"], prompts: ["提示词库", "新增、整理与删除完整提示词"], products: ["产品素材库", "导入、整理与删除产品图片"], references: ["图库", "沉淀、整理与删除视觉参考"] };
    const backupLabels = { prompts: "提示词库", products: "产品素材库", references: "图库" };
    const backupLabel = backupLabels[activeTab] || "资产库";
    const backupActions = activeTab === "canvas" ? "" : `<div class="pf-library-backup-actions"><button data-action="asset-export" data-library-scope="${activeTab}">存储${backupLabel}</button><button data-action="asset-import" data-library-scope="${activeTab}">导入${backupLabel}</button><input type="file" accept="application/json,.json" data-asset-import-file data-library-scope="${activeTab}" hidden></div>`;
    const compactManagementTabs = ["prompts", "products", "references"];
    const compactHeaderTabs = compactManagementTabs;
    const search = "";
    const filterBar = ["prompts", "products", "references"].includes(activeTab) ? libraryTagFilters(library) : "";
    const headerActions = compactHeaderTabs.includes(activeTab) ? backupActions : `<button class="pf-panel-collapse" data-action="panel-collapse" aria-label="返回画布列表" title="返回画布列表"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3.5 5.5 8l4.5 4.5"/></svg></button>`;
    const managementToolbar = activeTab === "prompts" ? `<div class="pf-prompt-management-toolbar">${filterBar}<button class="primary" data-action="prompt-create">新增提示词</button></div>` : filterBar;
    panel.innerHTML = `<header><div><strong>${titles[activeTab][0]}</strong><small>${titles[activeTab][1]}</small></div>${headerActions}</header>${compactHeaderTabs.includes(activeTab) ? "" : backupActions}${search}${managementToolbar}<div class="pf-library-content">${content}</div>`;
    rail?.querySelectorAll("[data-library-rail-tab]").forEach((button) => button.classList.toggle("is-active", button.dataset.libraryRailTab === activeTab));
    void hydrateThumbs(panel);
  }

  function removeMediaCard(target) {
    const card = target.closest(".pf-media-item");
    const grid = card?.closest(".pf-media-grid");
    if (!card || !grid) return;
    releaseObjectUrls(card);
    card.remove();
    if (!grid.querySelector(".pf-media-item")) grid.innerHTML = '<p class="pf-empty">还没有图片素材</p>';
  }

  const thumbObserver = new IntersectionObserver((entries, observer) => {
    for (const entry of entries) if (entry.isIntersecting) { observer.unobserve(entry.target); void hydrateThumb(entry.target); }
  }, { rootMargin: "240px 0px" });

  async function hydrateThumb(target) {
    if (target.dataset.thumbLoaded === "1") return;
    target.dataset.thumbLoaded = "1";
    const asset = await getAsset(target.getAttribute("data-thumb"));
    if (!asset?.blob || !target.isConnected) return;
    const url = managedObjectUrl(asset.blob);
    target.setAttribute("data-pf-object-url", url);
    if (target.matches("span")) target.style.backgroundImage = `url(${url})`;
    else {
      target.innerHTML = `<img src="${url}" loading="lazy" decoding="async" alt="">`;
      try { await target.querySelector("img")?.decode(); } catch {}
      const masonryRoot = target.closest(".pf-library-panel") || document;
      layoutMediaMasonry(masonryRoot);
      requestAnimationFrame(() => requestAnimationFrame(() => layoutMediaMasonry(masonryRoot)));
    }
  }

  async function hydrateThumbs(root) {
    for (const target of root.querySelectorAll("[data-thumb]")) thumbObserver.observe(target);
    layoutMediaMasonry(root);
  }

  const observedMasonryGrids = new WeakMap();
  const observedMasonryItems = new WeakMap();
  function layoutMediaMasonry(root) {
    for (const grid of root.querySelectorAll(".pf-media-grid--reference")) {
      const layout = () => requestAnimationFrame(() => {
        const scrollContainer = grid.closest(".pf-library-content");
        const preservedScrollTop = scrollContainer?.scrollTop;
        const items = [...grid.querySelectorAll(".pf-media-item")];
        if (grid.closest(".pf-library-panel.is-management")) {
          const styles = getComputedStyle(grid);
          const columns = Math.max(1, styles.gridTemplateColumns.split(" ").length);
          const rowHeight = parseFloat(styles.gridAutoRows) || 8;
          const rowGap = parseFloat(styles.rowGap) || 6;
          for (const item of items) { item.style.gridColumnStart = ""; item.style.gridRowStart = ""; item.style.gridRowEnd = "auto"; }
          const columnEnds = Array(columns).fill(1);
          for (const item of items) {
            const column = columnEnds.indexOf(Math.min(...columnEnds));
            const span = Math.max(1, Math.ceil((item.getBoundingClientRect().height + rowGap) / (rowHeight + rowGap)));
            item.style.gridColumnStart = `${column + 1}`;
            item.style.gridRowStart = `${columnEnds[column]}`;
            item.style.gridRowEnd = `span ${span}`;
            columnEnds[column] += span;
          }
        } else {
          for (const item of items) {
            item.style.gridRowEnd = "auto";
            item.style.gridRowEnd = `span ${Math.ceil((item.getBoundingClientRect().height + 14) / 22)}`;
          }
        }
        if (scrollContainer && preservedScrollTop !== undefined && scrollContainer.scrollTop !== preservedScrollTop) {
          scrollContainer.scrollTop = preservedScrollTop;
        }
      });
      layout();
      for (const item of grid.querySelectorAll(".pf-media-item")) {
        if (observedMasonryItems.has(item)) continue;
        const observer = new ResizeObserver(layout);
        observer.observe(item);
        observedMasonryItems.set(item, observer);
      }
      if (!observedMasonryGrids.has(grid)) {
        const observer = new ResizeObserver(layout);
        observer.observe(grid);
        observedMasonryGrids.set(grid, observer);
      }
    }
  }

  function openPanel(tab = activeTab) {
    if (tab === "canvas") { void openProjectGallery(); return; }
    if (document.body.classList.contains("pf-gallery-open")) { openLibraryManagement(tab); return; }
    closeProjectGallery();
    panelMode = "usage";
    activeTab = tab;
    activeLibraryTag = "";
    searchQuery = "";
    if (!panel) {
      panel = document.createElement("aside");
      panel.className = "pf-library-panel";
      document.body.append(panel);
    }
    renderPanel();
    requestAnimationFrame(() => {
      panel.classList.remove("is-management");
      panel.classList.add("is-open");
      document.body.classList.add("pf-library-expanded");
    });
  }

  function openLibraryManagement(tab) {
    activeTab = tab;
    activeLibraryTag = "";
    panelMode = "management";
    searchQuery = "";
    if (!panel) { panel = document.createElement("aside"); panel.className = "pf-library-panel"; document.body.append(panel); }
    panel.classList.add("is-management", "is-open");
    document.body.classList.add("pf-gallery-open", "pf-library-management-open");
    document.body.classList.remove("pf-library-expanded");
    if (nativeCanvas) window.dispatchEvent(new CustomEvent("pixel-flow:native-management-active", { detail: { tab } }));
    renderPanel();
  }

  function collapsePanel() {
    if (panel?.classList.contains("is-management")) { void openProjectGallery(); return; }
    panel?.classList.remove("is-open");
    document.body.classList.remove("pf-library-expanded");
    if (nativeCanvas) window.dispatchEvent(new CustomEvent("pixel-flow:native-management-active", { detail: { tab: null } }));
    const galleryOpen = document.body.classList.contains("pf-gallery-open");
    rail?.querySelectorAll("[data-library-rail-tab]").forEach((button) => button.classList.toggle("is-active", galleryOpen && button.dataset.libraryRailTab === "canvas"));
  }

  function mountLibraryRail() {
    if (nativeCanvas) return;
    if (rail) return;
    rail = document.createElement("nav");
    rail.className = "pf-library-rail";
    rail.setAttribute("aria-label", "创意资产库");
    rail.innerHTML = `
      <button class="pf-rail-mark" data-library-rail-tab="canvas" data-label="画布管理" aria-label="展开画布管理">PF</button>
      <button data-library-rail-tab="prompts" data-label="提示词库" aria-label="展开提示词库"><svg viewBox="0 0 24 24"><path d="M5 5h14v11H9l-4 3V5Z"/><path d="M8 9h8M8 12h6"/></svg></button>
      <button data-library-rail-tab="products" data-label="产品素材库" aria-label="展开产品素材库"><svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" rx="2"/><path d="m7 16 3-4 3 3 2-2 3 3M9 9h.01"/></svg></button>
      <button data-library-rail-tab="references" data-label="图库" aria-label="展开图库"><svg viewBox="0 0 24 24"><rect x="7" y="4" width="13" height="13" rx="2"/><path d="M17 20H6a2 2 0 0 1-2-2V7M10 13l3-3 4 4"/></svg></button>
      <span class="pf-rail-spacer"></span>
      <button data-action="open-api-settings" data-label="API 设置" aria-label="打开 API 设置"><svg viewBox="0 0 24 24"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/><circle cx="12" cy="12" r="3.5"/></svg></button>`;
    document.body.append(rail);
  }

  function enhanceTopbar() {
    document.querySelector(".pf-library-button")?.remove();
    if (!currentProjectId()) return;
    mountLibraryRail();
  }


  document.addEventListener("click", async (event) => {
    const target = event.target instanceof Element ? event.target.closest("[data-action],[data-tab],[data-library-rail-tab]") : null;
    if (!target) {
      if (nativeCanvas) return;
      const edgeElement = event.target instanceof Element ? event.target.closest(".react-flow__edge") : null;
      if (edgeElement) {
        event.stopPropagation();
        await showEdgeDisconnect(edgeElement, event.clientX, event.clientY);
      } else if (!(event.target instanceof Element && event.target.closest(".pf-edge-disconnect"))) {
        closeEdgeDisconnect();
      }
      return;
    }
    if (target.hasAttribute("data-library-rail-tab")) { searchQuery = ""; activeLibraryTag = ""; openPanel(target.dataset.libraryRailTab); return; }
    if (target.hasAttribute("data-tab")) { activeTab = target.getAttribute("data-tab"); searchQuery = ""; activeLibraryTag = ""; renderPanel(); return; }
    const action = target.getAttribute("data-action");
    if (action === "panel-collapse") { collapsePanel(); return; }
    if (action === "open-library-management") { await openProjectGallery(); openLibraryManagement(target.dataset.library || activeTab); return; }
    if (action === "canvas-create") { document.querySelector('.project-picker button[aria-label="新建画布"],.project-picker button[title="新建画布"],.project button[title="新建画布"]')?.click(); closeProjectGallery(); return; }
    if (action === "canvas-rename") { document.querySelector('.project-picker button[aria-label="重命名画布"],.project-picker button[title="重命名画布"],.project button[title="重命名画布"]')?.click(); setTimeout(() => void renderProjectGallery(), 80); return; }
    if (action === "canvas-import") { (gallery?.querySelector("[data-canvas-import-file]") || panel?.querySelector("[data-canvas-import-file]"))?.click(); return; }
    if (action === "canvas-export") { await exportCurrentCanvas(); return; }
    if (action === "canvas-card-export") { await exportCurrentCanvas(target.dataset.projectId); return; }
    if (action === "canvas-delete") { await deleteCurrentCanvas(); return; }
    if (action === "open-api-settings") { document.querySelector(".api-settings-button")?.click(); return; }
    if (action === "canvas-open") {
      window.dispatchEvent(new CustomEvent("pixel-flow:project-refresh", { detail: { projectId: target.dataset.projectId } }));
      closeProjectGallery();
      return;
    }
    if (action === "canvas-menu") {
      const card = target.closest(".pf-project-card");
      gallery?.querySelectorAll(".pf-project-card.is-menu-open").forEach((item) => { if (item !== card) item.classList.remove("is-menu-open"); });
      card?.classList.toggle("is-menu-open");
      return;
    }
    if (action === "canvas-card-rename") {
      const project = await getProject(target.dataset.projectId);
      const name = project ? await openCanvasDialog({ title: "重命名画布", message: "输入一个容易识别的画布名称。", confirmLabel: "保存名称", inputValue: project.name || "" }) : false;
      if (project && name) { await runCanvasCommand({ type: "project.rename", projectId: project.id, name }); await renderProjectGallery(); notify(`画布已重命名为“${name}”`); }
      return;
    }
    if (action === "canvas-card-delete") { await deleteCanvasById(target.dataset.projectId); return; }
    if (action === "asset-export") { await exportAssetLibrary(target.dataset.libraryScope); return; }
    if (action === "asset-import") { panel?.querySelector(`[data-asset-import-file][data-library-scope="${target.dataset.libraryScope}"]`)?.click(); return; }
    if (action === "legacy-asset-import") { panel?.querySelector("[data-legacy-asset-import-file]")?.click(); return; }
    if (action === "edge-disconnect") { event.stopPropagation(); await disconnectEdge(target.dataset.edgeId); return; }
    if (action === "prompt-create") { await editPrompt(); return; }
    if (action === "prompt-edit") { await editPrompt(target.dataset.id); return; }
    if (action === "library-tag-filter") { activeLibraryTag = target.dataset.tag || ""; renderPanel(); return; }
    if (action === "prompt-create-task") {
      const prompt = readLibrary().prompts.find((item) => item.id === target.dataset.id);
      if (prompt) await createTaskFromPrompt(prompt);
      return;
    }
    if (["prompt-replace", "prompt-append", "prompt-delete"].includes(action)) {
      const library = readLibrary(); const prompt = library.prompts.find((item) => item.id === target.dataset.id);
      if (action === "prompt-delete") { const exampleAssetId = prompt?.exampleAssetId; library.prompts = library.prompts.filter((item) => item.id !== target.dataset.id); saveLibrary(library); await deletePromptAssetIfUnused(exampleAssetId, library); renderPanel(); }
      else if (prompt) await applyPrompt(prompt, action === "prompt-append" ? "append" : "replace");
    }
    if (["media-apply", "media-delete"].includes(action)) {
      const library = readLibrary(); const media = library.media.find((item) => item.id === target.dataset.id);
      if (action === "media-delete") { library.media = library.media.filter((item) => item.id !== target.dataset.id); saveLibrary(library); removeMediaCard(target); }
      else if (media) await applyMedia(media);
    }
    if (action === "media-edit") {
      const library = readLibrary(); const media = library.media.find((item) => item.id === target.dataset.id);
      const result = media ? await openMediaDialog(media) : false;
      if (media && result) { Object.assign(media, { name: result.name, tags: result.tags, updatedAt: now() }); saveLibrary(library); renderPanel(); notify("素材已更新"); }
      return;
    }
  });

  document.addEventListener("input", (event) => {
    if (event.target?.matches?.("[data-library-search]")) {
      if (event.isComposing) return;
      const caret = event.target.selectionStart ?? event.target.value.length;
      searchQuery = event.target.value;
      renderPanel();
      const search = panel.querySelector("[data-library-search]");
      search?.focus();
      search?.setSelectionRange(caret, caret);
    }
  });

  document.addEventListener("change", (event) => {
    const input = event.target;
    if (input?.matches?.('[data-action="canvas-switch"]')) {
      const select = document.querySelector(".project-picker select,.project select");
      if (select) { select.value = input.value; select.dispatchEvent(new Event("change", { bubbles: true })); setTimeout(() => openPanel("canvas"), 80); }
      return;
    }
    if (input instanceof HTMLInputElement && input.matches("[data-canvas-import-file]") && input.files?.[0]) { void importCanvas(input.files[0]); input.value = ""; return; }
    if (input instanceof HTMLInputElement && input.matches("[data-asset-import-file]") && input.files?.[0]) { void importAssetLibrary(input.files[0], input.dataset.libraryScope); input.value = ""; return; }
    if (input instanceof HTMLInputElement && input.matches("[data-legacy-asset-import-file]") && input.files?.[0]) { void importAssetLibrary(input.files[0], "all"); input.value = ""; return; }
    if (input instanceof HTMLInputElement && input.dataset.importKind && input.files?.length) void importMedia([...input.files], input.dataset.importKind);
  });

  function addCanvasImageToGallery(canvasImage) {
    const library = readLibrary();
    const existing = library.media.find((item) => item.kind === "reference" && item.assetId === canvasImage.assetId);
    if (existing) { notify("这张图片已在图库中"); return false; }
    library.media.unshift({ id: makeId("media"), kind: "reference", assetId: canvasImage.assetId, name: canvasImage.name || "画布图片", tags: [], createdAt: now() });
    saveLibrary(library); renderPanel(); notify("已加入图库");
    return true;
  }

  function showGallerySavedFeedback(image) {
    const host = image.closest(".media-node__preview");
    if (!host) return;
    host.querySelector(".pf-gallery-saved-feedback")?.remove();
    const feedback = document.createElement("span");
    feedback.className = "pf-gallery-saved-feedback";
    feedback.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg><b>已收藏</b>';
    host.append(feedback);
    host.classList.remove("pf-gallery-save-flash");
    void host.offsetWidth;
    host.classList.add("pf-gallery-save-flash");
    setTimeout(() => { feedback.remove(); host.classList.remove("pf-gallery-save-flash"); }, 1900);
  }

  let lastCanvasImageClick = { assetId: "", at: 0 };
  document.addEventListener("click", (event) => {
    const image = event.target instanceof Element ? event.target.closest("[data-canvas-library-asset-id]") : null;
    if (!image) return;
    const assetId = image.dataset.canvasLibraryAssetId;
    const clickedAt = performance.now();
    const isDoubleClick = event.detail >= 2 || (lastCanvasImageClick.assetId === assetId && clickedAt - lastCanvasImageClick.at <= 500);
    lastCanvasImageClick = { assetId, at: clickedAt };
    if (!isDoubleClick) return;
    lastCanvasImageClick = { assetId: "", at: 0 };
    const saved = addCanvasImageToGallery({
      assetId,
      name: image.dataset.canvasLibraryName || "画布图片"
    });
    if (saved) showGallerySavedFeedback(image);
  }, true);

  document.addEventListener("dragstart", (event) => {
    const source = event.target instanceof Element ? event.target.closest("[data-drag-kind]") : null;
    if (!source || !event.dataTransfer) return;
    event.dataTransfer.setData("application/x-pixel-flow-library", JSON.stringify({ kind: source.dataset.dragKind, id: source.dataset.id }));
  });

  document.addEventListener("dragover", (event) => { if (event.dataTransfer?.types.includes("application/x-pixel-flow-library")) event.preventDefault(); }, true);
  document.addEventListener("drop", async (event) => {
    const raw = event.dataTransfer?.getData("application/x-pixel-flow-library");
    if (!raw || panel?.contains(event.target)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const item = JSON.parse(raw); const library = readLibrary(); const position = canvasPosition(event.clientX, event.clientY);
    if (item.kind === "media") { const media = library.media.find((entry) => entry.id === item.id); if (media) await addMediaNode(media, position); }
  }, true);

  window.addEventListener("pixel-flow:open-library-management", (event) => {
    const tab = event instanceof CustomEvent && ["prompts", "products", "references"].includes(event.detail?.tab) ? event.detail.tab : "prompts";
    openLibraryManagement(tab);
  });
  window.addEventListener("pixel-flow:open-legacy-library", (event) => {
    const tab = event instanceof CustomEvent && ["prompts", "products", "references"].includes(event.detail?.tab) ? event.detail.tab : "prompts";
    selectedNodeIdsSnapshot = event instanceof CustomEvent && Array.isArray(event.detail?.selectedNodeIds) ? [...event.detail.selectedNodeIds] : selectedCanvasNodeIds();
    openPanel(tab);
    if (nativeCanvas) setTimeout(() => { panel?.classList.add("is-open"); document.body.classList.add("pf-library-expanded"); window.dispatchEvent(new CustomEvent("pixel-flow:native-management-active", { detail: { tab } })); }, 0);
  });
  window.addEventListener("pixel-flow:canvas-selection-changed", (event) => {
    if (event instanceof CustomEvent && Array.isArray(event.detail?.selectedNodeIds)) selectedNodeIdsSnapshot = [...event.detail.selectedNodeIds];
  });
  window.addEventListener("pixel-flow:open-canvas-management", () => void openProjectGallery());
  window.addEventListener("pixel-flow:close-legacy-library", closeProjectGallery);

  let enhanceFrame = 0;
  const observer = new MutationObserver((mutations) => {
    if (!mutations.some((mutation) => [...mutation.addedNodes].some((node) => node instanceof Element && (node.matches(".topbar,.task-card,.project-picker") || node.querySelector(".topbar,.task-card,.project-picker"))))) return;
    cancelAnimationFrame(enhanceFrame);
    enhanceFrame = requestAnimationFrame(() => {
      enhanceTopbar();
    });
  });
  observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
  document.addEventListener("DOMContentLoaded", () => {
    enhanceTopbar();
  }, { once: true });
})();
