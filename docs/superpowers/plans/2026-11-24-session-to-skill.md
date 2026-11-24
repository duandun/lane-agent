# 会话存为 Skill 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在桌面端把本次会话里的 agent-desktop 操作提取成可编辑的 `SKILL.md`，保存到 `~/.config/opencode/skills/<name>/` 并刷新技能列表。

**Architecture:** 提取逻辑是纯函数（`skillDraft.ts`），可在 Node 里用固定 fixture 自检；保存走 Electron 新增的 `skills:*` IPC；UI 用 antd Modal 编辑草稿，保存后调用现有 `refreshSkills()` 并按需 `location.reload`。

**Tech Stack:** React 19 + antd、Electron IPC、OpenCode 客户端（`client.skill.list`、`client.location.reload`）、bun 运行 TS 自检脚本。

**Spec:** `docs/superpowers/specs/2026-11-24-session-to-skill-design.md`

## Global Constraints

- 仅桌面端可用（`window.appBridge` 存在）；浏览器不显示入口。
- 不引入新依赖、不引入测试框架；自检脚本用 `node:assert`，由 bun 直接运行，不进入 tsconfig include。
- 不重启 opencode 服务；保存后刷新列表，`client.location.reload()` 只做兜底。
- 名称为 `agent-desktop` 或目录含 `.installed` 的 skill 一律拒绝保存。
- 只写 `~/.config/opencode/skills` 之下；name 用 `^[a-z0-9][a-z0-9-]{0,63}$`；目录与 `SKILL.md` 两级拒绝软链接；正文上限 256KB。
- 注释和 UI 文案用中文；Prettier（单引号、100 列、ES5 trailing comma）。
- 每个任务结束提交，提交信息末尾带：
  `Co-Authored-By: Claude Code <noreply@anthropic.com>`

## Review Focus

- **tool 数据形态**：命令只在 `input.command`，`detail` 是输出；snapshot 节点用 `ref_id`（部分用 `ref`）——自检脚本用真实形态 fixture 覆盖。
- **受管/覆盖保护**：`agent-desktop` 名称、`.installed` 标记、已存在 SKILL.md、软链接四种情况都要有明确返回，不静默覆盖。
- **热加载刷新**：保存后 `skill.list` 里应出现新 id；没有时 `location.reload` 再试一次，仍没有才提示重启。
- **YAML/名称边界**：description 含引号/换行时 frontmatter 仍合法；中文或空名称回退成 `desktop-task-YYYYMMDD`。
- **按钮可用性**：没有 agent-desktop 调用时入口禁用并给出 tooltip，不能弹出空草稿。

---

### Task 1: 草稿提取器与自检脚本

**Files:**

- Create: `apps/web/src/core/lib/skillDraft.ts`
- Create: `apps/web/scripts/skill-draft.check.ts`
- Modify: `apps/web/package.json`（加 `check:skill-draft`）

**Interfaces:**

- Consumes: `Block` from `../lib/blocks`（`{ kind: 'tool'; name; status; detail; input }`）。
- Produces:
  - `type SkillDraft = { name: string; description: string; body: string; steps: number; warnings: string[] }`
  - `hasAgentDesktopRun(blocks: Block[]): boolean`
  - `draftSkill(blocks: Block[], opts?: { name?: string; description?: string; bin?: string }): SkillDraft`

- [ ] **Step 1: 写自检脚本（先失败）**

`apps/web/scripts/skill-draft.check.ts` 用 `node:assert/strict`，fixture 至少包含：

- 一条 `input.command = 'agent-desktop snapshot --app "Preview" -i'`，`detail` 是 `{"ok":true,"data":{"nodes":[{"ref_id":"@s1:e1","role":"button","name":"导出"}]}}`
- 一条 `input.command = 'agent-desktop click @s1:e1'`
- 一条 error 状态的 `agent-desktop` 命令
- 一条与 agent-desktop 无关的 `bash` 工具
- 51 条 agent-desktop 命令的截断用例

