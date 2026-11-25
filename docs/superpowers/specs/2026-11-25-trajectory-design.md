# 对话轨迹（Trajectory）设计

日期：2026-11-25
状态：待确认
参考：deepseek-harness `packages/client/ui-trajectory`

## 目标

在聊天页提供与 deepseek-harness Trajectory 对齐的「对话轨迹」视图：按轮次和步骤组织的事件账本 + 固定宽度的轨迹带 + 记录检查器，支持长历史分页、虚拟滚动、流式跟随、折叠与搜索。用于观察 agent 每一步在做什么、耗时多久、消耗多少 token、输入输出是什么。

## 与 deepseek-harness 的对齐项

| 能力               | 本设计                                                                                                                                                                                                                                             |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 轮次账本           | 按用户消息分轮，轮内按 assistant step 分组，展示用户 / 助手 / 思考 / 工具 / 压缩 / 系统记录                                                                                                                                                        |
| 记录检查器         | 耗时、TTFT、token、成本、模型、Agent、结束原因、重试信息、输入、输出、附件摘要、原始 JSON；支持复制                                                                                                                                                |
| 轨迹带             | 固定在账本上方，分「输入 / 模型 / 工具」三条上下泳道；每条记录一个固定 18×14px 圆角长方形色块，泳道内按顺序排列并在超出时横向滚动；悬停显示精确时刻、耗时与 TTFT；点击选中并定位到账本记录（与 deepseek 的时间比例概览不同，见“与参考实现的差异”） |
| 流式跟随           | 默认停在尾部；向上滚动暂停跟随；进行中记录只显示开始标记，不虚构耗时；出现「回到最新」                                                                                                                                                             |
| 长历史             | 打开定位尾部；首行按需加载更早一页；只渲染可见行（虚拟滚动）；稳定行键                                                                                                                                                                             |
| 折叠与搜索         | 可分别折叠轮次、步骤、工具；搜索覆盖已加载的全部记录（含折叠项），命中项自动展开祖先                                                                                                                                                               |
| 请求编号与累计用量 | 每次 assistant step 显示模型调用序号；已加载快照内累计 token / 成本                                                                                                                                                                                |
| 布局               | 主区域切换「对话 / 轨迹」；输入框保留；滚动区域预留输入框高度                                                                                                                                                                                      |

## 非目标

- 不改服务端、不新增接口；只消费现有 `message.list`（含 cursor）、`step.*` 事件与消息字段。
- 不写入会话、不回放/重放、不编辑记录。
- 不实现图片灯箱与跨会话图片缓存；v1 只展示附件/文件名称、大小、类型和数量。
- 不实现嵌套子工具（lane-agent 的工具结果没有深层 subcall 结构）；折叠粒度到 step 下的单条工具/思考/回复记录。
- 搜索和折叠状态不持久化，不跨会话保留。
- 聊天视图的 200 条上限保持不变；轨迹视图有独立的分页快照。

## 数据来源

- `SessionMessageInfo`：
  - user：`time.created`、`text`、`files`（附件）、`skills`。
  - assistant：`time.created/firstToken/streamed/completed`、`tokens`、`cost`、`model`、`agent`、`finish`、`retry`、`error`；内容块 `text` / `reasoning`（带 `time`）/ `tool`（`time.created/ran/completed`、`state.input`、`state.content`、`state.status`）。
  - compaction / system / synthetic / skill / shell 等：按类型显示为独立记录或轮内系统记录。
- `session.step.started / first-token / streamed / ended / failed` 事件：流式期间的 step 模型、Agent、开始、TTFT、结束、token、成本。
- `message.list({ sessionID, order: 'desc', limit: 200, cursor })`：返回 `cursor.next` 用于加载更早页面；轨迹视图自己维护分页快照，不改变聊天的 `blocks`。
- `session.context({ sessionID })`：当前一次模型调用实际带上的消息上下文；打开轨迹和执行结束时拉取，空会话返回空数组。
- 聊天现有的 `blocks`：仅用于当前尚未持久化的流式尾部；与已加载消息按消息 ID 去重。

### 数据前置改动

