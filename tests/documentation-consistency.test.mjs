import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("user-facing documentation matches the packaged version and task model", async () => {
  const packageJson = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
  const manifest = JSON.parse(await readFile(new URL("public/manifest.json", root), "utf8"));
  const [readme, releaseNotes, usage, html, commandApi, partnerGuide] = await Promise.all([
    readFile(new URL("README.md", root), "utf8"),
    readFile(new URL("版本说明.txt", root), "utf8"),
    readFile(new URL("使用说明.txt", root), "utf8"),
    readFile(new URL("先看这里-使用说明.html", root), "utf8"),
    readFile(new URL("COMMAND_API.md", root), "utf8"),
    readFile(new URL("TEAM_GATEWAY_PARTNER_GUIDE.md", root), "utf8")
  ]);

  assert.equal(packageJson.version, manifest.version);
  for (const document of [readme, releaseNotes, usage, html]) {
    assert.match(document, new RegExp(`v?${packageJson.version.replaceAll(".", "\\.")}`));
  }
  assert.match(readme, /GPT Web[\s\S]+本机 \/ 团队[\s\S]+Team Cloud[\s\S]+Flare \/ Sunburst[\s\S]+API/);
  for (const term of ["TaskRun", "取消", "重试", "恢复结果"]) assert.match(usage, new RegExp(term));
  assert.match(commandApi, /task\.recoverTeamResult/);
  assert.match(partnerGuide, /“Team Cloud”，或选择“GPT Web → 团队”/);
  assert.match(partnerGuide, /GPT Web 团队模式不消耗该额度/);
  assert.doesNotMatch(partnerGuide, /左侧“生图设置”/);
});

test("HTML guide navigation and local images resolve", async () => {
  const html = await readFile(new URL("先看这里-使用说明.html", root), "utf8");
  const packageJson = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]));
  for (const match of html.matchAll(/href="#([^"]+)"/g)) {
    assert.ok(ids.has(match[1]), `missing section id: ${match[1]}`);
  }
  for (const match of html.matchAll(/<img[^>]+src="([^"]+)"/g)) {
    await access(new URL(match[1], new URL("先看这里-使用说明.html", root)));
  }
  assert.match(html, new RegExp(`<title>Pixel Flow v${packageJson.version.replaceAll(".", "\\.")} 使用说明（2026-09-15 更新）<\\/title>`));
  assert.match(html, new RegExp(`<footer>Pixel Flow · AI 创意任务画布 · v${packageJson.version.replaceAll(".", "\\.")} · 2026-09-15`));
  assert.match(html, /<img src="扩展程序\/icon-128\.png" alt="Pixel Flow PF 图标">/);
  assert.doesNotMatch(html, /说明图片\/brand-logo\.png/);
});
