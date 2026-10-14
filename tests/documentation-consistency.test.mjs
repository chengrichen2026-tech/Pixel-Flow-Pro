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
  for (const mode of ["GPT Web · 本机", "GPT Web · 团队", "Team Cloud", "API"]) {
    assert.match(usage, new RegExp(mode));
    assert.match(html, new RegExp(`<h3>${mode}</h3>`));
  }
  assert.match(html, /GPT Web · 团队[\s\S]*成员令牌[\s\S]*网页生图机/);
  assert.match(html, /Team Cloud[\s\S]*Flare 或 Sunburst[\s\S]*不需要登录 ChatGPT/);
  assert.doesNotMatch(usage, /GPT Web 团队任务不消耗 Team Cloud/);
  assert.doesNotMatch(html, /不消耗 Team Cloud 每日额度/);
  assert.match(commandApi, /task\.recoverTeamResult/);
  assert.match(partnerGuide, /“Team Cloud”，或选择“GPT Web → 团队”/);
  assert.match(partnerGuide, /Team Cloud 与 GPT Web 团队模式共用同一个成员每日额度池/);
  assert.match(partnerGuide, /切换模式不会获得额外次数/);
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
  const docDate=html.match(/name="documentation-updated" content="(\d{4}-\d{2}-\d{2})"/)?.[1];
  assert.ok(docDate);
  for(const file of ["使用说明.txt","版本说明.txt"]){const doc=await readFile(new URL(file,root),"utf8");assert.ok(doc.includes(`文档更新：${docDate}`));}
  assert.ok(html.includes(`<title>Pixel Flow v${packageJson.version} 使用说明（${docDate} 更新）</title>`));
  assert.ok(html.includes(`<footer>Pixel Flow · AI 创意任务画布 · v${packageJson.version} · ${docDate}`));
  assert.match(html, /<img src="扩展程序\/icon-128\.png" alt="Pixel Flow PF 图标">/);
  assert.doesNotMatch(html, /说明图片\/brand-logo\.png/);
});

test('current guides align with upscale defaults, supported API models and documented data boundaries',async()=>{
 const {DEFAULT_UPSCALE_OPTIONS}=await import('../src/domain/upscale-command.ts');const {PIXEL_FLOW_API_MODELS}=await import('../public/api-client.js');
 const [usage,html,release]=await Promise.all(['使用说明.txt','先看这里-使用说明.html','版本说明.txt'].map(f=>readFile(new URL(f,root),'utf8')));
 for(const doc of [usage,html,release]){
   assert.match(doc,/API Sunburst/);assert.match(doc,/双击/);assert.match(doc,/中性/);assert.match(doc,/pixel_flow_upscale_image/);assert.doesNotMatch(doc,/API 固定|API 固定为|模型固定为 gpt-image-2/);
 }
 assert.equal(DEFAULT_UPSCALE_OPTIONS.generationMode,'api');assert.equal(DEFAULT_UPSCALE_OPTIONS.apiImageModel,'gpt-image-2.5-sunburst');
 for(const model of PIXEL_FLOW_API_MODELS){assert.ok(html.includes(model));assert.ok(usage.includes(model));}
 for(const doc of [html,usage]){assert.match(doc,/容器.*未完整打包|容器内部图片及放大中间分块结果未完整打包/);assert.match(doc,/43129/);assert.match(doc,/43128/);}
 const version=JSON.parse(await readFile(new URL('package.json',root),'utf8')).version;
 assert.ok(release.includes(`版本：${version}`));assert.ok(release.includes(`当前版本 v${version}`));
});
