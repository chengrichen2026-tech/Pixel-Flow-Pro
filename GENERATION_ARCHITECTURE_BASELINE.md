# Pixel Flow 生图架构安全基线

## 目的

本基线为后台架构重构提供行为护栏。当前 `TaskRun` 已是运行写入与恢复的权威来源，TaskNode只保留任务定义、UI兼容投影和批量父级聚合；四种生图模式和旧画布数据仍保持兼容。

当前生产行为由 `src/background/service-worker.ts` 构建出的 `public/background.js`、`public/contentScript.js`、API Worker、团队任务箱和已加载扩展共同负责。`src/domain/task-run.ts` 是生产状态转换的领域契约。

第二阶段已完成后台源码和正式产物切换：`src/background/service-worker.ts` 生成独立后台，队列、比例、任务作用域和通知路由已拆成有直接行为测试的TypeScript模块。构建先写入 `.runtime/background-build/`，通过后再原子替换 `public/background.js`。2026-09-14已在重载后的真实扩展中完成API Key、ChatGPT Web、Team Cloud、Team Web四条真实图片闭环，并清理临时任务、结果节点和4个未引用底层资产。

第三阶段先以 `src/storage/task-run-repository.ts` 建立独立持久化边界：同一未终态运行幂等复用，终态后重试递增attempt，所有状态转换服从TaskRun契约，终态时间不可被重复事件改写。在生产消息开始双写前，该Repository保持独立测试，不提前改变现有任务节点状态。

第三阶段曾以影子双写验证TaskRun；第四阶段已经完成权威切换。`run.list`用于一致性回读，`run.delete`用于验收清理；终态清除瞬态detail，扩展重载会回收Pixel Flow自有任务分组中的孤儿ChatGPT标签。

第四阶段第一步将运行事件的写入权威切换到TaskRun：每条TASK_STATUS、TASK_ERROR和TASK_RESULT先解析为TaskRun状态与字段，再由持久化后的TaskRun生成TaskNode兼容投影。TaskRun、TaskNode投影、结果资产和结果节点在同一个IndexedDB事务中提交；事务失败不会留下单边状态。重复终态事件在写画布前被忽略，冲突终态仍按状态机拒绝。

第四阶段第二步已将启动恢复、队列重建、Browser恢复消息和API/Team Job对账切换为优先读取每个任务的最新TaskRun；只有没有当前schema TaskRun的旧画布才回退TaskNode。终态run不会进入活动队列，孤儿Browser恢复消息会被删除；已有provider Job直接继续轮询，不再重复发送sending状态或重新提交。启动时仅在投影确实不一致时修正TaskNode，避免无变化重载改动画布updatedAt与排序。

第四阶段第三步已清除Store单任务运行和批量重试对子任务运行状态的提前写入；恢复结果判重、取消Job ID和打开对话URL均改为TaskRun优先，TaskNode只继续承担UI投影和批量父级汇总。API、Browser、Team Cloud各完成一条真实图片任务，Team Web完成离线排队与取消；四条run均为attempt 1且终态一致。三张结果均下载为1254×1254有效PNG，之后任务、结果、资产、run和临时文件全部清理。

第五阶段开始拆分后台单体：`NodeCanvasDatabase`、`ProjectRepository`、`KeyedSerialQueue`和二进制编解码/摘要已从Service Worker抽到独立严格TypeScript模块。Service Worker由2055行降至1920行，构建仍只从同一入口打包，IndexedDB schema、事务表范围与生产产物保持不变。

第五阶段继续抽出协议校验、ChatGPT URL、适配器桥、任务标签分组和`TabRegistry`。这些模块不再依赖Service Worker闭包，可直接行为测试；入口最终降至1662行。provider执行和调度仍由入口统一编排，避免为追求文件数量引入跨模块循环依赖。

第五阶段最终抽出本机API Worker客户端与团队网关HTTP客户端，入口降至1580行。第六阶段依赖审计覆盖31个TypeScript/TSX文件和49条相对导入，循环依赖为0；所有源码中仅组合根保留`@ts-nocheck`。一次移除探针暴露的错误已归类为画布结果应用、Team Web执行机编排和Chrome消息分发三簇，后续继续按簇抽离，不以批量`any`消除。

第六阶段收尾将输入解析、结果节点、文字结果和批量父级状态投影抽到严格类型化`generation-projector.ts`，补齐TextResultNode真实title字段，入口降至1434行。画布结果应用错误簇已消除，剩余类型债只保留在Team Web执行机与Chrome消息分发。

第七阶段删除未被正式入口加载的`production/generation-mode.js`及其构建副本，改由React源码测试覆盖真实入口；API、Browser与团队执行共用一次输入解析、提示词比例拼装和Base64转换。动态host权限移除任意HTTP，仅允许HTTPS；旧本机`127.0.0.1:43130`与Quick Tunnel常驻权限暂留，直到取得真实用户迁移清单并提供升级迁移。

第八阶段由`generation-ui.ts`统一配置映射和状态文案；当前 UI 将四种底层值折叠为 GPT Web、Team Cloud、API 三个主模式，GPT Web 的本机/团队继续映射 `browser / team_web`，Team Cloud 模型继续保存在 `teamImageModel`。TaskRun原始状态通过`runtimeStatus`投影到任务卡，不再把`submitted / delivering / canceled`伪装为普通“生成中/失败”。普通任务、模板、图片容器批量和失败重试共用`RUN_TASKS`入口；取消通过同一TaskRun事务投影为`canceled`，云端恢复会创建新attempt并从`delivering`进入`completed`。

