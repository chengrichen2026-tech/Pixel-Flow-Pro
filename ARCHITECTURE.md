# Pixel Flow 架构

## 运行链路

`ChatGPT Web：React 画布 → background 调度队列 → ChatGPT 标签页 → contentScript → IndexedDB → React 画布`

`API Key：React 画布 → background 提交本机任务 → 127.0.0.1:43129 常驻 API Worker → 本地任务结果 → background 轮询/重连 → IndexedDB → React 画布`

`Team Cloud：同伴 React 画布 → background 携平台 Key 与成员令牌提交任务 → 妙搭任务箱 → Cloudflare Queue/Worker → Codex OAuth 生图 → 鉴权结果下载 → 同伴 IndexedDB → React 画布`

`Team Web：同伴 React 画布 → 妙搭任务箱(provider=chatgpt_web) → Cloudflare 中继 → 已配对执行机 Pixel Flow background → ChatGPT contentScript → 结果 bundle（超大结果回退分块）→ 同伴 IndexedDB → React 画布`

## 稳定边界

- 生产画布逻辑：`src/` React/TypeScript 经 Vite 构建为 `扩展程序/assets/pixel-flow.js`，正式 `index.html` 已切换到该入口
- 生产品牌与视觉：`production/`
- 生图模式、模型与凭证设置 UI：`src/App.tsx`、`src/api-settings.ts`、`src/team-settings.ts`
- OpenAI 兼容 API 请求层：`public/api-client.js`
- API 模式执行：`src/background/service-worker.ts` 复用现有任务队列、项目写入和结果节点逻辑，构建生成 `public/background.js`
- API 持久执行：`api-worker/server.mjs`，任务文件位于 `runtime/api-jobs/`；macOS 使用动态生成的 LaunchAgent，Windows 使用当前用户启动文件夹与 PID 验证脚本
- 正式团队任务箱客户端：`src/background/team-gateway-http.ts`；云端服务由妙搭任务箱与 Cloudflare Worker承接
- 旧本机团队网关：`team-gateway/server.mjs`；成员令牌管理在 `team-gateway/cli.mjs`。它仍是已发布兼容路径，未取得真实用户迁移清单前不删除
- Codex OAuth 只在服务端执行环境读取；扩展和网络接口都不返回 OAuth 凭证
- 画布迁移门禁与进度：`CANVAS_MIGRATION.md`
- 扩展权限和产品信息：`public/manifest.json`
- 后台调度源码：`src/background/service-worker.ts` 及其 `src/background/`、`src/domain/` 模块
- 后台构建产物：`public/background.js`
- ChatGPT DOM 适配：`public/contentScript.js`
- 构建产物：`扩展程序/`

## 数据

IndexedDB 名称为 `gpt-node-canvas`，版本 1：

- `projects: id, updatedAt, name`
- `assets: id, createdAt`
- `runs: id, [projectId+taskId], startedAt`

保持数据库名、版本和字段不变，是旧画布数据继续可用的必要条件。

## 发布前深链路门槛

生图、任务状态、上传、ChatGPT adapter、API Worker、Team Gateway、标签页/内存管理、调度、IndexedDB 或画布刷新发生修改时，必须重跑所有受影响模式的真实产品图闭环：

1. 真实产品图连入任务，界面回读输入图片数正确。
2. 本机 ChatGPT Web 真实上传附件、发送提示词、进入对话、完成生成并写回结果。
3. API 模式真实提交 Worker job、完成生成并写回结果。
4. 团队模式真实通过成员令牌提交 Gateway job、由 Codex OAuth 完成生成并写回同伴画布。
5. Team Web 模式必须由另一台已配对设备领取任务，复用现有 ChatGPT adapter 生成并回传任务箱，再写回同伴画布。
6. 受影响路径均回读 `completed`、`runCount` 增加、结果节点/资产存在，完成后活动任务映射已清理。
7. 删除临时画布与本地验收资产，回读不存在后才收尾。

任一真实闭环未运行或未取得上述证据时，结论必须标记为“代码验证通过，深链路未验收”。

## 当前重构状态

生图后台遵守 [生图架构安全基线](GENERATION_ARCHITECTURE_BASELINE.md)。TaskRun 已接管运行事件、恢复与结果事务；后台基础设施、浏览器适配边界、provider I/O、输入解析和结果投影已拆分为可测试模块。

第七阶段已删除未被正式入口加载的 `production/generation-mode.js` 及构建副本，API、Browser与团队模式共用一套输入、提示词和 Base64 请求准备。动态权限仅允许 HTTPS；`127.0.0.1:43130` 与 Quick Tunnel 权限暂时保留，因为旧本机 Team Gateway 仍是已发布路径，当前只有本机配置证据，尚无覆盖所有真实用户的迁移清单。

第八阶段已增加 `generation-ui.ts` 作为运行配置与状态文案的唯一 UI 投影。当前任务卡显示 GPT Web、Team Cloud、API 三个主模式：GPT Web 再选择本机/团队，Team Cloud 再选择 Flare/Sunburst；内部继续映射到 `browser / team_web / team / api`。TaskNode 保存 `runtimeStatus` 兼容投影；活动任务支持取消，失败或取消任务支持重试，可恢复团队 Job 支持重新写回。普通任务、模板、图片容器批量和失败重试统一提交 `RUN_TASKS`。

当前 v0.3.14 的功能事实以 `TaskRun`、三个主模式、四条底层执行链路和真实加载扩展为准。

后续重点是批量运行模型迁移、资产管理端 TypeScript 化、ChatGPT DOM 探测、备份迁移测试及主包拆分。
