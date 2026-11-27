# Lane

AI agent 的桌面端 / Web / 手机联动套件，走「方案 A」：不改 OpenCode 源码，只用 Web 客户端连它自己的 HTTP API + SSE。仓库里同时有产品官网。

仓库：<https://github.com/duandun/lane-agent>

bun workspaces monorepo：

- `apps/web` — 桌面端渲染界面（Vite + React，也可直接当浏览器版）
- `apps/desktop` — Electron 主进程、打包脚本和内置资源
- `apps/mobile` — 手机 Web（TanStack Start，扫码后使用的页面）
- `apps/server` — 手机连接用的 Express + Socket.IO 服务（6060）
- `apps/welcome` — 产品官网（TanStack Start SSR + Nitro，部署到 Vercel）
- `packages/protocol` — web 与 mobile 共享的手机同步协议

```
浏览器 (React + @opencode/client)
        │  HTTP + SSE，Basic Auth
        ▼
opencode serve  ← agent / 工具 / 权限 / 会话都在这里
        │
        ▼
你的项目目录
```

## 功能

- **聊天**：SSE 增量出字，推理过程和工具调用折叠成「已处理」，权限请求和问题表单用弹窗处理，支持停止和重新生成。
- **会话历史**：左侧按项目目录恢复最近会话，支持切换、新建、重命名和删除；窄屏收进抽屉。
- **手机联动**：桌面端点「手机连接」生成 6 位连接码和二维码，手机扫码后可以收发消息，agent 的对话快照（含文件改动）实时同步到手机。手机和电脑在同一局域网时优先直连桌面端，否则自动回退服务器中继。
- **对话轨迹**：header 可切到「轨迹」，按轮次和步骤查看思考、工具与回复；顶部是固定宽度、按输入/模型/工具分层的轨迹带，点色块可定位记录；轨迹末尾会展示当前模型调用的完整输入上下文；支持搜索、折叠、详细模式（耗时、TTFT、token、成本）和完整输入输出检查器。
- **技能与附件**：输入框可挑选 skill，附件写入项目目录后随消息提交。
- **操作存为 skill**：桌面端完成一次 agent-desktop 操作后，可把本次命令提取成 `SKILL.md` 草稿，保存到 `~/.config/opencode/skills`，刷新技能列表即可复用。
- **文件改动卡片**：`edit` / `write` / `patch` 工具会在对话里展开成 git 风格的 diff——文件名、`+N −N`、词级高亮的增删行；diff 用 jsdiff 计算。
- **模型选择**：卡片式下拉，显示状态点、模型名、自定义标记、provider ID 和选中对勾；自定义 OpenAI 兼容模型可以定义任意多个，同一行悬停可编辑 / 删除。
- **输入框**：Enter 发送、Shift+Enter 换行，↑ / ↓ 浏览最近 10 条已发送内容。
- **智能伙伴**：可拖拽的小鹰 / 小猫，按 agent 状态（思考、说话、执行、等待、报错）播放不同动画，顶栏可切换。
- **主题**：跟随系统 / 浅色 / 深色。
- **持久化**：连接、主题、伙伴、模型偏好和自定义模型统一存在 zustand store 的 `lane.store` 里。

## 启动

终端 1 — 起服务端（`@opencode/client/service` 只能跑在 Node 里，浏览器必须连一个自己起的服务）：

```bash
OPENCODE_PASSWORD=your-secret \
  opencode serve --hostname 0.0.0.0 --port 4096 --cors https://ai.cr123.life
```

终端 2 — 起前端：

```bash
cd lane-agent
bun install
bun dev
```

手机端与中继服务（本地联调时另开终端）：

```bash
bun run dev:server   # apps/server，http://localhost:6060
bun run dev:mobile   # apps/mobile，http://localhost:3000
```

官网（另开终端）：

```bash
bun run dev:welcome  # apps/welcome，http://localhost:3001
```

打开 http://localhost:5173 ，填：

| 字段     | 值                                                      |
| -------- | ------------------------------------------------------- |
| 服务地址 | `http://127.0.0.1:4096`                                 |
| 密码     | 你上面设的 `OPENCODE_PASSWORD`                          |
| 项目目录 | 默认 `/Users/cr/opencode-workspace`，agent 就在这里干活 |

