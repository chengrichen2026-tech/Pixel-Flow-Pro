import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const background = await readFile(new URL("public/background.js", root), "utf8");
const bridge = await readFile(new URL("src/codex-bridge.tsx", root), "utf8");
const mcp = await readFile(new URL("tools/pixel-flow-mcp/server.mjs", root), "utf8");

test("team mode sends authenticated jobs without exposing Codex OAuth to the extension", () => {
  assert.match(background, /async function teamGatewaySettings\(\)/);
  assert.match(background, /pixelFlowTeamGatewayUrl/);
  assert.match(background, /pixelFlowTeamToken/);
  assert.match(background, /headers: \{ Authorization: `Bearer \$\{token\}`/);
  assert.match(background, /async function executeTeamTask\(projectId, taskId, project, task\)/);
  assert.match(background, /requestId: `\$\{projectId\}:\$\{taskId\}:\$\{Date\.now\(\)\}`/);
  assert.doesNotMatch(background, /codex\/images\/generations/);
  assert.doesNotMatch(background, /\.codex\/auth\.json/);
});

test("team jobs recover through the persistent worker path", () => {
  assert.match(background, /task\.generationMode === "team"[\s\S]*await executeTeamTask/);
  assert.match(background, /\["api", "team"\]\.includes\(task\.generationMode\)/);
  assert.match(background, /task\.generationMode === "team" \? teamGatewayRequest : apiWorkerRequest/);
  assert.match(background, /title: task\.generationMode === "team" \? "团队生图完成" : "API 生图完成"/);
});

test("structured commands can create team generation tasks", () => {
  assert.match(bridge, /command\.generationMode==="team"\?"team":"api"/);
  assert.match(mcp, /enum:\["api","browser","team"\]/);
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
