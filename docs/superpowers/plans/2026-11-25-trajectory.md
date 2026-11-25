# 对话轨迹（Trajectory）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在聊天页新增「轨迹」视图：轮次/步骤账本 + 固定宽度轨迹带 + 记录检查器，支持分页、虚拟滚动、流式跟随、折叠与搜索。

**Architecture:** 先给 `blocks` 补时间/消息归属并让 `useChatSession` 维护 `steps`；再用纯函数把消息、步骤和流式尾部投影成轨迹记录；`useTrajectory` 负责 cursor 分页快照；`TrajectoryView` 负责账本、轨迹带、虚拟列表与检查器。

**Tech Stack:** React 19、antd 6、Tailwind CSS v4、`@tanstack/react-virtual`、bun 自检脚本。

**Spec:** `docs/superpowers/specs/2026-11-25-trajectory-design.md`

## Global Constraints

- **不要执行 `git commit` / `git push`**：所有改动留在工作区，等用户明确要求再提交（用户明确要求）。
- 不改服务端；聊天视图的 200 条上限保持不变；轨迹使用独立 cursor 分页快照。
- 只新增一个依赖：`@tanstack/react-virtual`（用于长历史虚拟滚动）。
- 注释与 UI 文案用中文；Prettier（单引号、100 列、ES5 trailing comma）；表单/弹窗用 antd。
- 自检脚本放在 `apps/web/scripts/`，用 `bun` 直接运行，不进入 tsconfig `include`。
- 轨迹带固定 6px × 8px、块间 2px、按顺序排列，最多 3 行；不做时间比例、缩放、平移或区间过滤。
- `message.list` 的 cursor 语义：`order: 'desc'` 时 `cursor.next` 指向更早一页；每页最多 200 条。

## Review Focus

- **实时尾部去重**：实时 block 的 `messageID` 与服务端消息不一致时不能重复出记录；`useTrajectory` 先用消息快照，实时数据只补缺失步骤。
- **分页合并与前插锚定**：更早页前插后不能重复记录、顺序不能乱，滚动位置不能跳变。
- **regenerate / revert**：`revision` 变化时必须丢弃旧快照和游标，旧回答从轨迹消失。
- **虚拟列表 + 跟随尾部**：动态行高、折叠/搜索改变行集合、前插、流式追加四种情况同时存在时，滚动和选中不能错位。
- **消息类型兜底**：`idle`/切换类消息不显示，未知类型落到 system；附件原始 JSON 不把 base64 带进检查器。

---

### Task 1: 数据前置（Block meta、steps、revision）

**Files:**

- Modify: `apps/web/src/core/lib/blocks.ts`
- Modify: `apps/web/src/core/hooks/useChatSession.ts`
- Create: `apps/web/scripts/blocks.check.ts`
- Modify: `apps/web/package.json`（加 `check:blocks`）

**Interfaces:**

- Produces:
  - `type BlockMeta = { at?: number; end?: number; messageID?: string }`，每个 `Block` 变体带 `meta?: BlockMeta`。
  - `type StepInfo = { messageID: string; agent?: string; model?: string; started?: number; firstToken?: number; streamed?: number; ended?: number; finish?: string; tokens?: TokenUsageInfo; cost?: number; error?: string; interrupted?: boolean }`。
  - `stepsFromMessages(messages: SessionMessageInfo[]): Record<string, StepInfo>`。
  - `useChatSession` 返回值新增 `steps: Record<string, StepInfo>` 与 `revision: number`。

- [ ] **Step 1: 写自检脚本（先失败）**

`apps/web/scripts/blocks.check.ts` 用 `node:assert/strict`，fixture 包含一条 user、一条 assistant（text + reasoning + tool，带 time/tokens/cost）和一条 compaction。断言：

- `blocksFromMessages(...)` 的 user/text/reasoning/tool 都带 `meta`，tool 的 `at/end` 来自 `part.time`。
- `stepsFromMessages(...)` 返回 assistant 的 `started/firstToken/streamed/ended/tokens/cost/model/agent`。
- compaction 不产生 step。

