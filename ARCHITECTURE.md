# Pixel Flow 架构

## 运行链路

`浏览器模式：React 画布 → background 调度队列 → ChatGPT 标签页 → contentScript → IndexedDB → React 画布`

`API 模式：React 画布 → background 提交本机任务 → 127.0.0.1:43129 常驻 API Worker → 本地任务结果 → background 轮询/重连 → IndexedDB → React 画布`

`团队模式：同伴 React 画布 → background 携成员令牌提交任务 → Tailscale HTTPS → 主机 127.0.0.1:43130 Team Gateway → Codex OAuth 生图 → background 轮询/重连 → 同伴 IndexedDB → React 画布`

`团队 GPT-web：同伴 React 画布 → 妙搭任务箱(provider=chatgpt_web) → Cloudflare 中继 → 已配对执行机 Pixel Flow background → 现有 ChatGPT contentScript → 任务箱结果分块 → 同伴 IndexedDB → React 画布`

## 稳定边界

- 生产画布逻辑：`src/` React/TypeScript 经 Vite 构建为 `扩展程序/assets/pixel-flow.js`，正式 `index.html` 已切换到该入口
- 生产品牌与视觉：`production/`
- 生图模式与 Key 设置 UI：`production/generation-mode.js`
- OpenAI 兼容 API 请求层：`public/api-client.js`
- API 模式执行：`public/background.js` 中复用原版任务队列、项目写入和结果节点逻辑
- API 持久执行：`api-worker/server.mjs`，任务文件位于 `runtime/api-jobs/`；macOS 使用动态生成的 LaunchAgent，Windows 使用当前用户启动文件夹与 PID 验证脚本
- 团队网关：`team-gateway/server.mjs`；成员令牌管理在 `team-gateway/cli.mjs`，主机配置、用量和任务位于被 Git 忽略的 `runtime/team-gateway/`
- Codex OAuth 只由团队网关主机上的 `codex-gpt-image` 脚本读取；扩展和网络接口都不返回 OAuth 凭证
- 画布迁移门禁与进度：`CANVAS_MIGRATION.md`
- 扩展权限和产品信息：`public/manifest.json`
- 后台调度兼容层：`public/background.js`
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
2. 浏览器模式真实上传附件、发送提示词、进入对话、完成生成并写回结果。
3. API 模式真实提交 Worker job、完成生成并写回结果。
4. 团队模式真实通过成员令牌提交 Gateway job、由 Codex OAuth 完成生成并写回同伴画布。
5. 团队 GPT-web 模式必须由另一台已配对设备领取任务，复用现有 ChatGPT adapter 生成并回传任务箱，再写回同伴画布。
6. 受影响路径均回读 `completed`、`runCount` 增加、结果节点/资产存在，完成后活动任务映射已清理。
7. 删除临时画布与本地验收资产，回读不存在后才收尾。

任一真实闭环未运行或未取得上述证据时，结论必须标记为“代码验证通过，深链路未验收”。

## 后续优先重构

1. 将仍由 `production/asset-library.js` 提供的管理端和模板能力迁为独立 React/TypeScript chunk。
2. 将后台调度兼容层拆成 TypeScript 模块。
3. 为 ChatGPT DOM 适配器建立选择器探测与回归测试。
4. 增加备份导入、自动备份和迁移测试。
5. 降低主画布 bundle 体积；资产库调用侧已经动态拆包，主包仍超过 500 kB。
