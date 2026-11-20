# Pixel Flow

Pixel Flow 是一个运行在 Chrome / Edge 中的本地 AI 创意任务画布。它用节点组织图片、生成任务和结果，并把一次生图拆成可查看、可取消、可重试、可恢复的运行记录。

> 新电脑安装：使用 [Codex 安装指令](CODEX_INSTALL_PROMPTS.md)。
>
> 团队伙伴只使用 Team Cloud：阅读 [团队生图伙伴安装指南](TEAM_GATEWAY_PARTNER_GUIDE.md)。

## 当前版本

当前版本为 **v0.3.23**。新增本地图片存储统计与安全清理，精简旧模板、文字节点和手动释放标签入口；继续支持普通生图、容器批量、图片放大和 AI 结构化调用。图片放大默认 API Sunburst；任务卡提供三个主模式：

| 主模式 | 二级选择 | 底层兼容值 |
| --- | --- | --- |
| Web-img | GPT / Gpt-T / Gemini | `browser / team_web / gemini` |
| Team Cloud | Flare / Sunburst | `team` + `teamImageModel` |
| API | GPT Image 2 / Sunburst 2.5 / Flare 2.5 | `api` |

Web-img 的 GPT 与 Gpt-T 分别对应原 GPT Web 本机与团队链路；Gemini 使用当前浏览器的 Gemini 登录态。已有画布继续读取 `api / browser / team / team_web`，新增任务可保存 `gemini`，无需迁移旧数据。

### 任务运行

- `TaskRun` 是一次运行的权威状态，任务卡明确显示排队、准备环境、上传参考图、发送、等待执行机、生成、写回、完成、失败、等待手动处理和取消。
- 普通任务、图片容器批量和失败重试统一进入同一调度入口。
- 活动任务可以取消；失败或取消后可以重试；仍有团队云端 Job 的失败任务可以恢复已有结果，不重复生图。
- 扩展重载会从 TaskRun 恢复队列、对话 URL 和 provider Job，不会把终态任务重新提交。
- 完成结果与 TaskRun、任务卡投影、结果资产和结果节点在同一事务中写入，重复或迟到结果不会重复创建节点。

### 画布与素材

- 无限画布支持图片、任务、结果和图片容器。
- 图片可连到任务；多张输入按任务卡缩略图顺序发送，文字提示词直接填写在任务卡中。
- 图片容器会为容器内每张图创建独立子任务；容器外连入的图片作为每个子任务的共享参考图。
- 同一任务的多张结果在右侧横向排列，每张结果可直接下载。
- 支持拖入图片、Finder / 系统剪贴板粘贴、节点移动、框选、缩放、断开输入线和每画布独立撤销。
- 图片、结果、图片容器和任务支持 `Command/Ctrl+C`、`Command/Ctrl+V`；任务副本保留输入、提示词、比例和模式，但重置运行状态。
- 单张图片或结果复制时会同时写入系统剪贴板；容器多图不能保证被外部聊天工具识别为多个独立附件。

### 资产库与存储

- 左侧图标栏提供提示词库、产品素材、参考图库和存储空间。
- 提示词可替换或追加到选中任务。
- 产品图和参考图可拖入画布，或点击连接到当前选中任务。
- 提示词、产品和图库支持名称、标签、示例图或素材维护；各库支持独立备份与导入。
- 存储空间统计当前浏览器中的图片数量与占用；清理操作仅删除未被画布、容器、放大任务历史、提示词示例图、产品素材或图库引用的图片，并在删除前二次确认。

### 三个模式、五条执行链路

- **API**：通过本机 `127.0.0.1:43129` API Worker 调用 `aihub.rbmanon.cn`，可选 `gpt-image-2`、`gpt-image-2.5-sunburst`、`gpt-image-2.5-flare`；质量 `medium`。纯文字走 `generations`，参考图走 JSON Base64 `edits`。
- **Web-img · GPT**：使用当前浏览器已登录的 ChatGPT，新建或恢复真实对话，上传参考图、发送提示词并把结果写回画布。
- **Web-img · Gpt-T**：成员任务直接进入妙搭任务箱，由团队中任意一台已配对且在线的远端 Pixel Flow 执行机领取；提交电脑本身无需配对。该模式与 Team Cloud 统一计入成员每日团队生图用量与额度。协议 v10 使用对象存储逐图直传：执行机取得上传地址后并行上传原图，任务箱只保存结果清单，提交方从签名地址并行下载并校验 SHA-256；旧 bundle / chunks 任务保持兼容，协议 v8 取消仍可用。
- **Web-img · Gemini**：使用当前浏览器已登录的 Gemini，每个任务建立独立对话，上传参考图、发送提示词，识别真实 AI 生成图片后立即写回画布。
- **Team Cloud**：通过妙搭任务箱、Cloudflare Queue / Worker 和服务端 Codex OAuth 生图；可选 Flare / Sunburst，成员浏览器只保存成员令牌，平台访问 Key 由中继托管。

