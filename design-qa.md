# Pixel Flow 画布项目页 Design QA

final result: passed

## 2026-08-26 用户授权的可用性偏离

- 用户在 1:1 恢复后明确要求底栏按钮更大，因此 36×36 legacy 尺寸有意提升为 44×44，图标提升为 22×22；这是授权变更，不再视为视觉回归。
- 用户明确要求图片只保留右下角缩放点，因此四角控制点有意收敛为一个，等比缩放与尺寸持久化保持。
- 任务输入修复为本地 draft＋250ms 防抖，并在切换画布后重新 fitView；英文、中文 IME 和 IndexedDB 回读通过。
- 当前无新增 P0/P1/P2；final result: passed

## 2026-08-26 Legacy → Native 1:1 最终对照

- source visual truth：用户提供的 `ego lite Appshot 2026-08-26T08-37-06.507Z.png`，以及删除前的原版画布实时 DOM/CSS 几何与样式回读。
- implementation screenshot：`artifacts/pixel-flow-interaction-audit/16-native-sidebar-parity.png`。
- focused comparison evidence：迁移前后的画布在同一浏览器、同一 `1470×731` CSS 视口、deviceScaleFactor 1、同一 IndexedDB 数据下逐项回读。
- full-view comparison：管理页参考与 native 均为 60px 单栏、全高工作区、同标题/筛选/四列卡片体系；用户截图中的卡片图片、文案和按钮均复用同一真实资产库数据。
- density normalization：实现截图为 `1454×715` PNG；用户 appshot 包含浏览器外框，判断时只比较扩展内容区。实时 DOM 对照不受图片密度影响。

### Comparison history

1. P1：native 初版出现品牌顶栏与两条左侧栏。修复为隐藏顶栏、60px 单条左栏和底部水平工具栏。
2. P1：调用侧、提示词管理与项目画廊可能叠层。修复为进入管理前卸载调用侧，管理模式隐藏项目画廊。
3. P1：底部工具栏缺模板任务按钮，Mini Map 为 202×152，任务卡为 328×223。修复后分别为 5 按钮/208×48、148×84、360×243，与 legacy 实测一致。
4. P1：native 图片节点忽略历史 `width/height` 且不可缩放。修复为按存储宽高渲染、无尺寸时按真实图片比例归一到 320px、选中后显示 4 个等比缩放控制点并持久化。
5. P2：管理页左栏激活态和 Phosphor 图标笔画不同。修复为同步 legacy 管理状态，并原样复用旧版 SVG path。
6. P1：React 调用侧为 320px 双列紧凑卡，legacy 为 236px 单列完整卡。正式左栏改为直接打开 legacy 调用面板；最终回读 panel x=60/236×715、首卡 211×238.828、画布 x=296/1158×715，滑入过渡 180ms 与旧版一致。

### Required fidelity surfaces

- Fonts/typography：任务标题 `13px/760`、提示词 `12px/17.76px`、footer `rgb(113,118,128)` 与 legacy 一致。
- Spacing/layout：左栏 60px；按钮坐标 y=14/70/118/166/214/629/677；Mini Map x=72/y=589/148×84；Controls x=72/y=689/106×28；工具栏 x=661/y=667/208×48。
- Colors/tokens：继续复用 Pixel Flow 紫色、白色工作区、灰色描边与原版 active/hover 语义。
- Image quality/assets：管理卡和画布媒体继续读取同一 IndexedDB blob；不替换、不重新压缩。历史 320×320、213.33×320 等尺寸真实生效。
- Copy/content：画布管理、提示词/产品/参考图/模板、API 设置、节省内存和任务卡文案与旧版一致。

### Final interaction checks

- PF → 画布管理 → 打开画布闭环通过。
- 调用提示词 → 前往库管理闭环通过，`callPanel=0`、`management=1`。
- 左栏管理 active 状态通过。
- 模板任务按钮恢复并使用原兼容执行入口。
- 媒体节点选择与 resize handles 回读通过。
- 最终自动化测试：79/79；TypeScript、生产构建、真实扩展重载通过。