- [ ] **Step 2: 运行确认失败**

```bash
cd apps/web && bun scripts/blocks.check.ts
```

Expected: `stepsFromMessages` 未定义。

- [ ] **Step 3: 实现 blocks.ts**

- 每个 Block 变体加 `meta?: BlockMeta`。
- `blocksFromMessages`：user 用 `time.created`；assistant 建 `shared = { messageID, at: time.created, end: time.completed ?? time.streamed }`，text 用 shared，reasoning 用 `part.time`，tool 用 `part.time.created/completed`。
- 新增 `stepsFromMessages`，按 assistant 消息填 step。

- [ ] **Step 4: 运行自检**

```bash
cd apps/web && bun scripts/blocks.check.ts
```

Expected: `blocks check: ok`。

- [ ] **Step 5: 扩展 useChatSession**

- 状态：`steps`、`revision`；`patchStep(messageID, update)`。
- 事件：
  - `session.step.started` → `agent/model/started`；`first-token` → `firstToken: event.created`；`streamed` → `streamed`；`ended` → `ended/finish/tokens/cost`；`failed` → `ended/finish:'error'/tokens/cost/error`。
  - `session.execution.interrupted` 时，把所有没有 `ended` 的 step 标记 `interrupted: true`。
  - text/reasoning/tool 事件补 `meta`（`at`/`end`/`messageID`），reasoning 增加 `ended` 分支。
- `reload` 用 `stepsFromMessages` 替换 steps；`openSession` 清空 steps；`regenerate` 时 `setRevision(v => v + 1)`。
- 返回值加 `steps`、`revision`。

- [ ] **Step 6: 类型检查**

```bash
npx tsc -p apps/web/tsconfig.json
```

Expected: 无输出。

- [ ] **Step 7: 记录完成（不提交）**

在最终回复里说明 Task 1 完成及验证命令；不要执行 git commit。

---

### Task 2: 投影与分页（trajectory.ts、useTrajectory）

**Files:**

- Create: `apps/web/src/core/lib/trajectory.ts`
- Create: `apps/web/src/core/hooks/useTrajectory.ts`
- Create: `apps/web/scripts/trajectory.check.ts`
- Modify: `apps/web/package.json`（加 `check:trajectory`）

**Interfaces:**

- Consumes: Task 1 的 `Block`（含 meta）、`StepInfo`、`stepsFromMessages`。
- Produces:
  - `mergeMessagePages(current: SessionMessageInfo[], incoming: SessionMessageInfo[]): SessionMessageInfo[]`：按 `id` 去重、按 `time.created` 升序稳定排序。
  - `buildTrajectory(input: { messages: SessionMessageInfo[]; steps: Record<string, StepInfo>; liveBlocks: Block[]; }): Trajectory`，类型与 spec 一致（`TrajectoryRecord` 去掉 `blockID`）。
  - `useTrajectory(input: { client: Client; sessionID: string | null; blocks: Block[]; steps: Record<string, StepInfo>; busy: boolean; revision: number; }): { trajectory: Trajectory; ready: boolean; hasMore: boolean; loadingOlder: boolean; loadOlder(): Promise<void>; messages: SessionMessageInfo[] }`。

- [ ] **Step 1: 写自检脚本（先失败）**

`apps/web/scripts/trajectory.check.ts` 覆盖：

- 两条 user 消息 + 两个 assistant step：轮次数、step 数、请求序号 1/2、累计 tokens/cost。
- text/reasoning/tool/compaction/system/idle 的记录类型与顺序；idle 不出现、未知类型落 system。
- live block（messageID 不在 messages）追加为 running 记录；已有 messageID 的 live block 不重复。
- `mergeMessagePages` 去重、排序、前插更早页。
- interrupted/error 状态。

- [ ] **Step 2: 运行确认失败**

```bash
cd apps/web && bun scripts/trajectory.check.ts
```

Expected: 模块不存在。

- [ ] **Step 3: 实现 trajectory.ts**

