# Pixel Flow API Worker

本机常驻 API 任务服务，监听 `127.0.0.1:43129`。

- `POST /jobs`：提交生图任务并返回任务 ID。
- `GET /jobs/:id`：查询运行状态或结果。
- `DELETE /jobs/:id`：清理已完成的本地任务结果。
- `GET /health`：健康检查。

API Key 只保留在运行中的 Node.js 进程内，不写入 `runtime/api-jobs`。任务状态和结果原子写入该目录，供扩展重载后继续读取。Worker 会在每次原子写入前重建这个可丢弃目录，避免运行期清理导致 `ENOENT`。

## macOS

```bash
npm run api-worker:install
npm run api-worker:uninstall
curl http://127.0.0.1:43129/health
```

macOS 安装器会根据当前克隆路径和 `node` 位置动态生成 LaunchAgent，不依赖作者本机的绝对路径。

## Windows 10 / 11

需要 Node.js 20 或更新版本，不需要管理员权限。

```powershell
npm run api-worker:install:windows
npm run api-worker:start:windows
npm run api-worker:uninstall:windows
Invoke-RestMethod http://127.0.0.1:43129/health
```

`install:windows` 会在当前用户的“启动”文件夹创建启动器，登录 Windows 后自动启动 Worker。日志和 PID 仅保存在被 Git 忽略的 `runtime/` 目录。
