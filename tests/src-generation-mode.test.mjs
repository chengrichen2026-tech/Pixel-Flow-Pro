import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("rebuilt tasks own generation mode instead of requiring DOM injection", async () => {
  const app = await readFile(new URL("src/App.tsx", root), "utf8");
  const types = await readFile(new URL("src/types.ts", root), "utf8");
  const store = await readFile(new URL("src/store.ts", root), "utf8");
  assert.match(types, /export type GenerationMode = "browser" \| "api" \| "team"/);
  assert.match(types, /generationMode\?: GenerationMode/);
  assert.match(types, /apiJobId\?: string/);
  assert.match(store, /generationMode:"api"/);
  assert.match(app, /className="generation-mode"/);
  assert.match(app, /aria-label="生图模式"/);
  assert.match(app, /n\.generationMode==='api'\?'api':n\.generationMode==='team'\?'team':'browser'/);
  assert.match(app, /<option value="team">团队生图<\/option>/);
});

test("rebuilt mode switching preserves production safety rules", async () => {
  const app = await readFile(new URL("src/App.tsx", root), "utf8");
  assert.match(app, /\['queued','waiting_page','uploading','sending','generating','manual_action'\]\.includes\(status\)/);
  assert.match(app, /generationMode:next,apiJobId:undefined,statusDetail:undefined/);
  assert.match(app, /currentMode==='api'&&!await readApiKey\(\)/);
  assert.match(app, /currentMode==='team'&&!await hasTeamGateway\(\)/);
  assert.match(app, /pixel-flow:open-api-settings/);
  assert.match(app, /const pendingModeSave=useRef<Promise<void>>\(Promise\.resolve\(\)\)/);
  assert.match(app, /pendingModeSave\.current=saving;await saving/);
  assert.match(app, /const run=async\(\)=>\{await pendingModeSave\.current/);
  assert.match(app, /const currentTask=useStore\.getState\(\)\.project/);
  assert.match(app, /currentTask\?\.generationMode==='team'\?'team':'browser'/);
});

test("rebuilt API settings use the same local storage contract", async () => {
  const settings = await readFile(new URL("src/api-settings.ts", root), "utf8");
  const app = await readFile(new URL("src/App.tsx", root), "utf8");
  assert.match(settings, /const API_KEY_STORAGE = "pixelFlowApiKey"/);
  assert.match(settings, /chrome\.storage\.local\.get/);
  assert.match(settings, /chrome\.storage\.local\.set/);
  assert.match(settings, /chrome\.storage\.local\.remove/);
  assert.match(settings, /localStorage\.getItem/);
  assert.match(app, /个人 API/);
  assert.match(app, /https:\/\/aihub\.rbmanon\.cn\/v1/);
});

test("team settings keep member credentials local and request only the configured origin", async () => {
  const settings = await readFile(new URL("src/team-settings.ts", root), "utf8");
  const manifest = await readFile(new URL("public/manifest.json", root), "utf8");
  assert.match(settings, /pixelFlowTeamGatewayUrl/);
  assert.match(settings, /pixelFlowTeamToken/);
  assert.match(settings, /chrome\.permissions\.contains\(permission\) \|\| await chrome\.permissions\.request\(permission\)/);
  assert.match(settings, /chrome\.storage\.local\.set/);
  assert.match(manifest, /"optional_host_permissions"/);
});