当前 `blocks` 不带消息归属和时间，`useChatSession` 也没有 `steps`。轨迹需要的两处输入必须先补上：

- `blocks.ts`：每个 block 增加 `meta?: { at?: number; end?: number; messageID?: string }`；`blocksFromMessages` 从消息/内容块时间填充；新增 `StepInfo` 与 `stepsFromMessages(messages)`。
- `useChatSession`：维护 `steps: Record<string, StepInfo>`，监听 `session.step.started / first-token / streamed / ended / failed`；`session.text.started/delta/ended`、`session.reasoning.started/delta/ended`、`session.tool.input.started/success/failed` 补 `meta`；每轮结束 `reload` 用服务端真值替换 `steps`；把 `steps` 加入返回值。
- `useChatSession` 同时暴露 `revision: number`：`regenerate`、`revert` 相关操作或由此触发的重载时自增，供轨迹视图丢弃旧快照。

如果评审更希望轨迹与聊天解耦，也可以让 `useTrajectory` 自己订阅事件；但会与 `useChatSession` 重复订阅同一 SSE 流，默认不采用。

## 架构

### 1. 轨迹快照（`apps/web/src/core/hooks/useTrajectory.ts`）

独立 hook，输入 `client`、`sessionID`、实时 `blocks`、实时 `steps`、`busy`：

状态：

- `messages: SessionMessageInfo[]`：按时间升序的已加载快照，初始为最近 200 条。
- `cursor: string | null`：更早一页的游标（`order: 'desc'` 的 `cursor.next`）。
- `hasMore`、`loadingOlder`、`ready`。
- 会话切换时全部重置。
- `revision` 变化（regenerate / revert 后）时丢弃已加载快照和游标，重新从最新一页开始；旧回答不再出现在轨迹里，与聊天保持一致。

行为：

- `loadInitial()`：`message.list({ order: 'desc', limit: 200 })` 反转后保存，记录游标；打开视图时定位尾部。
- `loadOlder()`：用游标再取一页，反转后前插，按消息 ID 去重。
- 每轮执行结束（`execution.*` 已由 `useChatSession` 触发 `reload`）：重新拉取最新一页并与已加载的更早页面合并，去重后按时间排序。
- 只在 `sessionID` 变化或执行结束时刷新；加载更早页面不触发聊天消息重载。

### 2. 投影（`apps/web/src/core/lib/trajectory.ts`，纯函数）

输入：`messages`、`steps`、实时 `blocks`、`busy`。输出：

```ts
type Trajectory = {
  turns: TrajectoryTurn[];
  records: TrajectoryRecord[]; // 扁平化，供轨迹带/搜索/虚拟列表使用
  hasLiveTail: boolean;
};

type TrajectoryTurn = {
  id: string;
  index: number; // 轮次序号
  preview: string;
  at?: number;
  end?: number;
  records: TrajectoryRecord[];
};

type TrajectoryRecord = {
  id: string;
  kind: 'user' | 'step' | 'text' | 'reasoning' | 'tool' | 'compaction' | 'system';
  title: string;
  preview: string;
  status: 'ok' | 'running' | 'error' | 'interrupted';
  turn: number;
  requestIndex?: number; // 第几次 assistant step
  at?: number;
  end?: number;
  duration?: number;
  ttft?: number;
  model?: string;
  agent?: string;
  finish?: string;
  tokens?: TokenUsageInfo;
  cost?: number;
  cumulative?: { tokens: TokenUsageInfo; cost: number };
  input?: unknown;
  output?: string; // 工具的 content 文本
  text?: string; // 回复/思考正文
  attachments?: AttachmentSummary[];
  retry?: { attempt: number; error: string };
  live?: boolean; // 尚未被服务端持久化的流式尾部
};
```

规则：