当前无 P0、P1、P2 差异。final result: passed

## 2026-08-26 Native 入口原版 UI 对照

- 视觉目标：用户提供的原版 Pixel Flow 截图，重点对照单条 60px 左侧图标栏、PF 品牌入口、全高管理工作区和底部居中画布工具栏。
- 最新实现截图：`artifacts/pixel-flow-interaction-audit/16-native-sidebar-parity.png`，真实扩展视口 `1454×715`。
- 左侧导航：已从“画布工具栏＋词/产/参/模文字栏”两条侧栏恢复为一条 60px 全高图标栏；顺序为 PF、提示词、产品素材、参考图、生图模板，底部为 API 设置和节省内存。
- 画布：品牌顶栏隐藏，画布从 `x=60` 开始铺满视口；创建工具栏恢复为底部水平居中。
- 管理页：调用侧点击“前往库管理”会先卸载调用侧，再打开全宽管理工作区；真实 DOM 回读 `callPanel=0`、`management=1`、无项目画廊叠层。
- 功能保持：PF 进入画布管理，图标打开对应调用侧，模板/管理兼容入口、API 设置与节省内存均保留。
- 最终自动化测试：77/77 通过；正式扩展已重载。

当前无 P0、P1、P2 视觉或主流程问题。P3：Phosphor 线性图标与原版旧 SVG 的具体笔画存在轻微差异，但图标语义、尺寸、位置与交互一致，不阻塞交付。

## 2026-08-25 交互分层复验

- 画布外：提示词、产品素材、参考图和生图模板均使用完整管理工作区；新增、编辑/重命名、删除、导入和存储入口保留，调用动作不出现。
- 画布内：四类库均使用 360px 轻量调用侧栏；只提供搜索、选择、应用、追加、拖入或使用模板，删除与新增入口不出现。
- “前往库管理”能从画布内调用侧栏进入对应管理页；“返回画布列表”能返回项目空间。
- 真实证据：`artifacts/pixel-flow-interaction-audit/14-outside-management-final.png`、`artifacts/pixel-flow-interaction-audit/15-inside-library-usage.png`。
- 最终自动化测试：32/32 通过。

## 对照证据

- 参考：`artifacts/pixel-flow-interaction-audit/10-lovart-reference.png`
- 实现：`artifacts/pixel-flow-interaction-audit/11-pixel-flow-final.png`
- 并排对照：`artifacts/pixel-flow-interaction-audit/12-side-by-side-comparison.png`
- 对照视口：参考 `1454×716`；实现 `1454×723`；设备像素比一致。

## 最终检查

- 字体与层级：标题、项目名、更新时间的层级与参考一致；Pixel Flow 保留自己的品牌字重。
- 间距与布局：固定 60px 图标栏、四列卡片、16:9 预览和行列间距均与参考同类；画布页没有覆盖无限画布。
- 颜色：沿用 Pixel Flow 紫色主色，页面背景、空卡、描边和危险状态语义清晰。
- 图片质量：项目卡使用真实画布图片生成四宫格预览，不使用占位图片替代已有素材。
- 文案：使用“画布 / 新建画布 / 导入画布 / 存储当前画布”，符合 Pixel Flow 的产品语境。
- 交互：打开画布、切换资产库、新建、重命名、删除、导入、API 设置和节省内存均有真实页面验证；存储能力通过构建测试与既有真实下载反馈验证。

## 迭代记录

1. 首轮发现画布管理仍只是窄侧栏，下拉选择不符合参考的信息架构。
2. 改为覆盖主工作区的项目卡片页，并使用真实节点素材生成卡片预览。
3. 完整链路测试发现浏览器原生 `prompt/confirm` 会打断连续操作。
4. 替换为 Pixel Flow 自有非阻塞弹窗，再次验证重命名与删除闭环通过。

当前无 P0、P1、P2 视觉或主流程问题。剩余 P3：小屏断点只做了代码级响应式检查，未在本轮做手机尺寸真实操作；该工具的主要场景为桌面扩展，不阻塞交付。
