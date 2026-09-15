# Pixel Flow 后台架构

## 当前责任边界

`src/background/service-worker.ts` 是 Chrome MV3 组合根，只负责实例化依赖、协调任务、注册 Chrome 事件和串联 provider。它不再定义数据库、项目仓储、协议、URL、标签注册或基础二进制工具。

| 层 | 模块 | 责任 |
| --- | --- | --- |
| 领域 | `src/domain/task-run.ts` | 生命周期、合法转换和旧状态映射 |
| 领域 | `src/domain/run-projection.ts` | 运行事件解析、TaskNode投影和恢复状态解析 |
| 存储 | `src/storage/database.ts` | IndexedDB schema |
| 存储 | `src/storage/project-repository.ts` | 项目、资产和跨表事务 |
| 存储 | `src/storage/task-run-repository.ts` | TaskRun attempt与持久化转换 |
| 浏览器基础设施 | `src/background/tab-registry.ts` | 任务与ChatGPT标签所有权、复用、休眠和孤儿清理 |
| 浏览器基础设施 | `task-tab-grouper.ts`、`chatgpt-url.ts`、`chatgpt-adapter-bridge.ts` | 标签分组、对话身份和页面适配器握手 |
| provider I/O | `api-worker-client.ts` | 本机API Worker请求与轮询 |
| provider I/O | `team-gateway-http.ts` | 团队网关鉴权、限流重试、取消和结果代理 |
| 应用投影 | `generation-projector.ts` | 输入解析、结果节点、文字结果和批量父级投影 |
| 通用基础设施 | `binary.ts`、`keyed-serial-queue.ts`、`protocol.ts` | 编解码、写入串行化和消息入口校验 |

## 依赖规则

1. 领域模块不依赖Chrome API、Dexie或provider。
2. 存储模块可以依赖领域类型，不依赖Service Worker。
3. 浏览器与provider模块不直接写项目状态，只返回结果或抛出明确错误。
4. 只有Service Worker组合根可以同时协调队列、TaskRun、项目投影和外部provider。
5. 正式产物始终由`npm run build`从TypeScript入口生成；不得手改`public/background.js`或`扩展程序/`。

## 当前验证

- 源码 33 个 TypeScript/TSX 文件、57 条相对导入；依赖检查未发现循环依赖。
- Service Worker 由 2055 行降至 1419 行。
- 抽出的模块全部接受严格 TypeScript 检查；全量 195 项测试与生产构建通过。Chrome 消息入口已从宽泛 `Record<string, unknown>` 收窄为可判别的 `ExtensionMessage` 联合，并对结果、下载和通知消息增加字段级运行时校验。
- API、Browser、Team Cloud真实完成结果闭环；Team Web完成重载恢复和云端取消闭环。

## 剩余边界

`service-worker.ts` 仍是唯一带 `@ts-nocheck` 的源码文件。画布结果应用错误簇已通过 `generation-projector.ts` 消除；Chrome 消息协议边界已经类型化，剩余错误主要集中在 Team Web 执行机编排、任务箱 JSON 响应和组合根内部函数参数。下一轮应先为任务箱响应建立解析器，再移除组合根豁免；禁止用批量 `any` 或宽松 ambient 声明消除报错。

前端生产构建已按 React、画布引擎、图标、状态存储和其余第三方依赖拆分稳定 chunk，同时保持单一入口 CSS，避免手工维护的扩展 HTML 漏载样式。主业务入口由 569.07 kB 降至 76.86 kB；依赖总体积没有被伪装成删除，收益主要是缓存复用、入口解析和后续按模块继续减重。
