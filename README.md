# Pixel Flow

> Public source release. Canvas data, gallery assets, prompt-library content,
> API keys, runtime logs, import packages, and QA screenshots are intentionally
> excluded. User content stays in the browser's local storage unless explicitly
> exported by the user.

Pixel Flow 是一个基于 Chrome Manifest V3 的 AI 创意任务画布，通过节点组织图片、文字、生成任务和结果。它兼容两种生图方式：浏览器模式复用已登录的 ChatGPT 网页账号；API Key 模式通过本机 Pixel Flow API Worker 调用已配置的图片接口。每张任务卡都可以独立选择模式。

## 当前版本与关键交互（v0.2.6）

- 图片容器：选中一张或多张画布图片后新建“图片容器”，容器连接到任务后会逐张执行；容器外连接到同一任务的图片会作为每个子任务的共享参考图一并发送。
- 批量结果：同一任务的结果图从任务右侧开始横向并排，间距 40px；每张生成图右上角有下载按钮，可直接保存到本机。
- 图片复制：画布中选中普通图片、生成结果或图片容器后，可使用 `Command/Ctrl+C` 和 `Command/Ctrl+V` 复制／粘贴。多选会整体复制，连续粘贴每次向右下偏移 36px；生成结果的副本会成为普通图片，不继承旧任务连线。
- 系统剪贴板：单选普通图片或生成结果后按 `Command/Ctrl+C`，会同时写入系统剪贴板，可直接粘贴到聊天工具。当前 macOS 系统剪贴板与部分聊天工具不能可靠接收容器的多张独立图片；容器内图片的画布内复制可用，但“容器 → 聊天工具多附件粘贴”仍是待解决限制。
- 底部“生图模版”按钮：当前仅显示“功能还没想好，开发中！”，不会新增模板或任务节点。

> 验收边界：上述画布交互已经过代码回归、TypeScript 与构建验证。容器批量任务的真实 API/GPT-web 供应商闭环尚未在本轮功能更新后重新验收，不能据此推断供应商侧已完成复验。

## 本地资产与生图模板 MVP

- 左侧采用 Lovart 式两级侧栏：默认保留 60px 图标栏，分别对应提示词库、产品素材库、参考图库和生图模板库；点击图标后在其右侧展开对应内容，激活图标高亮，可用面板标题栏的收起按钮恢复宽画布。顶部不再提供“资产库”按钮。画布、底部工具栏、迷你地图和缩放控件会随侧栏展开状态自动避让。
- 完整提示词可以替换或追加到当前选中的普通生图任务，也可以拖入画布成为文字节点。
- 产品素材和参考图保存在本地浏览器，可拖入画布，或一键连接到选中的任务。
- 生图模板保留文案、构图、背景和自由补充四个可选提示词模块；构图与背景分别只调用提示词库中对应标签的内容，也可自由填写或留空。产品素材与参考图库默认折叠，只显示已选数量，展开后再选择；模板同时支持比例、浏览器/API 模式和 1–4 张生图数量。
- 运行模板会创建一个汇总模板卡和相互独立的普通生图任务；每个任务复用现有调度与回写链路，失败项可单独运行，也可从模板卡批量重试失败项。
- MVP 的提示词、预设和模板元数据保存在扩展自己的本地存储；产品图和参考图复用现有 `assets` 表。当前不包含团队共享、云同步、标签或自动去重。

## 开发

```bash
npm install
npm run dev
npm run check
npm run build
```

`npm run build` 会把 `src/` 原生画布、按需加载的资产库调用侧、后台/ChatGPT 适配器输出到 `扩展程序/`。正式入口为 `index.html`。

`npm run build:rebuild-preview` 只构建 TypeScript 重建预览，不会覆盖生产扩展。重建模块只有在行为回归通过后才能进入生产版。

## 目录

