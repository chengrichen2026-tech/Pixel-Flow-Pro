# Pixel Flow API Worker

本机常驻 API 任务服务，监听 `127.0.0.1:43129`。

- `POST /jobs`：提交生图任务并返回任务 ID。
- `GET /jobs/:id`：查询运行状态或结果。
- `DELETE /jobs/:id`：清理已完成的本地任务结果。
- `GET /health`：健康检查。

API Key 只保留在运行中的 Node.js 进程内，不写入 `runtime/api-jobs`。任务状态和结果原子写入该目录，供扩展重载后继续读取。Worker 会在每次原子写入前重建这个可丢弃目录，避免运行期清理导致 `ENOENT`。

## macOS

伙伴发布包同时内置 Apple 芯片与 Intel Mac 的便携版 Node.js。直接双击 `start-api-worker.command` 即可启动，不需要另行安装 Node.js；源码开发包仍需安装 Node.js 20 或更新版本。

```bash
npm run api-worker:install
npm run api-worker:uninstall
curl http://127.0.0.1:43129/health
```

macOS 安装器会根据当前路径和 CPU 架构选择包内运行时或系统 `node`，并动态生成 LaunchAgent，不依赖作者本机的绝对路径。

## Windows 10 / 11

伙伴发布包内置便携版 Node.js，不需要另行安装，也不需要管理员权限；直接双击 `start-api-worker.cmd` 即可。源码开发包未附带便携运行时，需安装 Node.js 20 或更新版本。

```powershell
npm run api-worker:install:windows
npm run api-worker:start:windows
npm run api-worker:uninstall:windows
Invoke-RestMethod http://127.0.0.1:43129/health
```

`install:windows` 会在当前用户的“启动”文件夹创建启动器，登录 Windows 后自动启动 Worker。日志和 PID 仅保存在被 Git 忽略的 `runtime/` 目录。
