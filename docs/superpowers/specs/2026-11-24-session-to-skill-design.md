# 会话存为 Skill 设计

日期：2026-11-24
状态：待确认

## 目标

在桌面端聊天页，把刚刚跑完的一次 agent-desktop 操作提取成可编辑的 `SKILL.md` 草稿，保存到 OpenCode 全局 skills 目录（默认 `~/.config/opencode/skills/<name>/SKILL.md`），刷新技能列表后即可复用。

## 非目标

- 不自动触发；由用户在会话结束后手动点「存为技能」。
- 不调用模型改写；第一版用确定性提取 + 可编辑弹窗，模型润色留作后续。
- 不自动重启 opencode 服务。
- **不覆盖受管 skill**：名称为 `agent-desktop`，或目标目录里已有 `.installed` 标记（lane-agent 安装的 skill），一律拒绝保存并在弹窗里说明。
- 浏览器版不提供保存（写不到本机 skills 目录），按钮不出现。

## 触发条件

- 当前会话的 `Block[]` 里至少有一条**已完成**（`ok` 或 `error`）的工具调用，且它的 `command` 或工具名包含 `agent-desktop`。
- 仅在 `window.appBridge` 存在（Electron）时显示入口。

## 交互

聊天页 header（`PhoneConnect` 旁边）新增一个图标按钮「存为技能」：

- 不满足触发条件时按钮禁用，tooltip 说明“本次会话还没有 agent-desktop 操作”。
- 点击打开 `SaveSkillModal`（antd Modal）：
  - 名称：kebab-case，默认从命令里的 `--app` 或首条用户提问生成；中文或空值回退成 `desktop-task-YYYYMMDD`，前端用 `^[a-z0-9][a-z0-9-]{0,63}$` 校验。
  - 描述（`description`）：默认取首条用户提问，提示里写明“这段决定 agent 何时加载该 skill，写清触发词”。
  - 正文：等宽 `TextArea`，放入生成好的 `SKILL.md` 草稿，可直接改。
- 保存成功：消息提示路径，调用 `refreshSkills()` 刷新技能选择器；如果新技能没有出现在 `client.skill.list()` 里，调用一次 `client.location.reload()` 后重试，仍失败才提示重启 `opencode serve`。不关闭会话。
- 打开弹窗时先调 `appBridge.skillsInfo()` 取安装路径用于生成命令；调用失败就退回 `agent-desktop`。
- 已存在同名 skill：弹出二次确认，确认后覆盖（仅覆盖该目录下的 `SKILL.md`）。
- 保存被拒绝时（受管 skill、非法名称、软链接）在弹窗里显示具体原因，不静默失败。

## 提取逻辑（`apps/web/src/core/lib/skillDraft.ts`）

输入为当前 `Block[]`，输出：

```ts
type SkillDraft = {
  name: string;
  description: string;
  body: string;
  steps: number;
  warnings: string[];
};
```

步骤：

1. **筛步骤**：遍历 `kind === 'tool'` 且 `status !== 'running'` 的 block。命令只从 `input.command` 取（完成态的 `detail` 是**输出**，不是命令），只保留命令里包含 `agent-desktop` 的步骤，按出现顺序最多 50 条。输出从 `detail` 取，可能多段或非 JSON，解析失败不报错。
2. **建 ref 映射**：把每个工具输出 `detail` 尝试按 JSON 解析，递归遍历，收集带 `ref_id`（部分命令用 `ref`）以及 `role`/`name` 的节点，得到 `ref → { role, name }`。两种键都认。
3. **语义化命令**：命令里的 `@<snapshot>:e<N>`：
   - 能查到 role/name 的，改写为两步：`<agent-desktop> find --app "<app>" [--surface <surface>] --role <role> --name "<name>"` 定位，再执行原动作（ref 用 `<ref>` 占位）。
   - 查不到的，保留 `<ref>` 占位并在 `warnings` 里记一条，提示用户手动确认。
   - 纯 `snapshot` 命令改写成“先观察当前界面”，不保留 snapshot id。
   - `<agent-desktop>` 使用安装后的绝对路径：通过 `appBridge.skillsInfo()` 拿到（与内置 skill 的路径重写一致），没有安装信息时退回 `agent-desktop`。
4. **参数候选**：扫描命令中的 `--app "X"`、绝对路径、`type` 的文本、连续引号内容，列到正文的「参数」小节，格式 `- {{参数名}}：本次值 "..."`；只做提示，不自动全局替换。
5. **生成正文**：按固定模板拼装：