## 核心边界

- `TaskNode` 描述用户要执行什么：输入、提示词、比例、模式和模型。
- `TaskRun` 描述一次实际执行：运行 ID、attempt、状态、provider job ID、时间和错误。
- 同一次运行只有一个终态：`completed`、`failed` 或 `canceled`。
- 相同状态或相同终态事件允许重复到达，但不得重复创建结果或重复增加运行次数。
- `needs_action` 是可恢复的暂停状态，不是终态；用户手动发送后可以继续进入 `submitted` 或 `generating`。
- 重试必须创建新的 run/attempt，不得把已终态的运行改回队列状态。
- `statusDetail` 只解释状态，不承担额外状态语义。

## 生命周期

```text
queued
  -> preparing
  -> uploading / sending
  -> submitted
  -> generating
  -> delivering
  -> completed

任意非终态 -> failed / canceled
需要人工操作 -> needs_action -> submitted / generating / delivering
```

API 等不需要上传或远端交付的路径可以跳过中间阶段，但必须遵守 `src/domain/task-run.ts` 声明的合法转换。

## 旧状态兼容

| 当前任务状态 | TaskRun 状态 | 说明 |
| --- | --- | --- |
| `idle` | 无运行 | 任务定义存在，但尚未执行 |
| `queued` | `queued` | 已进入调度队列 |
| `waiting_page` | `preparing` | 正在准备页面或执行环境 |
| `uploading` | `uploading` | 正在传递参考图 |
| `sending` | `sending` | 正在提交提示词或请求 |
| `generating` | `generating` | provider 已接受并处理 |
| `manual_action` | `needs_action` | 等待用户完成可恢复动作 |
| `completed` | `completed` | 结果已经持久化并写回 |
| `failed` | `failed` | 本次运行失败 |

TaskNode 为旧数据兼容仍保存旧 `status` 投影，但当前任务卡优先读取 `runtimeStatus`，直接显示 `preparing`、`submitted`、`delivering`、`needs_action` 和 `canceled` 的统一状态机语义；不存在当前 schema TaskRun 的旧画布才回退旧状态。

## 四条底层执行链路验收矩阵

| 模式 | 输入准备 | provider job 标识 | 恢复入口 | 完成证据 | 清理证据 |
| --- | --- | --- | --- | --- | --- |
| API Key | 文字、比例、本地图片 Base64 | `apiJobId` | API recovery alarm | `completed`、runCount 增加、结果节点和资产存在 | 队列、active scope、Worker job 清理 |
| ChatGPT Web | 文字、比例、ChatGPT 附件 | 对话 URL和本地 task key | 页面监听、browser recovery alarm | 对话产生真实图片并写回同一任务 | browser message、active tab/scope 清理 |
| Team Cloud | 文字、比例、参考图、模型 | 团队 job ID | Team job reconciliation | 云端结果下载并写回同一任务 | 签收、下载缓存、队列和active scope 清理 |
| Team Web | 伙伴输入加远端 ChatGPT 执行 | 团队 job ID和执行机 active job | Team job reconciliation、执行机 alarm | 执行机回传、伙伴下载并写回同一任务 | delivery single-flight、active job、队列和active scope 清理 |

## 重构期间必须保持的行为

1. 已保存画布和旧任务无需迁移即可继续打开。
2. 每张任务卡的三个主模式、GPT Web 本机/团队、Team Cloud 模型、比例保持可用，并继续正确映射四种底层值。
3. 真实输入顺序、图片数量和最终提示词语义不变。
4. 扩展重载不自动重提可能计费的请求。
5. 重复结果、恢复结果和迟到结果只能被同一 run 接受一次。
6. 任务完成前不得把“已提交”“已入队”或“页面出现图片”报告为完整闭环。
7. 只有结果资产、结果节点和输出边均已持久化，运行才能进入 `completed`。
8. 批量任务每个子项独立成功或失败，父级状态由子项聚合，不覆盖已成功子项。
9. 取消或删除任务后，迟到消息不得恢复或重新创建结果。
10. 所有适用的临时队列、标签页映射、恢复消息和provider job必须在终态后清理。

## 分层验证门槛

### 每次提交

- TaskRun契约专项测试。
- `npm test`。
- `npm run check`。
- `npm run build`。
- 关键源码与 `扩展程序/` 产物同步检查。

### 改动调度、存储或恢复时

- 重复进度和重复终态事件测试。
- 扩展在 `queued / submitted / generating / delivering` 各阶段重载的恢复测试。
- 迟到结果、错误后结果、取消后结果的拒绝测试。
- 不同provider并发时任务身份隔离测试。

### 改动具体provider时

- 只对受影响模式执行真实产品图闭环。
- 回读任务终态、runCount、结果节点、资产和输出边。
- 回读队列、active scope、恢复消息和provider临时任务已经清理。

## 当前基线完成标准

- 状态集合、合法转换、终态和旧状态兼容映射均由可执行测试覆盖。
- 四条底层执行链路的输入、恢复、完成和清理证据已经写入矩阵。
- TaskRun 契约已进入生产写入、恢复、取消、重试和结果事务。
- 全量测试、TypeScript 和生产构建通过；真实运行验收按受影响模式单独执行。