断言：`hasAgentDesktopRun` 的 true/false；`draftSkill(...).body` 含 `find --app "Preview" --role button --name "导出"`、不含 `@s1:e1`；error 命令出现在「已知坑」；无关工具被忽略；`steps === 50`。

- [ ] **Step 2: 运行确认失败**

```bash
cd apps/web && bun scripts/skill-draft.check.ts
```

Expected: 报模块不存在。

- [ ] **Step 3: 实现 `skillDraft.ts`**

规则（与 spec 一致）：

- 只取 `kind === 'tool'`、`status !== 'running'`、`input.command` 含 `agent-desktop` 的 block，最多 50 条。
- 解析 `detail`（JSON）递归收集 `ref_id ?? ref` → `{ role, name }`。
- 命令中的 `@...:eN` 改写成两条：`<bin> find --app "<app>" [--surface <surface>] --role <role> --name "<name>"` + 原动作（ref 换成 `<ref>`）；查不到映射时用 `<ref>` 并记 warning。
- `bin` 默认 `agent-desktop`；名称从 `--app` 值 slug 化，失败回退 `desktop-task-YYYYMMDD`；description 默认取首条用户 block 文本（截断 200 字）。
- 正文模板包含「前置 / 步骤 / 验证 / 参数 / 错误处理」；失败命令进「已知坑」。
- 对超长输出只解析前 200KB。

- [ ] **Step 4: 运行自检**

```bash
cd apps/web && bun scripts/skill-draft.check.ts
```

Expected: 无输出、退出码 0。

- [ ] **Step 5: 加脚本并做类型检查**

`apps/web/package.json` scripts 加 `"check:skill-draft": "bun scripts/skill-draft.check.ts"`；运行 `npx tsc -p apps/web/tsconfig.json`（脚本不在 include，逻辑文件必须在）。

- [ ] **Step 6: 提交**

```bash
git add apps/web/src/core/lib/skillDraft.ts apps/web/scripts/skill-draft.check.ts apps/web/package.json
git commit -m "feat(skill): 提取 agent-desktop 会话草稿"
```

---

### Task 2: `skills:info` / `skills:save` IPC

**Files:**

- Create: `apps/desktop/src/ipc/skills.ts`
- Modify: `apps/desktop/src/ipc/index.ts`、`apps/desktop/src/preload.cts`、`apps/web/src/core/lib/bridge.ts`

**Interfaces:**

- Produces（IPC）：
  - `skills:info` → `{ root: string; agentDesktopBin: string | null }`
  - `skills:save`（参数 `{ name; description; body; overwrite?: boolean }`）→
    `{ ok: true; path: string } | { ok: false; reason: 'invalid' | 'managed' | 'exists' | 'symlink'; message?: string }`
- 导出 `registerSkillsIpc(): void`。

- [ ] **Step 1: 实现 `skills.ts`**

- `root = join(homedir(), '.config', 'opencode', 'skills')`；先 `mkdir(root, { recursive: true })`。
- name 校验正则；description/body 类型与长度校验（body ≤ 256KB）。
- `name === 'agent-desktop'` 或 `<dir>/.installed` 存在 → `{ ok: false, reason: 'managed' }`。
- `resolveWithin(root, name)`；`lstat(<dir>/SKILL.md)` 是符号链接 → `reason: 'symlink'`；已存在且未 `overwrite` → `reason: 'exists'`。
- 写入 frontmatter：`---\nname: <name>\ndescription: <JSON.stringify(description)>\n---\n\n<body>\n`。
- `agentDesktopBin = join(root, 'agent-desktop', 'bin', win ? 'agent-desktop.exe' : 'agent-desktop')`，`access` 成功才返回。

- [ ] **Step 2: 接入 IPC 四步**

- `ipc/index.ts` 调用 `registerSkillsIpc()`。
- `preload.cts` 增加 `skills: { info, save }`。
- `bridge.ts` 的 `AppBridge` 增加同签名类型。

