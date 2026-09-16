# AGENTS.md

## 产品定位

- 本目录是 Pixel Flow 的正式开发目录。
- 本产品归属于父项目 `Project_07_Pixel创意工具`。
- Pixel Flow 是 Chrome Manifest V3 AI 创意任务画布，负责图片、提示词、生图任务、批量执行、结果回写和本地资产管理。
- 先遵守项目根目录 `AGENTS.md`，再遵守本文件。

## 源码与产物边界

- `src/` 是正式 React / TypeScript 画布源码。
- `src/background/` 与相关 `src/domain/` 模块是后台正式源码；`public/background.js` 是由 `npm run build:background` 生成的产物，不再手工编辑。
- `public/contentScript.js` 和 `public/manifest.json` 仍是 ChatGPT 适配与扩展清单源文件。
- `production/` 保存正式主题和仍在兼容期的可读模块。
- `扩展程序/` 是 Chrome 实际加载的构建产物，不作为手工功能开发入口。
- `.pixel-flow-pro-publish/` 位于项目根目录，是公开快照工作区，不是本产品的日常源码入口。

## 默认开发与验证

1. 先定位任务影响的是画布、资产库、调度、ChatGPT 适配、API Worker、存储还是构建链路。
2. 修改正式源文件，不直接在 `public/background.js` 或加载产物中做无法回源的修补。
3. 运行与改动直接相关的专项测试，再运行 `npm test`、`npm run check` 和 `npm run build`。
4. 比对关键源码与 `扩展程序/` 产物已经同步。
5. 使用 `ego-browser` Skill 重新加载真实 Chrome 扩展，再在实际画布验证交互和持久化状态；重载后必须通过结构化命令回读连接状态，不能以点击重载替代验收。

## 深链路验收

- 涉及生图、任务状态、参考图上传、ChatGPT 页面适配、API Worker、调度队列、MV3 恢复、IndexedDB 写回或画布刷新时，完成标准是“真实产品图从输入一直写回画布”。
- 默认用独立临时画布、低成本产品图和简短提示词，按受影响模式验证 ChatGPT Web 和／或 API Key；只有同时影响两种模式时才强制两条都重跑。
- 证据至少包括：输入图片数、任务模式、对话 URL 或 `apiJobId`、最终状态、`runCount`、结果节点与资产存在、调度或活动标签清理状态。
- 因账号、额度、网络、供应商或授权无法执行时，只能报告“代码验证通过，深链路未验收”。
- 不涉及供应商请求的局部 UI 修改可以不产生新生图费用，但必须在真实加载扩展中验证目标交互。
- 验收后删除临时任务、画布和本地结果资产，并回读不存在。

## 发布与数据边界

- 发布公开仓库前单独确认目标仓库、分支和范围。
- 公开包只包含功能源码和必要产物；排除真实画布、图库、提示词库、产品素材、导入包、API Key、日志、截图和临时运行数据。
- 不把构建成功当作已部署，也不把远端推送成功当作用户当前 Chrome 已加载新版。