```markdown
# <用户填写的标题>

前置：<从命令推断的 app 名>，以及步骤 0 的初始界面状态。

## 步骤

1. …（每条命令 + 目的 + 该步的验证方式）

## 验证

<最后一条成功命令的验证方式；没有则写“重新 snapshot 确认结果”>

## 参数

- {{app}}：本次值 "Preview"
- …

## 错误处理

- `STALE_REF` / `AMBIGUOUS_TARGET`：重新 snapshot 或 find 定位，不复用旧 ref。
- 只有 `error.disposition.retry === "safe"` 才重试；其余先读取当前状态。
```

6. **失败步骤**：`status === 'error'` 的命令放进「已知坑」，并写一条 warning，提示用户确认是否要保留。

草稿只是起点；参数名和前置条件由用户在弹窗里最终确认。

## 保存（Node IPC）

新增 `apps/desktop/src/ipc/skills.ts`，两个 handler：

```ts
// 关联信息：skills 根目录 + 已安装的 agent-desktop 绝对路径（用于生成命令）
ipcMain.handle('skills:info', async () => ({ root, agentDesktopBin }));

ipcMain.handle(
  'skills:save',
  async (
    _event,
    input: { name: string; description: string; body: string; overwrite?: boolean }
  ) => {
    // 1. 校验 name：^[a-z0-9][a-z0-9-]{0,63}$（中文/空名由 UI 回退成 desktop-task-YYYYMMDD）
    // 2. root = join(homedir(), '.config', 'opencode', 'skills')；不存在先 mkdir
    // 3. 校验 name === 'agent-desktop' 或目标目录存在 .installed → 返回 { managed: true }，拒绝
    // 4. resolveWithin(root, name) 防 ../ 和目录软链接；再 lstat <name>/SKILL.md，是软链接就拒绝
    // 5. 已有 SKILL.md 且未传 overwrite → 返回 { exists: true }，由 UI 二次确认
    // 6. 写 <root>/<name>/SKILL.md；frontmatter 的 description 用 JSON.stringify 转义
    // 7. 返回 { path }
  }
);
```

接入四步：`ipc/index.ts` 注册、`preload.cts` 暴露 `window.appBridge.skillsInfo` / `saveSkill`、`core/lib/bridge.ts` 补类型。

安全约束：只写 `~/.config/opencode/skills` 之下；name 白名单字符；目录和 `SKILL.md` 两级都拒绝软链接；单次内容上限 256KB。

## UI 组件

- 新增 `apps/web/src/core/components/SaveSkillModal.tsx`。
- `Chat.tsx` header 增加按钮与模态状态；按钮是否可用由 `useChatSession` 暴露的 `blocks` 计算，不改 hook 的现有职责。
- 文案与注释用中文；表单沿用 antd 组件。

## 热加载（实测结论）

OpenCode 2.3.0 会监听 skills 目录并热加载：服务启动后新建 `~/.config/opencode/skills/<name>/SKILL.md`，`GET /api/skill` 无需重启就能看到（项目级 `.opencode/skills` 同样成立）。因此保存后不必重启服务；应用侧只需要刷新自己的技能列表。`client.location.reload()` 作为兜底，不改变会话。

## 验证方式

- 不引入测试框架/类型依赖：新增 `apps/web/scripts/skill-draft.check.ts`，用 `node:assert` 对固定 `Block[]` 断言：`ref_id` 映射生效、ref 被替换、失败步骤进「已知坑」、非 agent-desktop 工具被忽略、超过 50 步截断。脚本在 tsconfig `include` 之外，用 `bun apps/web/scripts/skill-draft.check.ts` 直接跑（加一条 `check:skill-draft` 脚本）。
- 手工验证：
  1. 用 `agent-desktop` 真实完成一次操作（例如 Preview 导出 PDF）。
  2. 点「存为技能」，改名称/参数，保存。
  3. 检查 `~/.config/opencode/skills/<name>/SKILL.md` 内容与权限。
  4. 不重启服务，确认技能出现在输入框的技能选择器里（保存后自动刷新；必要时点刷新）。
  5. 用另一个参数值再执行一次，确认 skill 不是写死的 ref。

## 风险与取舍

- 服务器返回的 tool 输出可能被截断或不是 JSON，ref 映射会退化为占位符，需要用户手工补；用 `warnings` 明确提示。
- 不同 OpenCode 版本的工具输入结构可能不同，第一版只按 `input.command` 里出现 `agent-desktop` 识别。
- 生成的命令使用本机安装的绝对路径；如果用户换机器或重装，需要在弹窗里换成新路径（`skillsInfo` 会自动带上当前路径）。
- 模型润色版本（让当前配置的模型重写草稿）需要新建临时会话、等待终态、清理会话，留作第二版。
- 测试脚本不参与 tsc（不在 include 内），依赖运行时断言；覆盖的是提取逻辑，不覆盖 IPC。
