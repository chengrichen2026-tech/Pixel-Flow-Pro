# Pixel Flow Structured Command API v1

Pixel Flow 扩展通过 `ws://127.0.0.1:43128/canvas` 连接本机 Bridge，Codex 通过 `pixel-flow` MCP 调用结构化命令，无需用鼠标操作画布。Bridge 只监听 `127.0.0.1`。

## Codex 工具

- `pixel_flow_status`：Bridge 和扩展连接状态。
- `pixel_flow_get_state`：读取画布列表、当前项目、节点、连线、选中项与 `revision`。
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

所有写操作必须使用唯一 `requestId`，并传入最近 `pixel_flow_get_state` 返回的 `expectedRevision`。如果 revision 冲突，先重新读取状态，不要盲目重试写操作。

## 运维

```bash
npm run bridge:install
npm run bridge:status
npm run bridge:uninstall
```

MCP 配置位于 `~/.codex/config.toml` 的 `[mcp_servers.pixel-flow]`。新建 Codex 任务后会加载该工具。
