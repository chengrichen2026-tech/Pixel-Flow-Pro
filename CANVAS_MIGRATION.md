# Pixel Flow 画布源码迁移

## 目标

`src/` 已成为唯一正式画布入口。剩余目标是把资产管理端和生图模板兼容模块完全迁入 React/TypeScript。

## 当前边界

- 正式扩展只加载 `src/` 构建产物；旧 v0.2.3 bundle、回退入口和字符串补丁已删除。
- 基线 bundle 使用 SHA-256 锁定；未经审查的旧画布变化会在写出生产文件前失败。
- 新的画布功能不得继续增加压缩 bundle 补丁，必须先在 `src/` 实现。

## 兼容补丁迁移状态

| 能力 | 正式兼容补丁 | `src/` 实现 |
| --- | --- | --- |
| 框选、平移、捏合缩放 | `canvas-navigation` | 已有 |
| 提示词区域滚动 | `prompt-scroll` | 已有 |
| 资产库写入后局部刷新 | `external-project-refresh` | 已有 |
| 仅错误态展示详情 | `error-only-status-detail` | 已有 |
| 重跑清理旧错误 | `clear-stale-run-detail` | 已有 |
| 图片 Object URL 生命周期 | `asset-url-lifecycle` | 已有 |
| 仅运行中结果线动画 | `active-output-animation` | 已有 |
| 本地或网页图片拖入画布 | `canvas-image-drop` | 已有 |

## 正式切换后的剩余工作

1. 资产库调用侧已动态拆包；管理端和生图模板仍由 `production/asset-library.js` 兼容提供，后续继续 TypeScript 化。
2. 当前覆盖最近一次删除撤销，后续可扩展为更长历史栈和节点缩放历史。
3. 主画布 bundle 仍约 515 kB，需要继续拆分图标与非首屏模块。
4. 真实库存在 1 条 media metadata 指向缺失 asset blob；保持记录不变，待单独的数据修复任务处理。

## 已完成的原生模块

### 生图模式与 API 设置

- `TaskNode` 原生保存 `generationMode` 和 `apiJobId`，缺少字段的旧任务仍默认浏览器模式。
- 新任务默认写入 `generationMode: "browser"`，复制任务不会继承旧 API job 或错误详情。
- 运行中和需要手动处理状态禁止切换模式；切回浏览器会清理 `apiJobId` 与旧错误详情。
- API Key 继续使用 `chrome.storage.local.pixelFlowApiKey`，本地预览使用同名 localStorage 回退。
- 未配置 Key 的 API 任务不会入队，而是打开原生 React 设置弹窗。

### 画布管理与输入连线

- 画布重命名和删除使用 React 模态框，不再依赖浏览器 `prompt/confirm`。
- 删除画布会取消其中任务、清理对应 runs；删除最后一个画布后自动创建空白兜底画布。
- 输入连线使用两步断开：先选择并变红，再点击“断开”；同时删除 edge 和任务 `inputEdgeOrder`。
- 结果输出线不提供断开操作，避免破坏任务结果关系。

### 编辑历史与剪贴板

- 删除节点时记录节点、关联边和受影响任务的输入顺序；Command/Ctrl+Z 可恢复最近一次删除。
- 删除图片或任务时会立即清理残留 `inputEdgeOrder`，撤销后再恢复原始顺序。
- 任务复制保留提示词、比例和生图模式，但清理 runCount、对话、API job、错误详情和输入边。
- 非文字编辑状态下粘贴剪贴板图片，会在当前可见画布中心创建图片资产和节点。
- 节点不再同时提供硬编码初始尺寸与 ResizeObserver 实测尺寸；静态生产预览冷启动和拖动均无 ResizeObserver 通知。

## 切换策略

1. 每次只迁移一个可验证模块，并在重建预览中完成交互回归。
2. 每次正式构建只产出 `src` 入口，并验证扩展产物中不存在旧 bundle 文件。
3. 后台与 ChatGPT adapter 继续独立演进，不与画布前端强耦合。