生产环境（Vercel 静态前端）见下文「部署到 Vercel」。直接打开线上页面时，服务端要把该页面的 origin 加进 CORS：

```bash
OPENCODE_PASSWORD=your-secret \
  opencode serve --port 4096 --cors https://ai.cr123.life
```

## 自定义模型

「选择模型 → 添加自定义模型」会向项目目录的 `opencode.json` 合并写入一个 provider，并让服务端重新加载配置：

```json
{
  "providers": {
    "custom-deepseek": {
      "name": "Custom DeepSeek",
      "env": ["CUSTOM_DEEPSEEK_API_KEY"],
      "package": "@opencode/ai/providers/openai-compatible",
      "settings": { "baseURL": "https://api.deepseek.com/v1" },
      "models": { "deepseek-chat": { "name": "deepseek-chat" } }
    }
  }
}
```

- 同一个 provider 下可以放多个模型，编辑 / 删除会同步合并或移除对应条目；provider 没有模型后会整块删掉。
- API Key 保存在服务端凭据库，不写进 `opencode.json`。
- 模型列表来自服务端的 `GET /api/model?types=chat`，所以保存后必须让服务端重新加载配置才会出现。

## Electron 桌面壳

```bash
bun run electron:dev      # Vite + Electron 窗口，热更新
bun run electron:start    # 构建 dist 后用 Electron 打开（离线）
bun run electron:package      # 构建并打包 dist，产物在 apps/desktop/release/
bun run electron:package:linux  # 同上，出 Linux x64 AppImage
bun run electron:package:win  # 同上，出 Windows x64 安装包（macOS 上可直接交叉构建）
```

Windows 产物是 NSIS 安装包 `apps/desktop/release/Lane Setup <版本>.exe`，未签名，首次运行会被 SmartScreen 拦一下（更多信息 → 仍要运行）。

主进程用 TypeScript（`apps/desktop/src/*.ts`），`electron:*` 脚本会先清理并编译到 `apps/desktop/dist-electron/` 再启动或打包；该目录不进 git。只编译主进程用 `bun run build:app`。

生产环境把 dist 打进安装包，Electron 用固定的本地 HTTP 服务（`http://localhost:5173`）加载它。本地 opencode 服务由 `@opencode/server` 在 Electron `utilityProcess` 里内嵌启动（监听 `127.0.0.1` 随机端口、随机密码），不再打包或调用 opencode CLI；渲染进程仍然用 `@opencode/client` + SSE，连接页会自动填入服务地址和密码。agent 因此在本机执行，agent-desktop skill 和 CLI 都能直接用。

5173 被占用时静态服务会直接报错（不退回随机端口），避免页面 origin 变化导致本地服务的 CORS 失效。连接页底部的命令会按当前页面 origin 自动填好。

连接页的项目目录在桌面端可以点「选择」打开系统文件夹选择器，也可以手动输入；Web 端不可修改，固定使用 `/Users/cr/opencode-workspace`。

`electron:package` 在 macOS 上出 dmg + zip，未做代码签名（没有 Apple 证书），拷到别的机器首次打开要右键 → 打开。脚本里写死了 npmmirror 的 Electron 下载镜像；网络能直连 GitHub 的话删掉那两个环境变量即可。

## 部署到 Vercel（官网 + 桌面端 Web）

`apps/welcome`（SSR）和 `apps/web`（静态 SPA）是两个独立的 Vercel 项目，导入同一个仓库，分别设置 Root Directory。

| 设置项           | 官网项目                                  | 桌面端 Web 项目                  |
| ---------------- | ----------------------------------------- | -------------------------------- |
| Root Directory   | `apps/welcome`                            | `apps/web`                       |
| Framework Preset | TanStack Start（`vercel.json` 已指定）    | Vite（自动识别）                 |
| Install Command  | 留空（Vercel 在仓库根执行 `bun install`） | 留空                             |
| Build Command    | `bun run build`                           | `bun run build`                  |
| Output Directory | Nitro 自动（`.output`）                   | `dist`                           |
| 环境变量         | `VITE_BAIDU_TONGJI_ID`                    | 无（服务地址由用户在连接页填写） |

步骤：

