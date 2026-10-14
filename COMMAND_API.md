# Pixel Flow Structured Command API v1

Pixel Flow 扩展通过 `ws://127.0.0.1:43128/canvas` 连接本机 Bridge，Codex 通过 `pixel-flow` MCP 调用结构化命令，无需用鼠标操作画布。Bridge 只监听 `127.0.0.1`。

## Codex 工具

- `pixel_flow_status`：Bridge 和扩展连接状态。
- `pixel_flow_get_state`：读取画布列表、当前项目、节点、连线、选中项与 `revision`。
- `pixel_flow_get_products`：读取产品素材库的素材名称与当前标签。
- `pixel_flow_get_library`：按 `all / prompts / products / references` 读取规范化资产库记录，并报告缺失的图片资源。
- `pixel_flow_import_library`：接收 Agent 已整理和打标的数据；默认只预览，`apply=true` 时写入。支持 `merge / replace`。
- `pixel_flow_auto_tag_products`：按素材名称推导产品系列与“包装盒/铝箔”标签；默认预览，`apply=true` 时写入。
- `pixel_flow_create_canvas`：新建并打开画布。
- `pixel_flow_import_image`：从绝对本地路径、Base64 Data URL 或已有 `assetId` 创建画布图片节点；可用 `targetTaskId` 在创建时直接连接任务。
- `pixel_flow_upscale_image`：一步导入或选择图片，创建并默认启动分块放大；支持 sourceNodeId / filePath / imageDataUrl / assetId 四选一，2/4/8倍，默认GPT Web本机。
- `pixel_flow_get_upscale_task`：只读查询权威TaskRun状态、进度、目标尺寸和结果节点；只有completed时返回finalResults。
- `pixel_flow_regenerate_upscale_tile`：指定taskId和tileId，重生单块并重新拼合。
- `pixel_flow_create_task`：新建生图任务，可设提示词、`api / browser / team / team_web` 模式、团队模型 `flare / sunburst`、比例、位置和输入节点。
- `pixel_flow_run_task`：执行指定任务。
- `pixel_flow_download_image`：将图片或生成结果写到指定的绝对路径。
- `pixel_flow_execute`：执行一条或多条底层命令。
- `pixel_flow_get_task`：超时后按 `requestId` 查询结果，避免重复写入。

## 底层命令

- `canvas.create` / `canvas.open` / `canvas.delete`
- `image.upscale`（sourceNodeId / imageDataUrl / assetId 三选一，scale、generationMode、run；run默认true，false仅创建任务）
- `image.create`（接收 `imageDataUrl` 或已有 `assetId`，创建画布图片节点，并可选连接 `targetTaskId`）
- `task.create` / `task.run` / `task.recoverTeamResult` / `task.duplicate` / `task.delete`
- `node.move` / `node.delete`
- `asset.deleteIfUnused`（仅删除指定且未被任何画布、图片容器、提示词封面或素材库引用的底层图片资产）
- `run.list`（读取当前画布或指定任务的权威 TaskRun 记录，可按 `taskId` 收窄）
- `run.delete`（只删除明确指定且属于当前 TaskRun schema 的运行记录，用于临时验收清理）
- `history.undo`
- `library.autoTagProducts`（`preview=true` 只返回拟变更，`preview=false` 写入并通知素材库刷新）
- `library.import`（接收规范化的提示词、产品图或图库数据；API 本身不调用 AI，也不负责识图）

## Agent 与导入 API 的责任边界

Agent 负责读取本地文件或表格、识别图片内容、生成名称和标签，并把结果整理成规范化条目。Pixel Flow 只负责数据校验、预览、冲突处理、图片资产写入、素材库刷新和写后回读。

提示词条目：

```json
{
  "name": "粉色丝绸产品海报",
  "content": "生成柔粉丝绸背景的产品海报……",
  "tags": ["生活方式", "粉色"],
  "imageDataUrl": "data:image/png;base64,..."
}
```

产品图或图库条目：

```json
{
  "name": "durex-pd-003｜超薄尊享三合一14只装｜包装盒",
  "tags": ["超薄系列", "包装盒"],
  "imageDataUrl": "data:image/png;base64,..."
}
```

`imageDataUrl` 必须是 Base64 Data URL。提示词示例图可省略；产品图和图库图片必须提供 `imageDataUrl`，或引用扩展中已存在的 `assetId`。`merge` 按同库同名更新或新增；`replace` 用本次条目替换指定库的记录，但不会主动删除可能仍被画布引用的底层图片资产。

直接把本地图片放入画布时，优先调用 `pixel_flow_import_image`。`filePath` 必须是绝对路径，且扩展名为 `png / jpg / jpeg / webp / gif`；`filePath`、`imageDataUrl`、`assetId` 必须且只能提供一个。命令返回新建图片节点的 `nodeId` 与 `assetId`，后续可直接传给 `pixel_flow_create_task.sourceNodeIds`。使用 `targetTaskId` 时，图片创建后会同时写入该任务的输入边。

所有写操作必须使用唯一 `requestId`，并传入最近 `pixel_flow_get_state` 返回的 `expectedRevision`。如果 revision 冲突，先重新读取状态，不要盲目重试写操作。

`task.run` 只表示运行请求已被当前扩展接受；最终完成必须继续用 `pixel_flow_get_state` 和 `run.list` 回读 TaskRun 终态、结果节点、资产与输出边。`task.recoverTeamResult` 必须同时传入 `projectId`、`taskId` 和已知 `jobId`，只恢复已有团队结果，不新建生图请求。

## 运维

```bash
npm run bridge:install
npm run bridge:status
npm run bridge:uninstall
```

MCP 配置位于 `~/.codex/config.toml` 的 `[mcp_servers.pixel-flow]`。新建 Codex 任务后会加载该工具。

## 一步图片放大

```json
{
  "op": "image.upscale",
  "sourceNodeId": "image-实际节点ID",
  "scale": 2,
  "generationMode": "browser"
}
```

当前已有pixel_flow_execute即可调用上述命令；专用MCP工具在重载MCP连接/新聊天后可发现。filePath只由专用MCP工具读取，本机浏览器不读取任意本地文件路径。所有写入仍需唯一requestId与最新expectedRevision。

返回taskId、sourceNodeId、accepted和当前status；accepted不是已完成。用pixel_flow_get_upscale_task轮询status；completed后用finalResults中的nodeId调用pixel_flow_download_image。失败时保留taskId用于诊断/重试，超时先按原requestId查询，不能盲目创建重复任务。单块重生期间旧大图只放在previousResults，不冒充新成品。