- [ ] **Step 3: 验证类型**

```bash
npx tsc -p apps/desktop/tsconfig.json
npx tsc -p apps/web/tsconfig.json
```

Expected: 无输出。

- [ ] **Step 4: 提交**

```bash
git add apps/desktop/src/ipc/skills.ts apps/desktop/src/ipc/index.ts apps/desktop/src/preload.cts apps/web/src/core/lib/bridge.ts
git commit -m "feat(skill): 新增 skills 保存 IPC"
```

---

### Task 3: 保存弹窗与入口

**Files:**

- Create: `apps/web/src/core/components/SaveSkillModal.tsx`
- Modify: `apps/web/src/web/Chat.tsx`

**Interfaces:**

- Consumes: Task 1 的 `draftSkill` / `hasAgentDesktopRun`；Task 2 的 `appBridge.skills.info/save`；`Block`。
- Produces: `<SaveSkillModal open blocks onClose onSaved={({ path, name }) => …} />`（props 名称以此为准）。

- [ ] **Step 1: 实现弹窗**

- `open` 变 true 时：`appBridge.skills.info()` 取 bin → `draftSkill(blocks, { description, bin })` 填充 name/description/body；info 失败则不带 bin。
- 表单：名称 Input（正则校验）、description Input.TextArea、正文 Input.TextArea（等宽、rows≥12）。
- `warnings` 用 antd Alert 展示。
- 保存：`skills.save`；`ok === false && reason === 'exists'` → `Modal.confirm` 后带 `overwrite: true` 重试；`managed`/`invalid`/`symlink` 显示错误 Alert。
- 成功后 `message.success(path)`，回调 `onSaved({ path, name })` 并关闭。

- [ ] **Step 2: Chat 接入**

- header 在 `PhoneConnect` 旁增加 `Button`（`FileAddOutlined`），`title="存为技能"`；`disabled={!appBridge || !hasAgentDesktopRun(blocks)}`，禁用时 tooltip 说明原因。
- 保存成功后：`refreshSkills()`；再 `client.skill.list({ location: … })` 检查 `id === name`；没有则 `client.location.reload({ headers: directory ? { 'x-opencode-directory': directory } : undefined })` 后 `refreshSkills()`；仍没有 `message.warning('已保存，但服务端尚未加载，可尝试重启 opencode serve')`。

- [ ] **Step 3: 验证**

```bash
npx tsc -p apps/web/tsconfig.json
cd apps/web && bun run build
```

Expected: 无错误、构建成功。

- [ ] **Step 4: 手工验证**

启动 `bun run electron:dev`，完成一次 `agent-desktop` 操作后点「存为技能」：改名称/描述、保存 → 文件出现在 `~/.config/opencode/skills/<name>/SKILL.md` → 技能选择器里出现（无需重启）。

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/core/components/SaveSkillModal.tsx apps/web/src/web/Chat.tsx
git commit -m "feat(skill): 聊天页支持存为 skill"
```

---

### Task 4: 文档与全量回归

**Files:**

- Modify: `README.md`、`CLAUDE.md`

- [ ] **Step 1: 文档**

README 功能列表加一条「把一次 agent-desktop 操作存成 skill」；CLAUDE.md 的 Architecture/Conventions 提一句 `skillDraft` 与 `skills:*` IPC 的位置和边界。

- [ ] **Step 2: 全量验证**

```bash
npx tsc -p apps/web/tsconfig.json
npx tsc -p apps/desktop/tsconfig.json
npx tsc --noEmit -p apps/mobile/tsconfig.json
(cd apps/web && bun run check:skill-draft && bun run build)
(cd apps/desktop && bun run build:renderer)
bun run format:check
```

Expected: 全部通过。

- [ ] **Step 3: 提交**

```bash
git add README.md CLAUDE.md
git commit -m "docs: 说明会话存为 skill"
```
