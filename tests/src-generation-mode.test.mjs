import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("rebuilt tasks own generation mode instead of requiring DOM injection", async () => {
  const app = await readFile(new URL("src/App.tsx", root), "utf8");
  const types = await readFile(new URL("src/types.ts", root), "utf8");
  const store = await readFile(new URL("src/store.ts", root), "utf8");
  assert.match(types, /export type GenerationMode = "browser" \| "api" \| "team" \| "team_web"/);
  assert.match(types, /generationMode\?: GenerationMode/);
  assert.match(types, /export type TeamImageModel = "flare" \| "sunburst"/);
  assert.match(types, /teamImageModel\?: TeamImageModel/);
  assert.match(types, /apiJobId\?: string/);
  assert.match(store, /generationMode:"api"/);
  assert.match(app, /aria-label="生图模式"/);
  assert.match(app, /<option value="gpt_web">GPT Web<\/option>/);
  assert.match(app, /<option value="team_cloud">Team Cloud<\/option>/);
  assert.match(app, /<option value="api">API<\/option>/);
  assert.match(app, /n\.generationMode==='api'\?'api':n\.generationMode==='team'\?'team':n\.generationMode==='team_web'\?'team_web':'browser'/);
  assert.match(app, /generationProvider\(mode\),webLocation=gptWebLocation\(mode\)/);
  assert.match(app, /generationModeForProvider\('gpt_web',next\)/);
  assert.match(app, /aria-label="GPT Web 执行位置"/);
  assert.match(app, /className="task-segmented-toggle"/);
  assert.match(app, /value==='flare'\?'Flare':'Sunburst'/);
  assert.match(app, /aria-label="Team Cloud 模型"/);
});

test("rebuilt mode switching preserves production safety rules", async () => {
  const app = await readFile(new URL("src/App.tsx", root), "utf8");
  assert.match(app, /\['queued','waiting_page','uploading','sending','generating','manual_action'\]\.includes\(status\)/);
  assert.match(app, /generationMode:next,teamImageModel:next==='team'/);
  assert.match(app, /currentMode==='api'&&!await readApiKey\(\)/);
  assert.match(app, /\(currentMode==='team'\|\|currentMode==='team_web'\)&&!await hasTeamGateway\(\)/);
  assert.match(app, /pixel-flow:open-api-settings/);
  assert.match(app, /const pendingSettingsSave=useRef<Promise<void>>\(Promise\.resolve\(\)\)/);
  assert.match(app, /pendingSettingsSave\.current=saving;await saving/);
  assert.match(app, /const run=async\(\)=>\{await pendingSettingsSave\.current/);
  assert.match(app, /const currentTask=useStore\.getState\(\)\.project/);
  assert.match(app, /currentTask\?\.generationMode==='team'\?'team':currentTask\?\.generationMode==='team_web'\?'team_web':'browser'/);
});

test("task cards expose explicit cancel, retry and cloud recovery actions", async () => {
  const app = await readFile(new URL("src/App.tsx", root), "utf8");
  const store = await readFile(new URL("src/store.ts", root), "utf8");
  assert.match(app, /className="cancel-task"/);
  assert.match(app, /runStatus==='failed'\|\|runStatus==='canceled'\?'重试'/);
  assert.match(app, /n\.recoverableResult&&\(mode==='team'\|\|mode==='team_web'\)/);
  assert.match(store, /type:"CANCEL_TASK",projectId:p\.id,taskId/);
  assert.match(store, /type:"RECOVER_TEAM_RESULT",projectId:p\.id,taskId/);
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
  const app = await readFile(new URL("src/App.tsx", root), "utf8");
  assert.match(settings, /pixelFlowTeamGatewayUrl/);
  assert.match(settings, /pixelFlowTeamToken/);
  assert.match(settings, /pixelFlowTeamMemberToken/);
  assert.match(settings, /pfm_/);
  assert.match(settings, /settings\.url && settings\.token && settings\.memberToken/);
  assert.match(settings, /chrome\.permissions\.contains\(permission\) \|\| await chrome\.permissions\.request\(permission\)/);
  assert.match(settings, /chrome\.storage\.local\.set/);
  assert.match(settings, /旧本机网关仅支持 127\.0\.0\.1:43130/);
  assert.match(manifest, /"optional_host_permissions": \["https:\/\/\*\/\*"\]/);
  assert.match(app, /平台访问 Key/);
  assert.match(app, /成员令牌/);
});

test("web worker pairing keeps the ChatGPT session local and exposes pause controls", async () => {
  const settings = await readFile(new URL("src/team-web-worker-settings.ts", root), "utf8");
  const app = await readFile(new URL("src/App.tsx", root), "utf8");
  assert.match(settings, /pixelFlowTeamWebWorkerDeviceToken/);
  assert.match(settings, /\/web-worker\/pair/);
  assert.match(settings, /TEAM_WEB_WORKER_SETTINGS_CHANGED/);
  assert.match(settings, /void chrome\.runtime\.sendMessage/);
  assert.match(settings, /pfw_/);
  assert.match(app, /网页生图执行机/);
  assert.match(app, /配对并开始接单/);
  assert.match(app, /暂停接单/);
});

test("generation settings stay usable in short browser viewports", async () => {
  const app = await readFile(new URL("src/App.tsx", root), "utf8");
  const styles = await readFile(new URL("src/styles.css", root), "utf8");
  assert.match(app, /className="api-settings-body"/);
  assert.match(styles, /\.api-settings\{[^}]*max-height:calc\(100dvh - 40px\)[^}]*display:flex[^}]*flex-direction:column[^}]*overflow:hidden/);
  assert.match(styles, /\.api-settings-body\{[^}]*min-height:0[^}]*overflow-y:auto/);
  assert.match(styles, /\.api-settings footer\{[^}]*flex:0 0 auto/);
});

test("task cards implement the selected soft-section visual direction", async () => {
  const styles = await readFile(new URL("src/generation-ui.css", root), "utf8");
  assert.match(styles, /\.task-card \{[\s\S]*?border-radius: 16px;[\s\S]*?box-shadow: 0 12px 30px/);
  assert.match(styles, /\.task-card header \.generation-mode select \{[\s\S]*?border-color: #a98dff;[\s\S]*?box-shadow: 0 0 0 2px/);
  assert.match(styles, /\.task-card \.task-status\[data-status="completed"\] \{[\s\S]*?background: #eaf7ef;/);
  assert.match(styles, /\.task-card\.status-completed,[\s\S]*?\.task-card\.status-canceled \{\s*border-color: #dde1e8;/);
  assert.match(styles, /\.task-card \.task-inputs \{[\s\S]*?background: #fbfaff;/);
  assert.match(styles, /\.task-card > \.task-prompt \{[\s\S]*?background: #f8f9fb;/);
  assert.match(styles, /\.task-card footer \{[\s\S]*?background: #fbfbfc;/);
});