按 spec 的投影规则实现：消息遍历、轮次开启、step 与子记录、compaction/system、请求序号与累计量、实时尾部合并、状态映射（finish/error/interrupted/ended）、附件摘要与 `formatBytes`。所有逻辑保持纯函数。

- [ ] **Step 4: 实现 useTrajectory**

- `sessionID`/`revision` 变化：清空并 `message.list({ order:'desc', limit:200 })` 拉最新页，反转保存，`cursor = response.cursor?.next ?? null`。
- `loadOlder`：有 cursor 且不在加载时，用同一 order 取下一页，反转后 `mergeMessagePages`。
- `trajectory = useMemo(buildTrajectory({ messages, steps, liveBlocks: blocks }), ...)`。
- `sessionID` 为空时不请求。

- [ ] **Step 5: 运行自检 + 类型检查**

```bash
cd apps/web && bun scripts/trajectory.check.ts
npx tsc -p apps/web/tsconfig.json
```

Expected: `trajectory check: ok`，tsc 无输出。

- [ ] **Step 6: 记录完成（不提交）**

---

### Task 3: 轨迹视图（轨迹带、账本、检查器）

**Files:**

- Modify: `apps/web/package.json`（新增 `@tanstack/react-virtual`）
- Create: `apps/web/src/core/components/TrajectoryBand.tsx`
- Create: `apps/web/src/core/components/TrajectoryInspector.tsx`
- Create: `apps/web/src/core/components/JsonBlock.tsx`
- Create: `apps/web/src/core/components/TrajectoryView.tsx`

**Interfaces:**

- Consumes: Task 2 的 `useTrajectory`、`TrajectoryRecord`、`TrajectoryTurn`；现有 `Markdown`。
- Produces:
  - `TrajectoryView({ client, sessionID, blocks, steps, busy, revision })`。
  - `TrajectoryBand({ records, selectedId, onSelect })`：固定 6×8px 色块、2px 间隔、顺序排列、最多 3 行 + 「更早 N 条」。
  - `TrajectoryInspector({ record, onClose })`。

- [ ] **Step 1: 安装虚拟滚动依赖**

```bash
cd apps/web && bun add @tanstack/react-virtual
```

Expected: `apps/web/package.json` 出现该依赖，根 `bun.lock` 更新。

- [ ] **Step 2: 实现 JsonBlock**

`JsonBlock({ value, maxHeight? })`：递归渲染对象/数组，对象可折叠；字符串超过 12 行截断并可展开；`data:` 开头的字符串替换成 `<data URI 已省略>`。

- [ ] **Step 3: 实现 TrajectoryBand**

- 色块顺序 = `records` 顺序；宽度/高度/间隔固定；超过 3 行时初始只渲染最近 N 块，左侧显示「更早 N 条」按钮，点击展开全部（展开后仍用虚拟窗口限制数量）。
- 颜色映射：user 灰、step 品牌蓝、text 天蓝、reasoning 紫、tool 成功绿/失败红/运行中琥珀、compaction/system 中性灰。
- `Tooltip` 显示种类、标题、开始时刻、耗时；step 加 TTFT 与 tokens；点击回调 `onSelect(record)`。

- [ ] **Step 4: 实现 TrajectoryInspector**

- Drawer（`size={480}`）展示：状态、耗时、开始/结束、模型、Agent、TTFT、tokens、成本、结束原因、重试。
- 回复/思考用 `Markdown`；工具分「输入 / 输出」两段，用 `JsonBlock` + `<pre>`；复制用 `navigator.clipboard`。
- 用户记录显示附件名称/大小/类型（`formatBytes`）；「原始」区展示脱敏后的 JSON。

- [ ] **Step 5: 实现 TrajectoryView**

