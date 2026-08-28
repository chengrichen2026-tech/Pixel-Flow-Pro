import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("library search preserves the caret after rerendering filtered results", async () => {
  const source = await readFile(new URL("production/asset-library.js", root), "utf8");
  assert.match(source, /if \(event\.isComposing\) return/);
  assert.match(source, /const caret = event\.target\.selectionStart \?\? event\.target\.value\.length/);
  assert.match(source, /search\?\.setSelectionRange\(caret, caret\)/);
});

test("production loads the local asset and generation template module", async () => {
  const html = await readFile(new URL("production/index.html", root), "utf8");
  const build = await readFile(new URL("scripts/build-extension.mjs", root), "utf8");
  assert.match(html, /asset-library\.js/);
  assert.match(build, /production", "asset-library\.js/);
});

test("new prompt tasks and templates default to API generation", async () => {
  const source = await readFile(new URL("production/asset-library.js", root), "utf8");
  assert.match(source, /prompt\.content[^}]+generationMode: "api"/s);
  assert.match(source, /name: "未命名生图模板"[^}]+generationMode: "api"/s);
  assert.match(source, /data\.get\("generationMode"\) \|\| "api"/);
});

test("the asset enhancer waits for the original canvas database to be ready", async () => {
  const source = await readFile(new URL("production/asset-library.js", root), "utf8");
  assert.match(source, /if \(!projectId\) return null/);
  assert.match(source, /if \(currentProjectId\(\)\) void enhanceTemplateNodes\(\)/);
  assert.match(source, /setTimeout\(\(\) => \{\s*if \(currentProjectId\(\)\)/);
});

test("the MVP exposes prompt, product, reference, and template libraries", async () => {
  const source = await readFile(new URL("production/asset-library.js", root), "utf8");
  assert.match(source, /提示词库/);
  assert.match(source, /产品素材/);
  assert.match(source, /references: \["图库"/);
  assert.match(source, /生图模板/);
  assert.match(source, /prompt-create-task/);
  assert.match(source, /function createTaskFromPrompt\(prompt\)/);
  assert.match(source, /function selectedCanvasNodeIds\(\)/);
  assert.match(source, /selectedIds\.length === 1/);
  assert.match(source, /node\.kind === "image" \|\| node\.kind === "result"/);
  assert.match(source, /source: selectedSource\.id, target: taskId, kind: "input"/);
  assert.match(source, /pixel-flow:project-refresh/);
  const createFromPrompt = source.slice(source.indexOf("async function createTaskFromPrompt"), source.indexOf("async function applyMedia"));
  assert.doesNotMatch(createFromPrompt, /collapsePanel\(\)|location\.reload\(\)/);
  const addMedia = source.slice(source.indexOf("async function addMediaNode"), source.indexOf("async function applyPrompt"));
  assert.match(addMedia, /pixel-flow:project-refresh/);
  assert.doesNotMatch(addMedia, /location\.reload\(\)/);
  assert.match(source, /task \? \{ x: task\.position\.x - 380/);
  assert.match(source, /task\?\.id \|\| ""/);
  assert.match(source, /application\/x-pixel-flow-library/);
});

test("generation templates compose mixed prompt fields and cap image count at four", async () => {
  const source = await readFile(new URL("production/asset-library.js", root), "utf8");
  assert.match(source, /文案要求/);
  assert.match(source, /背景描述/);
  assert.match(source, /构图描述/);
  assert.doesNotMatch(source.slice(source.indexOf("function templateEditor"), source.indexOf("function renderPanel")), /完整提示词/);
  assert.match(source, /choose-tagged-prompt/);
  assert.match(source, /taggedPromptOptions\("构图"\)/);
  assert.match(source, /taggedPromptOptions\("背景"\)/);
  assert.match(source, /已选 \$\{template\.productIds\.length\} 张/);
  assert.match(source, /已选 \$\{template\.referenceIds\.length\} 张/);
  assert.match(source, /Math\.min\(4, Math\.max\(1/);
  assert.match(source, /data-final-prompt/);
  assert.match(source, /savePreset/);
});

test("template management mirrors the prompt library card and dialog workflow", async () => {
  const source = await readFile(new URL("production/asset-library.js", root), "utf8");
  const styles = await readFile(new URL("production/pixel-flow-theme.css", root), "utf8");
  assert.match(source, /function templateList\(library, query\)/);
  assert.match(source, /data-action="template-new">新增模板/);
  assert.match(source, /function openTemplateDialog\(templateId = ""\)/);
  assert.match(source, /backdrop\.className = "pf-template-dialog-backdrop"/);
  assert.match(source, /data-action="template-delete"/);
  assert.match(styles, /\.pf-template-grid\{display:grid;grid-template-columns:repeat\(4/);
  assert.match(styles, /\.pf-template-dialog-backdrop\{/);
});

test("template runs remain independent tasks and retry failed slots only", async () => {
  const source = await readFile(new URL("production/asset-library.js", root), "utf8");
  assert.match(source, /templateSlot: index \+ 1/);
  assert.match(source, /previousTasks\.filter\(\(task\) => task\.status === "failed"\)/);
  assert.match(source, /failed\.map\(\(task\) => task\.id\)/);
  assert.match(source, /type: "RUN_TASK"/);
});

test("the canvas template toolbar entry stays non-destructive while the feature is unfinished", async () => {
  const source = await readFile(new URL("production/asset-library.js", root), "utf8");
  const styles = await readFile(new URL("production/pixel-flow-theme.css", root), "utf8");
  assert.match(source, /function enhanceCanvasToolbar\(\)/);
  assert.match(source, /data-action="template-task-create"/);
  assert.match(source, /action === "template-task-create"\) \{ notify\("功能还没想好，开发中！"\); return; \}/);
  assert.doesNotMatch(source, /action === "template-task-create"\) \{ await createTemplateTask\(\); return; \}/);
  assert.match(styles, /button\[data-action="template-task-create"\]/);
});

test("solid input edges expose a two-step disconnect control", async () => {
  const source = await readFile(new URL("production/asset-library.js", root), "utf8");
  const styles = await readFile(new URL("production/pixel-flow-theme.css", root), "utf8");
  const app = await readFile(new URL("src/App.tsx", root), "utf8");
  const disconnectSource = source.slice(source.indexOf("async function disconnectEdge"), source.indexOf("async function importMedia"));
  assert.match(source, /closest\("\.react-flow__edge"\)/);
  assert.match(source, /edge\.kind === "output"/);
  assert.match(source, /dataset\.action = "edge-disconnect"/);
  assert.match(source, /project\.graph\.edges = project\.graph\.edges\.filter\(\(item\) => item\.id !== edgeId\)/);
  assert.match(source, /inputEdgeOrder: \(node\.inputEdgeOrder \|\| \[\]\)\.filter\(\(id\) => id !== edgeId\)/);
  assert.match(styles, /\.pf-edge-disconnect/);
  assert.match(styles, /\.react-flow__edge\.pf-edge-selected/);
  assert.match(disconnectSource, /pixel-flow:project-refresh/);
  assert.doesNotMatch(disconnectSource, /location\.reload/);
  assert.match(app, /window\.addEventListener\('pixel-flow:project-refresh'/);
});

test("a Lovart-style icon rail expands each library beside the canvas", async () => {
  const source = await readFile(new URL("production/asset-library.js", root), "utf8");
  const styles = await readFile(new URL("production/pixel-flow-theme.css", root), "utf8");
  assert.match(source, /function mountLibraryRail\(\)/);
  assert.match(source, /data-library-rail-tab="prompts"/);
  assert.match(source, /data-library-rail-tab="products"/);
  assert.match(source, /data-library-rail-tab="references"/);
  assert.match(source, /data-library-rail-tab="templates"/);
  assert.match(source, /data-library-rail-tab="canvas"/);
  assert.match(source, /data-action="open-api-settings"/);
  assert.match(source, /data-action="save-memory"/);
  assert.match(source, /document\.body\.classList\.add\("pf-library-expanded"\)/);
  assert.match(source, /function collapsePanel\(\)/);
  assert.doesNotMatch(source, /button\.className = "pf-library-button"/);
  assert.match(styles, /--pf-rail-width:60px/);
  assert.match(styles, /\.pf-library-rail\{position:fixed;top:64px/);
  assert.match(styles, /body\.pf-library-expanded\{--pf-workspace-offset:var\(--pf-expanded-width\)\}/);
  assert.match(styles, /\.flow-stage\{width:calc\(100vw - var\(--pf-workspace-offset\)\);margin-left:var\(--pf-workspace-offset\)/);
});

test("canvas and asset library storage controls use complete portable backups", async () => {
  const source = await readFile(new URL("production/asset-library.js", root), "utf8");
  const styles = await readFile(new URL("production/pixel-flow-theme.css", root), "utf8");
  const app = await readFile(new URL("src/App.tsx", root), "utf8");
  assert.match(source, /data-action="canvas-export"/);
  assert.match(source, /data-action="canvas-card-export"/);
  assert.match(source, /title="存储"><svg viewBox="0 0 24 24"/);
  assert.match(source, /title="重命名"><svg viewBox="0 0 24 24"/);
  assert.match(source, /title="删除"><svg viewBox="0 0 24 24"/);
  assert.match(styles, /\.pf-project-card-actions>button\{width:28px;height:28px;display:grid;place-items:center/);
  assert.match(styles, /\.pf-project-card-actions>button svg\{width:14px;height:14px/);
  assert.match(source, /aria-label="重命名画布/);
  assert.match(source, /aria-label="删除画布/);
  assert.doesNotMatch(source.slice(source.indexOf("async function renderProjectGallery"), source.indexOf("async function openProjectGallery")), /canvas-menu|<menu>/);
  assert.match(source, /exportCurrentCanvas\(target\.dataset\.projectId\)/);
  assert.match(source, /data-action="canvas-import"/);
  assert.match(source, /async function importCanvas\(file\)/);
  assert.match(source, /data-action="canvas-create"/);
  assert.match(source, /data-action="canvas-rename"/);
  assert.match(source, /data-action="canvas-switch"/);
  assert.match(source, /function openProjectGallery\(\)/);
  assert.match(source, /class="pf-project-grid"/);
  assert.match(source, /data-project-preview/);
  assert.match(source, /data-action="canvas-card-rename"/);
  assert.match(source, /data-action="canvas-card-delete"/);
  assert.match(source, /data-action="canvas-delete"/);
  assert.match(source, /kind: "pixel-flow-canvas"/);
  assert.match(source, /\.gptcanvas\.json/);
  assert.match(source, /data-action="asset-export"/);
  assert.match(source, /data-action="asset-import"/);
  assert.match(source, /kind: "pixel-flow-asset-library"/);
  assert.match(source, /assets\.push\(\{ id: assetId, dataUrl: await blobToDataUrl\(asset\.blob\) \}\)/);
  assert.match(source, /promptIdMap/);
  assert.match(source, /mediaIdMap/);
  assert.match(source, /window\.dispatchEvent\(new CustomEvent\("pixel-flow:projects-refresh"\)\)/);
  assert.match(app, /ProjectFit/);
});

test("libraries separate outside management from inside usage", async () => {
  const source = await readFile(new URL("production/asset-library.js", root), "utf8");
  const styles = await readFile(new URL("production/pixel-flow-theme.css", root), "utf8");
  assert.match(source, /let panelMode = "usage"/);
  assert.match(source, /function openLibraryManagement\(tab\)/);
  assert.match(source, /data-action="open-library-management"/);
  assert.match(source, /prompts: \["提示词库"/);
  assert.match(source, /调用提示词/);
  assert.match(source, /应用到画布/);
  assert.match(source, /前往库管理/);
  const managementPromptList = source.slice(source.indexOf("function promptList"), source.indexOf("function mediaList"));
  const managementMediaList = source.slice(source.indexOf("function mediaList"), source.indexOf("function promptUsageList"));
  assert.match(managementPromptList, /prompt-edit/);
  assert.match(managementPromptList, /prompt-delete/);
  assert.doesNotMatch(managementPromptList, /prompt-replace|prompt-append|data-drag-kind/);
  assert.match(managementMediaList, /media-rename/);
  assert.match(managementMediaList, /media-delete/);
  assert.doesNotMatch(managementMediaList, /media-apply|data-drag-kind/);
  assert.match(styles, /\.pf-library-panel\.is-management/);
  assert.match(styles, /body\.pf-gallery-open \.pf-library-rail button\[data-action="save-memory"\]\{display:none\}/);
});

test("prompt, product, and reference calling sidebars omit search while templates keep it", async () => {
  const source = await readFile(new URL("production/asset-library.js", root), "utf8");
  const usageRender = source.slice(source.indexOf('if (panelMode === "usage")'), source.indexOf('if (activeTab === "canvas")'));
  assert.match(usageRender, /const usageSearch = activeTab === "templates"/);
  assert.match(usageRender, /\$\{usageSearch\}\$\{filterBar\}/);
  assert.doesNotMatch(usageRender, /<header[^\n]+<input class="pf-library-search"/);
});

test("prompt creation dialog supports optional example images and reusable editing data", async () => {
  const source = await readFile(new URL("production/asset-library.js", root), "utf8");
  const styles = await readFile(new URL("production/pixel-flow-theme.css", root), "utf8");
  assert.match(source, /function openPromptDialog\(prompt = null\)/);
  assert.match(source, /data-action="prompt-create"/);
  assert.match(source, /async function editPrompt\(promptId = ""\)/);
  assert.match(source, /data-prompt-image/);
  assert.match(source, /exampleAssetId/);
  assert.match(source, /deletePromptAssetIfUnused/);
  assert.match(source, /\.\.\.library\.prompts\.map\(\(item\) => item\.exampleAssetId\)/);
  assert.match(source, /const importAssetId = async/);
  assert.match(source, /pf-prompt-example-thumb/);
  assert.doesNotMatch(source, /data-new-prompt-name|data-new-prompt-content|data-action="prompt-save"/);
  assert.match(styles, /\.pf-prompt-dialog-backdrop/);
  assert.match(styles, /\.pf-prompt-example-thumb/);
});

test("prompt cards show only names, examples, and filterable tags", async () => {
  const source = await readFile(new URL("production/asset-library.js", root), "utf8");
  const styles = await readFile(new URL("production/pixel-flow-theme.css", root), "utf8");
  assert.match(source, /const PROMPT_TAGS = \["模版", "构图", "背景", "功能"\]/);
  assert.match(styles, /aspect-ratio:3\/2/);
  assert.match(source, /function promptTagFilters\(\)/);
  assert.match(source, /data-action="prompt-filter"/);
  assert.match(source, /function promptTagBadges\(item\)/);
  assert.match(source, /data-prompt-tag/);
  assert.match(source, /请至少选择一个提示词标签/);
  const managementPromptList = source.slice(source.indexOf("function promptList"), source.indexOf("function mediaList"));
  const usagePromptList = source.slice(source.indexOf("function promptUsageList"), source.indexOf("function mediaUsageList"));
  assert.doesNotMatch(managementPromptList, /escapeHtml\(item\.content\)/);
  assert.doesNotMatch(usagePromptList, /escapeHtml\(item\.content\)/);
  assert.match(usagePromptList, /prompt-create-task/);
  assert.doesNotMatch(usagePromptList, /prompt-replace|prompt-append|data-drag-kind/);
  assert.match(styles, /\.pf-prompt-filters/);
  assert.match(styles, /\.pf-prompt-tags/);
  assert.match(styles, /\.pf-prompt-tag-picker/);
});

test("prompt management uses the compact toolbar layout", async () => {
  const source = await readFile(new URL("production/asset-library.js", root), "utf8");
  const styles = await readFile(new URL("production/pixel-flow-theme.css", root), "utf8");
  assert.match(source, /prompts: "提示词库"/);
  assert.match(source, /compactManagementTabs = \["prompts", "products", "references"\]/);
  assert.match(source, /pf-prompt-management-toolbar/);
  assert.match(styles, /pf-prompt-management-toolbar\{display:flex;align-items:center;justify-content:space-between/);
  assert.match(styles, /grid-template-columns:repeat\(4,minmax\(200px,1fr\)\)/);
});

test("product and reference management follow the compact library layout", async () => {
  const source = await readFile(new URL("production/asset-library.js", root), "utf8");
  const styles = await readFile(new URL("production/pixel-flow-theme.css", root), "utf8");
  assert.match(source, /products: "产品素材库", references: "图库"/);
  assert.match(source, /compactManagementTabs = \["prompts", "products", "references"\]/);
  assert.match(source, /pf-media-management-toolbar/);
  assert.match(styles, /\.pf-media-management-toolbar\{display:flex;justify-content:flex-end/);
});

test("product management uses bounded 3:2 previews while reference management keeps masonry", async () => {
  const source = await readFile(new URL("production/asset-library.js", root), "utf8");
  const styles = await readFile(new URL("production/pixel-flow-theme.css", root), "utf8");
  assert.match(source, /pf-media-grid--\$\{kind\}/);
  assert.match(source, /layoutMediaMasonry\(root\)/);
  assert.match(source, /querySelectorAll\("\.pf-media-grid--reference"\)/);
  assert.match(source, /const columnEnds = Array\(columns\)\.fill\(1\)/);
  assert.match(source, /item\.style\.gridColumnStart = `\$\{column \+ 1\}`/);
  assert.match(source, /item\.style\.gridRowEnd = `span \$\{span\}`/);
  assert.match(source, /const observedMasonryItems = new WeakMap\(\)/);
  assert.match(source, /observedMasonryItems\.set\(item, observer\)/);
  assert.match(source, /requestAnimationFrame\(\(\) => requestAnimationFrame\(\(\) => layoutMediaMasonry\(masonryRoot\)\)\)/);
  assert.match(styles, /\.pf-media-grid--product \.pf-media-item>div\{position:relative;width:100%;height:auto;aspect-ratio:3\/2;overflow:hidden\}/);
  assert.match(styles, /\.pf-media-grid--product \.pf-media-item img\{position:absolute;inset:0;display:block;width:100%;height:100%;object-fit:contain\}/);
  assert.match(styles, /\.pf-library-panel\.is-management \.pf-media-grid--reference\{display:grid;grid-template-columns:repeat\(auto-fill,minmax\(220px,1fr\)\);grid-auto-rows:8px;gap:14px\}/);
});

test("reference calling sidebar preserves natural image ratios in a two-column masonry", async () => {
  const source = await readFile(new URL("production/asset-library.js", root), "utf8");
  const styles = await readFile(new URL("production/pixel-flow-theme.css", root), "utf8");
  assert.match(source, /const masonryRoot = target\.closest\("\.pf-library-panel"\) \|\| document/);
  assert.match(styles, /\.pf-usage-media-grid\.pf-media-grid--reference\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\);grid-auto-rows:8px/);
  assert.match(styles, /\.pf-usage-media-grid\.pf-media-grid--reference \.pf-media-item>div\{height:auto;min-height:64px\}/);
  assert.match(styles, /\.pf-usage-media-grid\.pf-media-grid--reference \.pf-media-item img\{display:block;width:100%;height:auto;object-fit:cover\}/);
  assert.match(styles, /\.pf-usage-media-grid\.pf-media-grid--reference\{display:block;columns:2;column-gap:9px\}/);
  assert.match(styles, /break-inside:avoid/);
  assert.match(styles, /\.pf-library-panel\.is-management \.pf-media-grid--reference\{display:block;column-width:220px;column-gap:14px\}/);
});

test("gallery calling cards use Pinterest-style names and icon management actions", async () => {
  const source = await readFile(new URL("production/asset-library.js", root), "utf8");
  const styles = await readFile(new URL("production/pixel-flow-theme.css", root), "utf8");
  const usageList = source.slice(source.indexOf("function mediaUsageList"), source.indexOf("function templateUsageList"));
  const referenceBranch = usageList.slice(usageList.indexOf('kind === "reference"'), usageList.indexOf(": `<article"));
  assert.match(referenceBranch, /pf-reference-card/);
  assert.match(referenceBranch, /pf-reference-thumb/);
  assert.match(referenceBranch, /data-action="media-apply"/);
  assert.match(referenceBranch, /pf-reference-meta/);
  assert.match(referenceBranch, /<strong title=/);
  assert.match(referenceBranch, /data-action="media-delete"/);
  assert.doesNotMatch(referenceBranch, /data-action="media-rename"/);
  assert.doesNotMatch(referenceBranch, /应用到画布/);
  assert.match(styles, /\.pf-reference-meta\{display:flex;align-items:center;gap:5px/);
  assert.match(styles, /\.pf-reference-meta>strong\{min-width:0;flex:1;overflow:hidden/);
});

test("canvas images can be saved into the gallery by double-click without duplicates", async () => {
  const source = await readFile(new URL("production/asset-library.js", root), "utf8");
  const app = await readFile(new URL("src/App.tsx", root), "utf8");
  assert.match(app, /data-canvas-library-asset-id=\{node\.assetId\}/);
  assert.match(app, /data-canvas-library-name=\{libraryName\}/);
  assert.match(app, /draggable=\{false\}/);
  assert.match(source, /function addCanvasImageToGallery\(canvasImage\)/);
  assert.match(source, /item\.kind === "reference" && item\.assetId === canvasImage\.assetId/);
  assert.match(source, /library\.media\.unshift\(\{ id: makeId\("media"\), kind: "reference"/);
  assert.match(source, /lastCanvasImageClick = \{ assetId: "", at: 0 \}/);
  assert.match(source, /event\.detail >= 2 \|\| \(lastCanvasImageClick\.assetId === assetId && clickedAt - lastCanvasImageClick\.at <= 500\)/);
  assert.match(source, /if \(!isDoubleClick\) return/);
  assert.match(source, /这张图片已在图库中/);
  assert.match(source, /已加入图库/);
  assert.match(source, /function showGallerySavedFeedback\(image\)/);
  assert.match(source, /pf-gallery-saved-feedback/);
  assert.match(source, /if \(saved\) showGallerySavedFeedback\(image\)/);
});

test("primary libraries keep names visible while the gallery uses hover controls", async () => {
  const source = await readFile(new URL("production/asset-library.js", root), "utf8");
  const styles = await readFile(new URL("production/pixel-flow-theme.css", root), "utf8");
  assert.match(source, /const libraryCardIcon = \(name\)/);
  const managementCards = source.slice(source.indexOf("function promptList"), source.indexOf("function promptUsageList")) + source.slice(source.indexOf("function templateList"), source.indexOf("function templateEditor"));
  for (const action of ["prompt-edit", "prompt-delete", "media-rename", "media-delete", "template-edit", "template-delete"]) assert.match(managementCards, new RegExp(`data-action="${action}"[^>]*aria-label=`));
  assert.match(managementCards, /pf-management-card-meta/);
  assert.match(styles, /\.pf-library-panel\.is-management \.pf-prompt-item \.pf-management-card-meta,.pf-library-panel\.is-management \.pf-media-grid--product \.pf-management-card-meta,.pf-library-panel\.is-management \.pf-template-item \.pf-management-card-meta\{position:static/);
  assert.match(styles, /\.pf-library-panel\.is-management \.pf-management-card-meta\{position:absolute/);
  assert.match(styles, /\.pf-library-panel\.is-management \.pf-media-item:hover \.pf-management-card-meta/);
  assert.match(styles, /\.pf-library-panel\.is-management \.pf-media-grid--reference\{display:grid;grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(styles, /@keyframes pf-gallery-saved/);
});

test("gallery sidebar reveals only delete on hover", async () => {
  const source = await readFile(new URL("production/asset-library.js", root), "utf8");
  const styles = await readFile(new URL("production/pixel-flow-theme.css", root), "utf8");
  const usageList = source.slice(source.indexOf("function mediaUsageList"), source.indexOf("function templateUsageList"));
  const referenceBranch = usageList.slice(usageList.indexOf('kind === "reference"'), usageList.indexOf(": `<article"));
  assert.match(referenceBranch, /data-action="media-delete"/);
  assert.doesNotMatch(referenceBranch, /data-action="media-rename"/);
  assert.match(styles, /\.pf-usage-media-grid\.pf-media-grid--reference \.pf-reference-meta\{position:absolute;top:6px;right:6px/);
  assert.match(styles, /\.pf-usage-media-grid\.pf-media-grid--reference \.pf-reference-meta>strong\{display:none\}/);
  assert.match(styles, /\.pf-reference-card:hover \.pf-reference-meta/);
});

test("library titles use the simplified names", async () => {
  const source = await readFile(new URL("production/asset-library.js", root), "utf8");
  const app = await readFile(new URL("src/App.tsx", root), "utf8");
  assert.match(source, /prompts: \["提示词库"/);
  assert.match(source, /references: \["图库"/);
  assert.match(source, /templates: \["模版库"/);
  assert.match(app, /title="模版库"/);
  assert.doesNotMatch(source, /提示词库管理|图库管理|生图模板库管理/);
});

test("authoritative prompt imports replace the prompt library and stale covers", async () => {
  const source = await readFile(new URL("production/asset-library.js", root), "utf8");
  assert.match(source, /incoming\.promptSyncMode === "replace"/);
  assert.match(source, /local\.prompts = local\.prompts\.filter/);
  assert.match(source, /replacePrompts \? importedExampleAssetId/);
  assert.match(source, /deletePromptAssetIfUnused\(assetId, local\)/);
});

test("performance safeguards defer thumbnails, release object URLs, and filter DOM observers", async () => {
  const source = await readFile(new URL("production/asset-library.js", root), "utf8");
  const mode = await readFile(new URL("production/generation-mode.js", root), "utf8");
  const store = await readFile(new URL("src/store.ts", root), "utf8");
  const app = await readFile(new URL("src/App.tsx", root), "utf8");
  assert.match(source, /new IntersectionObserver/);
  assert.match(source, /rootMargin: "240px 0px"/);
  assert.match(source, /loading="lazy" decoding="async"/);
  assert.match(source, /releaseObjectUrls\(panel\)/);
  assert.match(source, /releaseObjectUrls\(gallery\)/);
  assert.match(source, /mutation\.addedNodes/);
  assert.match(mode, /mutation\.addedNodes/);
  assert.match(store, /const assetUrls = new Map/);
  assert.match(store, /URL\.revokeObjectURL\(url\)/);
  assert.match(app, /className:output\?'task-result-edge'/);
});
