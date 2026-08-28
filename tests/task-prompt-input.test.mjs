import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("task prompt keeps a local draft and debounces IndexedDB writes", async () => {
  const app = await readFile(new URL("src/App.tsx", root), "utf8");
  assert.match(app, /function TaskPrompt/);
  assert.match(app, /const \[value,setValue\]=useState\(node\.prompt\)/);
  assert.match(app, /window\.setTimeout\(\(\)=>commit\(next\),250\)/);
  assert.match(app, /event\.nativeEvent as InputEvent\)\.isComposing/);
  assert.match(app, /onCompositionStart/);
  assert.match(app, /onCompositionEnd/);
  assert.match(app, /onBlur=\{\(\)=>commit\(\)\}/);
  assert.match(app, /function ProjectFit/);
  assert.match(app, /window\.setTimeout\(\(\)=>void flow\.current\?\.fitView/);
  assert.match(app, /\[projectId,flow\]/);
});
