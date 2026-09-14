# Pixel Flow Team Gateway

把本机 Codex OAuth 生图能力包装成仅供 Tailscale 私网访问的异步任务服务。主账号的 `~/.codex/auth.json`、访问令牌和刷新令牌始终留在网关主机，不发送给 Pixel Flow 客户端。

## 主机初始化

```bash
npm run team-gateway:init
npm run team-gateway:token -- create 同伴A 20
npm run team-gateway:token -- create 不限额同伴 unlimited
npm run team-gateway:install
curl http://127.0.0.1:43130/health
```

macOS 后台进程通常不能直接读取 `Documents` 内的开发目录。安装器会把 `server.mjs`、`core.mjs`、配置与运行数据复制到 `~/Library/Application Support/Pixel Flow Team Gateway/`，LaunchAgent 只执行该运行副本。后续成员管理命令会自动操作已安装配置；重新安装会更新程序，但保留原配置和成员令牌。

确认本机服务健康后，通过 Tailscale Serve 暴露给同一 tailnet：

```bash
tailscale serve --bg 43130
tailscale serve status
```

把 Serve 输出的 `https://设备名.tailnet名.ts.net` 填入同伴 Pixel Flow 的“生图设置 → 团队生图”，再填入刚创建的成员令牌。不要使用 `tailscale funnel`，它会把服务暴露到公网。

## 管理成员

```bash
npm run team-gateway:members
npm run team-gateway:token -- revoke 同伴A
npm run team-gateway:uninstall
```

每个成员按 UTC 日期独立计数；默认每天 20 次，创建时传入 `unlimited` 表示不限制每日次数。令牌只在创建时显示一次，配置文件只保存 SHA-256 摘要。开发运行数据保存在被 Git 忽略的 `runtime/team-gateway/`，安装后的运行数据保存在 Application Support 目录。

需要避免令牌出现在终端或聊天记录时，可以把一次性凭证写入权限为 `0600` 的本地文件：

```bash
PIXEL_FLOW_TEAM_CREDENTIAL_OUTPUT="runtime/伙伴1.json" \
PIXEL_FLOW_TEAM_GATEWAY_URL="https://pixel-flow.example.ts.net" \
npm run team-gateway:token -- create 伙伴1 unlimited
```

## 接口

- `GET /health`：无需认证的最小健康状态。
- `GET /me`：认证成员、每日额度和当天用量。
- `POST /jobs`：提交任务；同一成员重复提交相同 `requestId` 只返回原任务。
- `GET /jobs/:id`：读取排队、运行、完成或失败状态。
- `DELETE /jobs/:id`：清理本成员已完成或失败的任务。

除 `/health` 外均需 `Authorization: Bearer <成员令牌>`。网关单并发执行；服务重启后会恢复未开始的排队任务，但不会自动重跑已进入 Codex 请求的任务。