- `src/`：正式 React/TypeScript 画布源码，包括节点、状态、API 设置、资产库调用侧和编辑闭环。
- `production/`：正式/回退 HTML、视觉主题，以及暂时保留的资产管理与生图模板兼容模块。
- `public/manifest.json`：扩展清单源文件。
- `public/background.js`：当前后台调度兼容层。
- `public/contentScript.js`：当前 ChatGPT 页面适配器兼容层。
- `legacy/`：原 v0.2.3 打包脚本的只读基线，用于比对和回归。
- `扩展程序/`：Chrome 实际加载的构建产物，不作为后续功能开发入口。

## 数据兼容

数据库继续使用 `gpt-node-canvas`，表结构仍是 `projects / assets / runs`。重建源码和重新加载扩展不会主动删除现有画布数据。

## 当前迁移状态

- 正式入口使用 `src/` 构建产物；旧 v0.2.3 bundle 与补丁已移除。
- 节点、画布管理、生图模式、API 设置、连线、撤销、复制、拖图/粘贴和资产库调用侧已由 `src/` 原生提供。
- 资产管理端与生图模板暂时复用可读的 `production/asset-library.js`，运行在 native compatibility mode，不再注入旧画布栏或接管连线。
- 后台任务调度与 ChatGPT 页面适配器暂时保留为兼容脚本，已纳入工程构建。
- 新画布功能只写入 `src/`；修改 ChatGPT 页面适配时编辑 `public/contentScript.js`，不要直接改 `扩展程序/`。

## Mac 交互

- 触控板双指平行滑动：以默认约 2 倍速度平移画布。
- 触控板双指并拢或张开：缩小或放大画布。
- 点击素材到任务之间的输入实线：连线变红，并在点击位置显示“断开”标志；再次点击该标志只断开这条连接，不删除素材或任务，也不会重载页面或改变当前画布视图。生成结果的输出连线不提供此操作。
- 左下角缩放按钮仍可使用。
- 选中模块后按 `Backspace` 或 `Delete`：删除模块。
- 选中普通图片、生成结果或图片容器后按 `Command+C`：复制画布节点；单选图片或结果还会复制真实图片到系统剪贴板。
- 按 `Command+V`：粘贴最近复制的画布图片／容器；输入框、文本框和可编辑区域内仍使用系统原生复制粘贴。
- 光标位于输入框、文本框或可编辑内容时，`Backspace` 只删除文字，不删除模块。

## Windows 支持

- 支持 Chrome 和 Edge 的未打包扩展加载。
- `Ctrl+V` 粘贴图片或最近复制的画布图片／容器；`Ctrl+Z` 可连续撤销最近 3 次删除操作。
- 选中普通图片、生成结果或图片容器后按 `Ctrl+C`：复制画布节点；单选图片或结果还会复制真实图片到系统剪贴板。
- `Backspace` 或 `Delete` 删除已选模块；输入框内的退格编辑不受影响。
- 浏览器生图无需安装本地 Worker。
- API Key 生图需先安装 Node.js 20+，再运行 `npm run api-worker:install:windows`；它会为当前用户创建无需管理员权限的登录自启入口。
- 手动启动：`npm run api-worker:start:windows`。
- 卸载自启并停止 Worker：`npm run api-worker:uninstall:windows`。

## 生图模式

- 每张任务卡可选择 `GPT-web` 或 `API`，新建任务和新建生图模板默认使用 API 模式；已有任务保留原先保存的模式。
- API 模式在顶部“API 设置”中保存 Key；Key 只进入 `chrome.storage.local`，不会写入项目、备份、日志或源码。
- 无参考图：`POST https://aihub.rbmanon.cn/v1/images/generations`。
- 有参考图：`POST https://aihub.rbmanon.cn/v1/images/edits`，使用 JSON `images[].image_url` Base64 Data URL；该网关不接受 multipart。
- 模型固定 `gpt-image-2`，质量固定 `medium`；尺寸采用网关已验证的 16 像素倍数，例如 9:16 为 720×1280、16:9 为 1280×720。
- API 模式会把提示词和参考图片发送到 `aihub.rbmanon.cn`，结果仍写回原版 IndexedDB 画布和结果节点。
- API 请求最多等待 7 分钟；超时后任务失败并显示原因，不再永久停留在“生成中”。
- 扩展重载时发现中断的 API 任务，会标记失败且不自动重试，避免重复计费。
