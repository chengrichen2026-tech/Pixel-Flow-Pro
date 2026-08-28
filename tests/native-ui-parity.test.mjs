import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("native canvas restores the original single left icon rail", async () => {
  const app = await readFile(new URL("src/App.tsx", root), "utf8");
  const icons = await readFile(new URL("src/icons.tsx", root), "utf8");
  const styles = await readFile(new URL("src/styles.css", root), "utf8");
  assert.match(app, /native-rail-mark/);
  assert.match(app, /function RailIcon/);
  assert.match(app, /<PixelFlowMark\/>/);
  assert.match(app, /<PixelIcon name="prompt"|<RailIcon kind="prompt"/);
  assert.match(app, /<RailIcon kind="template"/);
  assert.match(icons, /export function PixelFlowMark/);
  assert.match(icons, /product: "product\.png"/);
  assert.match(icons, /reference: "reference\.png"/);
  assert.match(icons, /templateTask: "template-task\.png"/);
  assert.match(icons, /className=\{`pf-art-icon/);
  assert.doesNotMatch(app, /title="提示词库">词</);
  assert.match(styles, /\.native-library-rail\{top:0;bottom:0;left:0;width:60px/);
  assert.match(styles, /\.native-library-rail \.native-rail-mark\{width:40px;height:40px/);
  assert.match(styles, /\.topbar\{display:none\}/);
});

test("native canvas toolbar returns to the centered bottom position", async () => {
  const app = await readFile(new URL("src/App.tsx", root), "utf8");
  const styles = await readFile(new URL("src/styles.css", root), "utf8");
  assert.match(styles, /\.toolbar\{top:auto;right:auto;bottom:16px/);
  assert.match(styles, /flex-direction:row/);
  assert.match(styles, /transform:translateX\(-50%\)/);
  assert.match(app, /data-action="template-task-create"/);
  assert.match(styles, /\.toolbar button\{flex-basis:44px;width:44px;height:44px\}/);
});

test("management workspace does not stack over the calling sidebar", async () => {
  const panel = await readFile(new URL("src/AssetLibrary.tsx", root), "utf8");
  const source = await readFile(new URL("production/asset-library.js", root), "utf8");
  const styles = await readFile(new URL("src/styles.css", root), "utf8");
  assert.match(panel, /onClose\(\);setTimeout/);
  assert.match(source, /pixel-flow:open-canvas-management/);
  assert.match(source, /pixel-flow:close-legacy-library/);
  assert.match(source, /pixel-flow:native-management-active/);
  assert.match(source, /project-picker select,\.project select/);
  assert.match(styles, /body\.pf-library-management-open \.pf-project-gallery\{display:none!important\}/);
});

test("native rail reuses the exact legacy calling panel", async () => {
  const app = await readFile(new URL("src/App.tsx", root), "utf8");
  const source = await readFile(new URL("production/asset-library.js", root), "utf8");
  const styles = await readFile(new URL("src/styles.css", root), "utf8");
  assert.match(app, /pixel-flow:open-legacy-library/);
  assert.match(source, /window\.addEventListener\("pixel-flow:open-legacy-library"/);
  assert.match(source, /openPanel\(tab\)/);
  assert.match(styles, /body\.pf-library-expanded \.stage\{width:calc\(100vw - 296px\);margin-left:296px\}/);
  assert.match(styles, /body\.pf-library-expanded \.toolbar\{left:calc\(296px \+ \(100vw - 296px\)\/2\)\}/);
});

test("native node chrome matches legacy measured dimensions", async () => {
  const app = await readFile(new URL("src/App.tsx", root), "utf8");
  const styles = await readFile(new URL("src/styles.css", root), "utf8");
  assert.match(styles, /\.react-flow__panel\.react-flow__minimap\{left:12px;bottom:58px;width:148px;height:84px/);
  assert.match(styles, /\.react-flow__panel\.react-flow__controls\{left:12px;bottom:14px/);
  assert.match(styles, /\.task-card\{width:360px;min-height:243px\}/);
  assert.match(styles, /\.task-card header\{height:38px/);
  assert.match(styles, /\.task-inputs\{height:82px/);
  assert.match(styles, /\.task-card>textarea\{height:64px;min-height:64px;/);
  assert.match(styles, /\.task-card footer\{height:44px;/);
  assert.match(app, /<NodeResizer/);
  assert.match(app, /keepAspectRatio/);
  assert.match(app, /width:n\.width\?\?320,height:n\.height\?\?320/);
  assert.match(app, /naturalWidth\/image\.naturalHeight/);
  assert.match(styles, /\.media-node__label,\.text-node__label\{position:absolute/);
  assert.match(styles, /\.text-node\{width:260px\}/);
  assert.match(styles, /\.media-resize-handle\.top,\.media-resize-handle\.bottom\.left\{display:none!important\}/);
});

test("connected task images render ordered thumbnails including container items", async () => {
  const app = await readFile(new URL("src/App.tsx", root), "utf8");
  const styles = await readFile(new URL("src/styles.css", root), "utf8");
  assert.match(app, /function taskInputPreviews/);
  assert.match(app, /task\.inputEdgeOrder\.map/);
  assert.match(app, /source\?\.kind==='image_container'/);
  assert.match(app, /className="task-input-thumbnails"/);
  assert.match(app, /data-container-input/);
  assert.match(styles, /\.task-input-thumbnails img\{/);
});

test("task result edges stay animated and dashed after completion", async () => {
  const app = await readFile(new URL("src/App.tsx", root), "utf8");
  const styles = await readFile(new URL("src/styles.css", root), "utf8");
  assert.match(app, /const output=(?:e|edge)\.kind==='output'/);
  assert.match(app, /animated:output/);
  assert.match(app, /className:output\?'task-result-edge'/);
  assert.match(app, /strokeDasharray:output\?'7 5'/);
  assert.match(app, /node\.kind==='result'&&<Handle type="target" position=\{Position\.Left\}/);
  assert.match(styles, /@keyframes task-result-dash/);
  assert.match(styles, /\.react-flow__edge\.task-result-edge \.react-flow__edge-path\{stroke-dasharray:7 5!important;animation:task-result-dash/);
  assert.match(styles, /\.react-flow__node \.node-handle,.react-flow__node \.react-flow__handle\{z-index:30!important;pointer-events:all!important\}/);
  assert.match(styles, /\.run-button \.pf-utility-icon\{color:#fff!important\}/);
  assert.match(styles, /\.toolbar button:hover \.pf-art-icon,.native-library-rail button:hover \.pf-art-icon\{filter:brightness\(0\) invert\(1\)\}/);
  assert.match(styles, /\.toolbar button:hover \.pf-utility-icon,.native-library-rail button:hover \.pf-utility-icon\{color:#fff!important\}/);
  assert.match(app, /<option value="browser">GPT-web<\/option>/);
  assert.match(app, /\{mode==='browser'&&<button title="打开真实对话"/);
});
