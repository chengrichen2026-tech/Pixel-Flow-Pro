# Pixel Flow 妙搭 Mac Worker

该 Worker 主动轮询妙搭团队生图任务箱，在本机使用 Codex OAuth 生图，再把结果分块回传。
妙搭和伙伴电脑都不会获得本机 Codex OAuth 凭证。

配置文件位于 `runtime/miaoda-worker/config.json`，不会进入 Git：

```json
{
  "gatewayUrl": "https://<妙搭开放接口地址>/openapi",
  "token": "<worker-api-key>",
  "workerId": "studio-mac"
}
```

安装为登录自启：

```bash
npm run miaoda-worker:install
```

运行状态写入：

```text
~/Library/Application Support/Pixel Flow Miaoda Worker/runtime/status.json
```