1. Vercel → Add New Project → 导入本仓库，Root Directory 设为 `apps/welcome`，按上表配置。
2. 再 Add New Project 一次，导入本仓库，Root Directory 设为 `apps/web`。
3. 分别绑定域名，并确认 Project Settings 里的 “Include source files outside of the Root Directory in the Build Step” 已勾选（否则根 `package.json`、`bun.lock`、`packages/protocol` 不会进入构建）。
4. `apps/web` 部署后，把你自己的 `opencode serve` 启动参数里的 `--cors` 加上该域名；`apps/web` 没有 URL 路由，不需要 SPA rewrite。

## 手机端与中继服务

- `apps/server`：Express + Socket.IO，负责生成 6 位配对码、按连接码划分房间、转发消息和快照；连接码在内存里保存 2 小时，配对/广播有简单限流。
- `apps/desktop`：配对期间在 Electron 主进程里额外开一个只监听局域网的 Socket.IO 端点（一次性 token 鉴权），二维码里带上网卡候选地址；手机优先直连，超时或断线后回退中继。浏览器版没有这个能力，只走中继。
- `apps/mobile`：扫码后打开的手机页面，先逐个尝试局域网候选，失败再连服务器；加入房间后接收 `agent messages` 快照，发消息统一走 socket 的 `chat message`。

本地联调：

```bash
bun run dev:server   # 6060
bun run dev:mobile   # 3000，开发服务器把 /api、/socket.io 代理到 6060
```

部署到 VPS（默认 `root@59.110.25.186`，可用 `-- user@host` 覆盖）：

```bash
bun run upload:mobile   # 上传 apps/mobile 源码 + dist 到 /opt/lane-serve/web
bun run upload:server   # 上传 apps/server 源码到 /opt/lane-serve/server
ssh root@59.110.25.186 'cd /opt/lane-serve/server && npm ci && pm2 restart lane-serve-api'
```

nginx 需要：

- `root /opt/lane-serve/web/dist/client`，`location / { try_files $uri /_shell.html; }`；`_shell.html` 不缓存，`/assets/` 可长缓存。
- `/api/` 与 `/socket.io/` 反代到 `127.0.0.1:6060`，Socket.IO 要带 `Upgrade` / `Connection: upgrade` 头。
- 开 gzip，并把 `X-Forwarded-For` 传给服务端，限流才会按真实客户端 IP 生效。

## Node 通道

渲染进程不直接拿 Node，主进程通过 IPC 提供受控能力：

1. `apps/desktop/src/ipc/*.ts` 用 `ipcMain.handle('app:xxx', ...)` 注册操作，新增能力就加一个文件并在 `ipc/index.ts` 里注册。
2. `apps/desktop/src/preload.cts` 在 `contextBridge` 里把对应方法暴露到 `window.appBridge`（编译为 `preload.cjs`）。
3. `apps/web/src/core/lib/bridge.ts` 补类型；浏览器里 `window.appBridge` 是 `undefined`，用之前先判断。

目前提供：

- `ping()` / `info()`：健康检查。
- `fs.list(root, dir?)`：列出目录，返回 `{ name, path, dir }`，`path` 相对 `root`。
- `fs.read(root, path)` / `fs.write(root, path, content)`：读写 UTF-8 文本。
- `fs.writeBytes(root, path, data)`：按字节写入，用于把上传的附件保存到工作目录。
- `exec.npx(root, args)`：在 `root` 里执行 `npx --yes <args>`，返回 `{ code, stdout, stderr }`；超时 5 分钟，stdout/stderr 各截断到 1MB。使用安装包内置的 npm（`resources/npm`），JS 跑在 Electron 自带的 Node 上，用户机器不需要装 Node/npm；包脚本里的 `node` 由临时 shim 指向 Electron。
- `localService()`：返回本地 opencode 服务的 `{ url, username, password }`；Electron 启动时用内置 CLI 调 `Service.ensure`，连接页用它预填服务地址和密码。
- `openPath(path)`：用系统文件管理器打开路径；聊天页点击顶栏的项目目录时使用。

所有文件操作都限制在传入的 `root` 内（词法校验 + `realpath`，阻止 `../` 和软链接逃逸）。`exec.npx` 会执行任意包代码（包括 install 脚本），只对可信的包使用。打包时 `apps/desktop/scripts/bundle-runtime.mjs` 会把 npm 和 agent-desktop 复制到 `apps/desktop/.npm-bundle/`，再由 electron-builder 作为 extraResources 带进安装包。