- 每条 user 消息开启新一轮；assistant 消息生成一个 step 记录（携带模型、Agent、tokens、cost、TTFT、结束原因）并按内容顺序生成子记录（text / reasoning / tool）。
- compaction 作为独立记录按时间顺序放在「轮次之间」；system/synthetic/skill/shell 等按类型显示为系统记录；`idle` 与纯切换类消息不展示。
- 输入上下文：`session.context` 返回的消息生成一条独立的 `context` 记录，放在轨迹末尾的「输入上下文」分组里；检查器用脱敏 JSON 展示完整上下文。未知类型统一落到 `system` 并显示原始 `type` 文本，避免因新增消息类型丢记录。
- 模型调用序号从 1 递增；累计用量只统计已加载快照内的 step。
- 时间：step 用 `time.created → time.completed`；reasoning 用自身 `time`；tool 用 `time.created → time.completed`；text 使用 step 区间。缺少 completed 的记录为 `running`。TTFT = `firstToken - created`；解码段结束用 `time.streamed`（`completed` 可能更晚，包含收尾）。
- 流式尾部：取 `blocks` 中 `messageID` 不在已加载消息里的记录，追加到最后一轮之后；`live: true`，状态 running，不计算未结束的耗时；`step.*` 事件提供模型/token 时一并显示。实时 block 的 id 与服务端消息重载后的 id 不同，不能作为跨视图定位键；只用于 React 行键。
- 去重：同一 `messageID` 以服务端消息为准，实时 block 只补充缺失的步骤；`mergeMessagePages` 与实时尾部合并都实现为纯函数，便于自检。
- interrupted：`execution.interrupted`、消息 `finish` 或中断回退记录标记为 interrupted。
- 附件：`files` 的大小按字节格式化（B/KB/MB），保留类型与名称；「原始」视图剥掉 `data:` base64 内容，只保留元数据，避免 JSON 巨大。

### 3. 视图（`apps/web/src/core/components/TrajectoryView.tsx`）

- 主区域切换：Chat header 增加「对话 / 轨迹」Segmented；轨迹视图（含输入区）占满整个页面宽度，不受聊天 900px 限制。Chat 外层已经是 `grid-rows-[auto_1fr_auto]`，输入框在 footer 固定，不需要额外预留高度。
- 工具栏：折叠全部轮次 / 步骤 / 工具；搜索框（覆盖已加载快照，含折叠内容，命中自动展开祖先）；概览/详细切换（默认概览，详细模式在行内显示 TTFT/token/成本/精确时刻）。
- 账本：
  - 轮次头：轮次序号、时间、用户提问预览。
  - step 头：模型调用序号、模型、耗时、状态、TTFT（详细模式）、tokens/成本（详细模式）、累计用量。
  - 子记录：思考、回复、工具；工具显示名称、状态、耗时、输出预览。
  - 折叠：轮次/step/子记录可独立展开收起；折叠状态仅内存。
- 轨迹带：
  - 上下三条泳道：**输入**（用户消息、输入上下文）、**模型**（助手步骤、回复、思考、上下文压缩）、**工具**（工具调用、系统操作）。
  - 三条泳道共享同一条记录顺序轴：每一列是一个全局记录，某一层没有对应记录时留空；横向读即先后顺序。每条记录一个 18×14px 的圆角长方形色块，列间距 4px，不按时间间隔留白，也不按耗时拉伸宽度。
  - 泳道超出容器宽度时横向滚动，默认停在新记录一侧；滚动条隐藏。点击色块选中记录，并滚动账本到对应行。
  - 颜色：输入灰、step 品牌蓝、回复天蓝、思考紫、上下文压缩中性灰、工具成功绿 / 失败红 / 运行中琥珀。
  - 悬停 500ms 显示种类、标题、开始时刻、耗时；step 额外显示 TTFT 与 token。轨迹带 `shrink-0`，窗口高度不足时不会被 flex 压扁裁切。
  - 流式时新记录追加到对应泳道尾部并滚到最新；不做滚轮缩放、拖选时间区间或右键平移。
- 虚拟列表：
  - 行 = 轮次头 + 记录；使用固定行高近似 + 动态测量（或引入 `@tanstack/react-virtual`，见“实现取舍”）。
  - 初始只挂载从尾部向前约 50 行及少量 overscan；向上滚动自动扩展窗口；更早页面通过首行「加载更早记录」按钮触发。
  - 前插更早页面时按插入高度修正 `scrollTop`，保持当前可见行不跳变；行键稳定（消息/记录 ID），折叠/选中状态不因前插丢失。
