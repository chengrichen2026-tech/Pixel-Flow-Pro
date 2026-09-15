import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("production entry loads the rebuilt source bundle", async () => {
  const html = await readFile(new URL("production/index.html", root), "utf8");
  assert.match(html, /data-pixel-flow-canvas="native"/);
  assert.match(html, /assets\/pixel-flow\.js/);
  assert.match(html, /assets\/pixel-flow\.css/);
  assert.doesNotMatch(html, /index-DBuGHJ6j\.js/);
  assert.doesNotMatch(html, /generation-mode\.js/);
  assert.doesNotMatch(html, /keyboard-shortcuts\.js/);
});

test("production build no longer ships a legacy rollback entry", async () => {
  const build = await readFile(new URL("scripts/build-extension.mjs", root), "utf8");
  assert.match(build, /rebuild-preview", "assets"/);
  assert.match(build, /rm\(outputAssets, \{ recursive: true, force: true \}\)/);
  assert.doesNotMatch(build, /legacy-ui-patches|legacy-index|legacy", "ui/);
  assert.doesNotMatch(build, /generation-mode\.js/);
  await assert.rejects(access(new URL("production/generation-mode.js", root)));
  await assert.rejects(access(new URL("扩展程序/generation-mode.js", root)));
});

test("production build splits heavyweight UI dependencies out of the main entry", async () => {
  const config = await readFile(new URL("../vite.config.ts", import.meta.url), "utf8");
  assert.match(config, /cssCodeSplit:\s*false/);
  assert.match(config, /manualChunks\(id\)/);
  assert.match(config, /vendor-canvas/);
  assert.match(config, /vendor-icons/);
  assert.match(config, /vendor-react/);
  assert.match(config, /vendor-state/);

  const assetsUrl = new URL("扩展程序/assets/", root);
  const assets = await readdir(assetsUrl);
  assert.deepEqual(assets.filter(file => file.endsWith(".css")), ["pixel-flow.css"]);
  const entry = await readFile(new URL("pixel-flow.js", assetsUrl), "utf8");
  const imports = [...entry.matchAll(/from"\.\/([^"?]+\.js)"/g)].map(match => match[1]);
  assert.ok(imports.some(file => file.startsWith("vendor-react-")));
  assert.ok(imports.some(file => file.startsWith("vendor-canvas-")));
  for (const file of imports) await access(new URL(file, assetsUrl));
});

test("legacy asset management enters native compatibility mode", async () => {
  const source = await readFile(new URL("production/asset-library.js", root), "utf8");
  assert.match(source, /dataset\.pixelFlowCanvas/);
  assert.match(source, /if \(nativeCanvas\) return/);
  assert.match(source, /pixel-flow:open-library-management/);
  assert.match(source, /pixel-flow:open-template-library/);
});