Team Web 的性能与验收记录见 [TEAM_WEB_PERFORMANCE.md](TEAM_WEB_PERFORMANCE.md)。旧本机 Team Gateway / Quick Tunnel 仍是兼容路径，不是新伙伴的推荐方案。


本版新增轻量图片放大任务卡：选中图片后创建放大任务，选择2×/4×/8×，自动分块生成并拼合PNG。详见 [图片放大说明](IMAGE_UPSCALING.md)。

## 快速开始

1. 将下载包完整解压。
2. 打开 `chrome://extensions` 或 `edge://extensions`，开启开发者模式。
3. 选择“加载已解压的扩展”，指向 `扩展程序/`。
4. 点击 Pixel Flow 图标打开画布。
5. 放入图片或文字，新建任务并连接输入。
6. 在任务卡选择 Web-img、Team Cloud 或 API；Web-img 可选 GPT、Gpt-T、Gemini，Team Cloud 可选 Flare/Sunburst，然后设置比例与提示词。
7. 点击“运行任务”，按任务卡状态等待结果写回。

首次配置统一从顶部 **生图设置** 进入：个人 API、团队成员令牌和本机网页生图机配对分别保存，凭证只保存在当前浏览器本地。网页生图机名称由任务箱管理员统一设置，执行机配对后自动同步。团队任务箱地址已内置，团队应用级访问配置由构建提供，个人成员授权由成员令牌承担；普通成员无需把本机配对成执行机。

## 备份与数据

- 画布、图片资产和 TaskRun 保存在扩展 IndexedDB `gpt-node-canvas` 的 `projects / assets / runs` 表。
- 提示词、产品和图库索引保存在扩展本地存储；图片仍复用 `assets` 表。
- “备份画布”会保存画布、连线和图片；各资产库另有独立导出与导入。
- “存储空间”只清理未引用的底层图片，并为刚写入但尚未完成引用的图片保留 10 分钟保护期；清理不可撤销，执行前应确认统计结果。
- 删除扩展前必须先备份。重新构建或重新加载扩展不会主动删除现有画布。

## Codex 结构化操作

安装本机 Bridge 后，Codex 可通过 Pixel Flow MCP 读取真实画布、管理画布和任务、把本地图片直接导入画布并连接任务、执行或恢复任务、读取 TaskRun、导入资产库、检查或清理未引用图片及下载图片。Bridge 只监听 `127.0.0.1:43128`。

详见 [COMMAND_API.md](COMMAND_API.md)。所有写操作都必须使用唯一 `requestId` 和最近状态的 `expectedRevision`，写后继续回读。

## 开发与验证

```bash
npm install
npm test
npm run check
npm run build
```

`npm run build` 会：

1. 从 `src/background/service-worker.ts` 生成 `public/background.js`。
2. 构建 React / TypeScript 画布。
3. 清空并重建 `扩展程序/assets/`，避免旧哈希 chunk 残留。
4. 将正式扩展产物写入 `扩展程序/`。

构建成功不等于真实运行完成。涉及 UI、调度、生图、恢复或数据写回时，还要重新加载真实扩展，并按 [架构验收门槛](ARCHITECTURE.md#发布前深链路门槛)回读。

## 源码边界

- `src/`：正式 React / TypeScript 画布、状态、存储和后台源码。
- `production/`：正式 HTML、主题和仍在兼容期的资产管理模块。
- `public/background.js`：构建产物，不手工修改。
- `public/contentScript.js`：ChatGPT 页面适配器源码。
- `api-worker/`：本机 API Key 持久 Worker。
- `扩展程序/`：Chrome / Edge 实际加载目录，不作为源码入口。

后台模块边界见 [BACKGROUND_ARCHITECTURE.md](BACKGROUND_ARCHITECTURE.md)，运行状态约束见 [GENERATION_ARCHITECTURE_BASELINE.md](GENERATION_ARCHITECTURE_BASELINE.md)。

## 已知限制

- ChatGPT 页面结构改变后，网页适配器可能需要更新。
- API Key 请求最多等待 7 分钟；超时后进入失败，不自动重复计费。
- Team Web 必须至少有一台在线且未暂停的网页生图机。
- 外部聊天工具不一定支持一次粘贴容器中的多张独立图片。
- 主后台组合根仍在继续类型化，当前仅 `src/background/service-worker.ts` 保留 `@ts-nocheck`。