- 跟随尾部：记录数量变化时，若用户距底部 < 80px 则滚到底部；否则暂停并显示「回到最新」。
- 检查器：右侧浮层详情（绝对定位覆盖账本右缘，lg 420px），不挤压轨迹带和账本列宽；窄屏时覆盖整个账本，轨迹带仍保留在顶部；带关闭按钮，不使用 Drawer：
  - 概览：状态、耗时、开始/结束、模型、Agent、TTFT、tokens、成本、结束原因、重试次数/错误。
  - 内容：回复/思考用 Markdown 渲染；工具分「输入 / 输出」两段，JSON 可展开/折叠，文本保留原样；提供复制。
  - 附件：用户消息显示文件/图片的数量、名称、大小、类型；不做灯箱。
  - 原始：显示该记录的 JSON（只读，可复制）。

## 实现取舍（builder 决定）

- **虚拟滚动**：优先引入 `@tanstack/react-virtual`（体积小、维护活跃、支持动态行高）。若评审认为不应新增依赖，则实现固定高度分档 + `content-visibility` 的轻量窗口；但长历史性能以虚拟化为准。
- **检查器形态**：右侧浮层（lg 420px，覆盖账本），不重排轨迹带和账本；窄屏覆盖账本；不使用 Drawer。
- **轨迹带数据量**：色块固定宽度，三条泳道各自横向滚动；不设人为截断，不做时间比例抽稀。
- **实时用量**：优先取 `step.*` 事件；执行结束后以 `message.list` 真值覆盖，避免客户端估算。

## 与参考实现的差异

- deepseek-harness 的时间概览按真实开始/耗时投影宽度，并支持缩放、平移和拖选区间；本实现按需求改为**固定像素宽度、按输入/模型/工具分层的顺序轨迹带**，不表达时间比例，交互降为悬停详情和点击定位。
- lane-agent 的消息里没有嵌套子工具结构，折叠粒度到 step 下的单条记录。
- 没有共享图片缓存/灯箱，附件只展示摘要。
- 输入上下文只是当前快照，不能回看每次历史模型调用各自的上下文；服务端接口不提供历史切片。

## 已知限制

- 轨迹视图只覆盖通过 cursor 加载过的消息；未加载的页面在点「加载更早记录」前不参与搜索、轨迹带和累计用量。
- 轨迹带是固定宽度、按输入/模型/工具分层、泳道内顺序排列的状态带，不表达记录之间的时间间隔，也没有缩放/区间过滤；耗时请看悬停、账本和检查器。
- 聊天视图仍只显示最近 200 条；两边的滚动/分页互不影响。
- 图片灯箱、跨会话图片缓存、嵌套子工具、跨会话/跨轮区间对比不在本期。
- 触屏只保证点击色块/记录选中；悬停详情在触屏上通过点击打开检查器代替。

## 验收标准

1. `apps/web/scripts/trajectory.check.ts`（`bun run check:trajectory`）覆盖：
   - 轮次/step 分组、模型调用序号、累计用量；
   - user/assistant/reasoning/tool/compaction 记录与时间；
   - live tail 合并与按消息 ID 去重；
   - interrupted/error 状态；
   - 分页合并去重与排序（`mergeMessagePages`）。
2. 三端 `tsc`、web `vite build`、Prettier 通过。
3. 手工验证：
   - 真实会话中流式运行：轨迹跟随尾部，running 记录不虚构耗时；结束后 token/成本/耗时与服务端一致。
   - 加载更早页面后，搜索、轨迹带、累计用量覆盖新增记录；前插后滚动位置不跳变。
   - 轨迹带按输入/模型/工具三层展示；悬停显示时刻/耗时；点击色块选中并定位到账本；泳道超出时可横向滚动到最新。
   - 折叠全部后搜索命中自动展开；切换会话后状态重置。
   - regenerate 一次：旧回答从轨迹消失，新回答出现，累计用量以新快照为准。
   - 运行一轮后轨迹末尾出现「输入上下文」，展开能看到实际发送的消息列表。
