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
- `pixel_flow_create_task`：新建生图任务，可设提示词、API/GPT-web、比例、位置和输入节点。
- `pixel_flow_run_task`：执行指定任务。
- `pixel_flow_download_image`：将图片或生成结果写到指定的绝对路径。
- `pixel_flow_execute`：执行一条或多条底层命令。
- `pixel_flow_get_task`：超时后按 `requestId` 查询结果，避免重复写入。

## 底层命令

- `canvas.create` / `canvas.open` / `canvas.delete`
- `task.create` / `task.run` / `task.duplicate` / `task.delete`
- `node.move` / `node.delete`
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

所有写操作必须使用唯一 `requestId`，并传入最近 `pixel_flow_get_state` 返回的 `expectedRevision`。如果 revision 冲突，先重新读取状态，不要盲目重试写操作。

## 运维

```bash
npm run bridge:install
npm run bridge:status
npm run bridge:uninstall
```

MCP 配置位于 `~/.codex/config.toml` 的 `[mcp_servers.pixel-flow]`。新建 Codex 任务后会加载该工具。