## agent-desktop

应用内置 agent-desktop CLI 和 skill，用户不需要预装：

- 启动时把当前平台的二进制、helper 和 skill 安装到 `~/.config/opencode/skills/agent-desktop/`，带 `.installed` 标记；升级时自动重装，不覆盖用户自己放的同名 skill。
- OpenCode 会热加载全局 skills 目录里的新增技能，安装后刷新技能列表即可，无需重启 `opencode serve`。
- skill 里的命令已替换成安装后的绝对路径（`bin/agent-desktop`），不依赖 PATH；`references/` 和 CLI 的 `skills get` 都可用。
- 真正操作 GUI 的是运行 opencode 的进程，macOS 上要给那个终端/应用授予辅助功能、屏幕录制权限；用 `agent-desktop status` 查看。
- 桌面端启动的是本地 opencode 服务，所以 skill 和 agent-desktop CLI 天然在同一台机器；Web 端连远程服务器时，skill 仍需另外部署到服务器上。

## 四个容易踩的坑

**1. 用户名固定是 `opencode`，不是可选项**

服务端用 HTTP Basic Auth，用户名校验是写死的 `opencode`，密码取 `OPENCODE_PASSWORD`。只给对密码、用户名写错一样 401。

**2. CORS 必须显式放行前端 origin**

默认不放行跨域。`--cors` 的值必须是当前页面的 origin（连接页底部的命令已按当前域名填好），要精确到协议 + 主机 + 端口，不带路径和尾斜杠。多个 origin 就重复写 `--cors`。

**3. `session.idle` 不是「跑完了」**

这个事件表示会话安静下来，实测一次运行结束并不会稳定触发。真正的结束信号是 `session.execution.succeeded / failed / interrupted`，本项目的 busy 状态和消息回填都挂在这三个事件上。

**4. 自定义模型必须写在 `opencode.json` 里**

服务端只读项目目录的 `opencode.json` / `opencode.jsonc`。写到别的文件名不会报错，但 `/api/model` 里没有这个模型，前端自然看不到；写完还需要 `location.reload` 让服务端重新加载。

## 代码结构

```
apps/
  web/                 桌面端渲染界面
    src/core/            组件 / hooks / lib / styles.css
      components/
        Messages.tsx       消息流 + 活动折叠 + diff 卡片
        FileChange.tsx     文件改动 diff 卡片
        CustomModelModal.tsx 自定义模型编辑
        SkillPicker.tsx    输入框左下角的 skill 选择
        PermissionModal.tsx / QuestionPrompt.tsx  授权与问题表单
        companion/         小鹰 / 小猫 SVG、拖拽外壳和 companion.css
      hooks/
        useChatSession.ts  会话、SSE 事件流、发送 / 停止 / 重新生成
        useThemeMode.ts    主题模式与 data-theme
        useAttachments.tsx 附件写入工作目录
      lib/
        client.ts          Basic Auth 客户端
        store.ts           zustand store（连接 / 主题 / 伙伴 / 模型，persist 到 lane.store）
        blocks.ts          消息 block 映射
        diff.ts            jsdiff 包装 + 工具输入解析
        socket.ts / phone.ts / usePhoneSync  手机配对与同步
        opencodeConfig.ts  opencode.json 读写与 provider 删除
        theme.ts / prism.ts / error.ts / bridge.ts
    src/web/              页面入口
      index.html           页面入口（首屏主题引导）
      main.tsx             React 挂载
      App.tsx              连接态切换
      Connect.tsx          连接页（antd Form / Card / Alert）
      Chat.tsx             聊天页（antdX Bubble.List / Sender / Prompts / Actions，模型下拉）
    src/assets/            favicon、Lane 图标
    vite.config.ts         5173，输出 dist/
    tsconfig.json
  desktop/             Electron 端（TypeScript，编译到 dist-electron）
    src/
      main.ts              主进程：本地静态服务 + 打开窗口
      service.ts           用内置 CLI 启动本地 opencode 服务
      ipc/                 Node 能力：health / local / fs / exec / paths
      preload.cts          contextBridge 暴露给渲染进程（编译为 preload.cjs）
      skill.ts             把内置 agent-desktop CLI + skill 装到 OpenCode 全局目录
    assets/
      icon.png             打包图标
      agent-desktop-skill/ 内置的 agent-desktop SKILL.md 和 references
    scripts/
      bundle-runtime.mjs     把 npm / agent-desktop 复制到 .npm-bundle
    embedded.ts            utilityProcess 管理器（主进程，Promise）
    embedded-host.ts       utility 进程入口，启动 @opencode/server
    dist/、dist-electron/  构建产物（不提交）
  mobile/              手机 Web（原 lane-serve/web，TanStack Start SPA）
  server/              中继服务（原 lane-serve/server，Express + Socket.IO）
  welcome/             产品官网（TanStack Start SSR + Nitro，Vercel 部署）
packages/
  protocol/            手机同步协议：事件名、消息类型、限额
```

