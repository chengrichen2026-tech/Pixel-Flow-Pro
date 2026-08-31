# 发送给 Codex 的 Pixel Flow 安装命令

> 这不是要粘贴到终端里的 Shell 命令。请把对应系统的整段文字发送给 **Codex**，由 Codex 完成安装、配置和验证。

用户需要亲自处理 ChatGPT 账号登录、验证码和 API Key 输入。不要在 Codex 聊天中发送密码或 API Key。

## macOS：发送给 Codex

```text
请直接在这台 macOS 电脑上完整安装 Pixel Flow，不要只给教程。

GitHub 仓库：
https://github.com/chengrichen2026-tech/Pixel-Flow-Pro.git

请依次完成：

1. 检查 Git、Node.js 20+、npm 和 Codex。缺少 Node.js 时打开 Node.js 官方 LTS 下载页，让我安装完成后继续。
2. 把仓库克隆到 `~/Documents/Pixel-Flow-Pro`。目录已存在时先检查未提交修改，不要覆盖个人文件。
3. 进入项目目录执行 `npm install`、`npm test`、`npm run check`、`npm run build`。任何一步失败都停止并告诉我原因。
4. 执行 `npm run api-worker:install`，读取 `http://127.0.0.1:43129/health`，确认 API Worker 真实健康。
5. 执行 `npm run bridge:install` 和 `npm run bridge:status`，读取 `http://127.0.0.1:43128/health`。Bridge 只能监听 `127.0.0.1`。
6. 备份并保留 `~/.codex/config.toml` 的已有内容，添加或更新且只保留一份：

[mcp_servers.pixel-flow]
command = "node"
args = ["Pixel-Flow-Pro 中 tools/pixel-flow-mcp/server.mjs 的真实绝对路径"]

验证 MCP `initialize` 和 `tools/list`，不要保留占位路径。配置后告诉我需要新开 Codex 任务。
7. 打开 `chrome://extensions`，开启开发者模式并加载 `Pixel-Flow-Pro/扩展程序`。如果必须手动选择文件夹，把浏览器交给我并准确说明选择哪个目录。
8. 不要替我登录账号，也不要让我在聊天里发密码或 API Key。ChatGPT 登录、验证码和 Pixel Flow API Key 由我自己输入。
9. 做一次无费用验收：新建临时画布和一个不运行的任务，读取确认存在，撤销并确认消失，最后删除临时画布。不得调用生图接口。

最后简洁报告安装目录、扩展、API Worker、Bridge、MCP、需要我手动完成的步骤，以及是否需要新开 Codex 任务。不能用“应该成功”代替真实命令输出和状态回读。
```

## Windows 10/11：发送给 Codex

```text
请直接在这台 Windows 电脑上完整安装 Pixel Flow，不要只给教程。

GitHub 仓库：
https://github.com/chengrichen2026-tech/Pixel-Flow-Pro.git

请依次完成：

1. 检查 Git、Node.js 20+、npm 和 Codex。缺少 Node.js 时打开 Node.js 官方 LTS 下载页，让我安装完成后继续。
2. 把仓库克隆到 `%USERPROFILE%\Documents\Pixel-Flow-Pro`。目录已存在时先检查未提交修改，不要覆盖个人文件。
3. 进入项目目录执行 `npm install`、`npm test`、`npm run check`、`npm run build`。任何一步失败都停止并告诉我原因。
4. 执行 `npm run api-worker:install:windows`，读取 `http://127.0.0.1:43129/health`，确认 API Worker 真实健康。
5. 为 `tools\pixel-flow-bridge\daemon.mjs` 创建当前 Windows 用户的登录自启项，使用 Node 真实绝对路径、项目真实工作目录并隐藏后台运行。启动后读取 `http://127.0.0.1:43128/health`。Bridge 只能监听 `127.0.0.1`。
6. 备份并保留 `%USERPROFILE%\.codex\config.toml` 的已有内容，添加或更新且只保留一份：

[mcp_servers.pixel-flow]
command = "node"
args = ["Pixel-Flow-Pro 中 tools/pixel-flow-mcp/server.mjs 的真实绝对路径"]

验证 MCP `initialize` 和 `tools/list`，不要保留占位路径。配置后告诉我需要新开 Codex 任务。
7. 打开 `chrome://extensions`，开启开发者模式并加载 `Pixel-Flow-Pro\扩展程序`。如果必须手动选择文件夹，把浏览器交给我并准确说明选择哪个目录。
8. 不要替我登录账号，也不要让我在聊天里发密码或 API Key。ChatGPT 登录、验证码和 Pixel Flow API Key 由我自己输入。
9. 做一次无费用验收：新建临时画布和一个不运行的任务，读取确认存在，撤销并确认消失，最后删除临时画布。不得调用生图接口。

最后简洁报告安装目录、扩展、API Worker、Bridge、MCP、需要我手动完成的步骤，以及是否需要新开 Codex 任务。不能用“应该成功”代替真实命令输出和状态回读。
```

## 安装后的第一句验证指令

新开一个 Codex 任务，发送：

```text
请优先使用 Pixel Flow MCP → Bridge → 真实扩展页面的结构化链路，读取当前 Pixel Flow 状态，并告诉我当前画布名称、任务数量和 Bridge 连接状态。
```