- 调用 `useTrajectory`；顶部工具栏：搜索框、折叠全部/展开全部、概览/详细切换、统计（轮/步/工具）。
- 轨迹带固定在工具栏下方；账本用 `useVirtualizer`：
  - 行集合 = 轮次头 + 记录 + 首行「加载更早记录」；折叠与搜索在行集合上计算。
  - 动态行高：`estimateSize` 按行类型给初值，`measureElement` 实测。
  - 跟随尾部：记录数变化时若 `stick` 则滚到底；向上滚动 >80px 暂停并显示「回到最新」。
  - 前插锚定：`loadOlder` 前后记录 `scrollHeight`，差值修正 `scrollTop`。
- 搜索：大小写不敏感，匹配标题/预览/tool 名称/状态；命中时自动展开祖先（轮次/step）。
- 点击账本行或轨迹带色块：选中并在检查器打开；点击色块同时把账本滚动到该行。
- 概览/详细：详细模式在 step 行显示 TTFT/tokens/成本/精确时刻；概览只显示模型/耗时/状态。

- [ ] **Step 6: 类型检查与构建**

```bash
npx tsc -p apps/web/tsconfig.json
cd apps/web && bun run build
```

Expected: 无错误、构建成功。

- [ ] **Step 7: 视觉自检（临时 harness，完成即删）**

在 `apps/web/src/web/` 建临时 `harness.html` + `harness.tsx`，用 fixture 数据和 `ConfigProvider theme={darkTheme}` 渲染 `TrajectoryView`；用浏览器检查：轨迹带换行/「更早」、概览/详细、折叠、搜索、检查器输入输出、虚拟滚动。检查后删除 harness 文件。

- [ ] **Step 8: 记录完成（不提交）**

---

### Task 4: 接入聊天页

**Files:**

- Modify: `apps/web/src/web/Chat.tsx`

**Interfaces:**

- Consumes: Task 1 的 `steps`/`revision`；Task 3 的 `TrajectoryView`。
- Produces: header 的「对话 / 轨迹」切换；轨迹占主区域。

- [ ] **Step 1: 接入**

- 从 `useChatSession` 解构 `steps`、`revision`。
- header 增加 `Segmented`（对话/轨迹），位置在保存技能按钮之前。
- `main` 依据视图切换 `Messages` / `TrajectoryView`；轨迹模式 `max-w-[1100px]`。
- `TrajectoryView` 传入 `client`、`sessionID`、`blocks`、`steps`、`busy`、`revision`。
- 切换回对话不重置聊天状态；轨迹组件卸载后再次进入会重新拉第一页（可接受，写入 Known limits）。

- [ ] **Step 2: 验证**

```bash
npx tsc -p apps/web/tsconfig.json
cd apps/web && bun run build
```

Expected: 通过。

- [ ] **Step 3: 手工验证**

- 连接一个真实 opencode 服务，运行一轮带工具的任务：
  - 轨迹流式追加、running 不虚构耗时；结束后 tokens/cost 与服务端一致。
  - 切换回对话再切轨迹，数据正常。
  - regenerate 一次，旧回答从轨迹消失。

- [ ] **Step 4: 记录完成（不提交）**

---

### Task 5: 文档与全量回归

**Files:**

- Modify: `README.md`、`CLAUDE.md`

- [ ] **Step 1: 文档**

README 功能列表加「对话轨迹」；CLAUDE 的 Architecture 补 `trajectory.ts` / `useTrajectory` / `TrajectoryView` 的分工，Known limits 补“轨迹仅覆盖已加载页面、固定宽度轨迹带不表达时间间隔、切回对话后重新拉第一页”。

- [ ] **Step 2: 全量验证**

```bash
npx tsc -p apps/web/tsconfig.json
npx tsc -p apps/desktop/tsconfig.json
npx tsc --noEmit -p apps/mobile/tsconfig.json
cd apps/web && bun run check:blocks && bun run check:trajectory && bun run build
bun run format:check
```

Expected: 全部通过。

- [ ] **Step 3: 记录完成（不提交）**

---

## 交付说明

- 所有改动保留在工作区；按用户要求不执行任何 `git commit` / `git push`。
- 若中途发现 spec 与代码冲突，以 spec 为准并在最终回复中说明取舍。