桌面端渲染界面和 Electron 共用 `apps/web/src/core`；Electron 加载的是 `apps/web` 构建出来的 `dist`（打包时拷到 `apps/desktop/dist`）。跨目录引用用 `@core/*` 等别名，Vite 的 `resolve.alias` 和 tsconfig 的 `paths` 两边都要配。

样式用 Tailwind CSS v4（`@tailwindcss/vite`）。`apps/web/src/core/styles.css` 放主题变量、antd 覆盖和页面骨架；智能伙伴的样式在 `apps/web/src/core/components/companion/companion.css`。新组件优先写工具类，覆盖 antd 内置样式时用 `!`。

事件流是 UI 的唯一数据源：`session.text.delta` 增量出字，`session.tool.*` 画工具卡片并保留原始 input 供 diff 渲染，`permission.asked` 弹授权框，`execution.*` 收尾。每次运行结束后用 `message.list` 重新对齐一次，避免客户端状态和服务端真值漂移。

## UI 组件

前端用 Ant Design + Ant Design X 组装：

- `Bubble.List`：消息流。`user` / `ai` / `activity`（思考与工具折叠）/ `change`（文件改动卡片）/ `system` 五种 role。
- `Activity` + `DisclosureRow`：一次运行里的推理和工具调用，运行中自动展开，结束后收起。
- `FileChange`：文件改动的 diff 卡片，词级高亮 + 单侧整行着色。
- `Sender`：输入框，回车发送、Shift+回车换行，运行中变成停止按钮；↑ / ↓ 浏览发送历史。
- `Select` + `optionRender`：模型卡片下拉，自定义模型行悬停显示编辑 / 删除。
- `SessionList`：左侧会话历史（按目录取 `session.list`，标题取该会话的第一条提问），顶部新建会话，悬停会话可重命名 / 删除；窄屏收进抽屉，桌面端可折叠。
- `Welcome` + `Prompts`：空会话的引导和快捷任务。
- `Actions`：助手消息的复制 / 重新生成按钮；弹窗、表单、状态灯用 antd。

暗色主题在 `apps/web/src/core/lib/theme.ts` 里用 antd token 表达，antdX 组件复用同一套 token。

## 已知边界

- 打开页面会恢复当前目录下最近更新的会话，左侧可切换或新建；列表首屏 30 条，可继续加载，排除归档和子代理会话，运行中不能切换。输入历史仍只存在当前页面内存里。
- `message.list` 的 `limit` 上限是 200，传大了直接报 `Expected a value less than or equal to 200`；长会话只展示最近 200 条消息。
- 权限弹窗走 `permission.asked` 事件；如果服务器配置里权限全是 allow，就永远不会弹。
- 局域网访问要三件事一起改：`opencode serve --hostname 0.0.0.0`、`vite --host`、以及把真实 origin 加进 `--cors`。
- 自定义模型的「自定义」标记和编辑 / 删除按钮依赖本地 `customModels`（通过应用保存过的才会记录）；手工写进 `opencode.json` 的模型会出现在列表里，但没有这两个按钮。
- 没有测试框架。类型检查用 `npx tsc -p apps/web/tsconfig.json`、`npx tsc -p apps/desktop/tsconfig.json`、`npx tsc --noEmit -p apps/mobile/tsconfig.json`；apps/welcome 在自身目录跑 `bunx tsc --noEmit`，Lint 用 `bun run lint`（仅 welcome 配置了 ESLint）。
