import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { readBackgroundSource } from "./helpers/background-source.mjs";

const root = new URL("../", import.meta.url);
const background = await readBackgroundSource();
const bridge = await readFile(new URL("src/codex-bridge.tsx", root), "utf8");
const mcp = await readFile(new URL("tools/pixel-flow-mcp/server.mjs", root), "utf8");

test("team mode sends authenticated jobs without exposing Codex OAuth to the extension", () => {
  assert.match(background, /async function teamGatewaySettings\(\)/);
  assert.match(background, /pixelFlowTeamMemberToken/);
  assert.match(background, /"X-Pixel-Member-Token": memberToken/);
  assert.match(background, /DEFAULT_TEAM_RELAY_URL/);
  assert.match(background, /`\$\{baseUrl\}\/team\$\{path\}`/);
  assert.doesNotMatch(background, /Authorization: `Bearer \$\{token\}`/);
  assert.match(background, /async function executeTeamTask\(projectId, taskId, project, task\)/);
  assert.match(background, /requestId: `\$\{projectId\}:\$\{taskId\}:\$\{Date\.now\(\)\}`/);
  assert.match(background, /async function submitTeamGatewayJob\(input\)/);
  assert.match(background, /protocolVersion/);
  assert.match(background, /Number\(health\.protocolVersion \|\| 1\) < 4/);
  assert.match(background, /resultDelivery: input\.provider === "chatgpt_web"[\s\S]*\? "bundle" : "direct"/);
  assert.match(background, /imageModel: input\.imageModel === "sunburst" \? "sunburst" : "flare"/);
  assert.match(background, /imageModel: task\.teamImageModel === "sunburst" \? "sunburst" : "flare"/);
  assert.match(background, /image\.downloadUrl/);
  assert.match(background, /teamGatewayResultRequest\(image\.proxyPath\)/);
  assert.match(background, /团队生图直传文件完整性校验失败/);
  assert.match(background, /async function finalizeTeamGatewayJob/);
  assert.match(background, /\/preview-chunks/);
  assert.match(background, /createImageBitmap/);
  assert.match(background, /\/input-chunks/);
  assert.match(background, /async function downloadTeamGatewayImages\(job\)/);
  assert.match(background, /\/result-chunks\//);
  assert.match(background, /\/acknowledge`, \{ method: "POST" \}/);
  assert.match(background, /TEAM_GATEWAY_CHUNK_CHARACTERS = 6e5/);
  assert.match(background, /TEAM_GATEWAY_CHUNK_PACE_MS = 250/);
  assert.match(background, /response\.status === 429 && attempt < 6/);
  assert.match(background, /response\.headers\.get\("Retry-After"\)/);
  assert.match(background, /自动重试后仍被限流/);
  assert.match(background, /response\.status === 429 && \/额度\//);
  assert.match(background, /response\.status === 401/);
  assert.doesNotMatch(background, /codex\/images\/generations/);
  assert.doesNotMatch(background, /\.codex\/auth\.json/);
});

test("team jobs recover through the persistent worker path", () => {
  assert.match(background, /runtimeTask\.generationMode === "team" \|\| runtimeTask\.generationMode === "team_web"[\s\S]*await executeTeamTask/);
  assert.match(background, /\["api", "team", "team_web"\]\.includes\(task\.generationMode\)/);
  assert.match(background, /\["team", "team_web"\]\.includes\(task\.generationMode\) \? teamGatewayRequest : apiWorkerRequest/);
  assert.match(background, /title: task\.generationMode === "team_web" \? "Team Web 已完成" : task\.generationMode === "team" \? "Team Cloud 已完成" : "API Key 已完成"/);
  assert.match(background, /task\.generationMode === "team"[\s\S]*teamGatewayRequest\(`\/jobs\/\$\{jobId\}\/acknowledge`/);
  assert.match(background, /async function recoverTeamTaskResult/);
  assert.match(background, /RECOVER_TEAM_RESULT/);
  assert.match(background, /await downloadTeamGatewayImages\(job\)/);
  assert.match(background, /async function cancelTeamGatewayJob\(jobId(?:: string)?\)/);
  assert.match(background, /teamGatewayRequest\(`\/jobs\/\$\{jobId\}\/cancel`, \{ method: "POST" \}\)/);
  assert.match(background, /const providerJobId = run\?\.providerJobId \|\| task\?\.apiJobId;[\s\S]*cancelTeamGatewayJob\(providerJobId\)/);
  assert.match(background, /job\.status === "canceled"/);
});

test("structured commands can create team generation tasks", () => {
  assert.match(bridge, /command\.generationMode==="team"\?"team":command\.generationMode==="team_web"\?"team_web":"api"/);
  assert.match(bridge, /command\.teamImageModel==="sunburst"\?"sunburst":"flare"/);
  assert.match(mcp, /enum:\["api","browser","team","team_web"\]/);
  assert.match(mcp, /teamImageModel:\{type:"string",enum:\["flare","sunburst"\]\}/);
});

test("remote team web jobs reuse the existing ChatGPT adapter and return chunks", () => {
  assert.match(background, /TEAM_WEB_PROJECT_ID = "pixel-flow-team-web-worker"/);
  assert.match(background, /async function startActiveTeamWebJob\(\)/);
  assert.match(background, /sendWithCurrentChatGptAdapter\(chrome\.tabs, chrome\.scripting, mapped\.tabId, message\)/);
  assert.match(background, /async function handleTeamWebPageTaskMessage/);
  assert.match(background, /uploadTeamWebImage\(active\.job\.id, message\.images\[imageIndex\], "result-chunks"/);
  assert.match(background, /pixelFlowTeamWebWorkerEnabled: false/);
  assert.match(background, /TEAM_WEB_WORKER_ALARM/);
  assert.match(background, /\["completed", "failed", "canceled"\]\.includes\(remote\.status\)/);
  assert.match(background, /sendResponse\(\{ accepted: true \}\);[\s\S]*void teamWebWorkerTick\(\)/);
  assert.doesNotMatch(background, /run_chatgpt_web\.py/);
  assert.ok(
    background.indexOf("var teamWebWorkerReady = Promise.all")
      < background.indexOf("void teamWebWorkerReady.then"),
    "team web worker startup must run after its readiness promise is assigned",
  );
});

test("macOS team gateway service scripts are present", async () => {
  const install = await readFile(new URL("team-gateway/install.sh", root), "utf8");
  const uninstall = await readFile(new URL("team-gateway/uninstall.sh", root), "utf8");
  assert.match(install, /com\.pixel-flow\.team-gateway/);
  assert.doesNotMatch(install, /<key>WorkingDirectory<\/key>/);
  assert.match(install, /--noproxy 127\.0\.0\.1/);
  assert.match(install, /--retry-connrefused/);
  assert.match(install, /Library\/Application Support\/Pixel Flow Team Gateway/);
  assert.match(install, /127\.0\.0\.1:43130\/health/);
  assert.match(uninstall, /launchctl bootout/);
});


test("Team Web waiting details are visible during active tasks", async () => {
  const app = await readFile(new URL("src/App.tsx", root), "utf8");
  assert.match(app, /n\.statusDetail&&<p className=\{`status-detail/);
  assert.match(app, /role="status">\{n.statusDetail\}/);
});
