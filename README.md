# Lane

浏览器端的 AI agent 外壳。走「方案 A」：不改 OpenCode 源码，只用一个 Web 客户端连它自己的 HTTP API。

```
浏览器 (React + @opencode/client)
        │  HTTP + SSE，Basic Auth
        ▼
opencode serve  ← agent / 工具 / 权限 / 会话都在这里
        │
        ▼
你的项目目录
```

## 启动

终端 1 — 起服务端（`@opencode/client/service` 只能跑在 Node 里，浏览器必须连一个自己起的服务）：

```bash
OPENCODE_PASSWORD=your-secret \
  opencode serve --hostname 0.0.0.0 --port 4096 --cors https://ai.cr123.life
```

终端 2 — 起前端：

```bash
cd opencode-web-demo
bun install
bun dev
```

打开 http://localhost:5173 ，填：

| 字段     | 值                                                      |
| -------- | ------------------------------------------------------- |
| 服务地址 | `http://127.0.0.1:4096`                                 |
| 密码     | 你上面设的 `OPENCODE_PASSWORD`                          |
| 项目目录 | 默认 `/Users/cr/opencode-workspace`，agent 就在这里干活 |

生产环境是 https://ai.cr123.life （静态前端）。直接打开它时，服务端要把这个 origin 加进 CORS：

```bash
OPENCODE_PASSWORD=your-secret \
  opencode serve --port 4096 --cors https://ai.cr123.life
```

## Electron 桌面壳

```bash
bun run electron:dev      # Vite + Electron 窗口，热更新
bun run electron:start    # 构建 dist 后用 Electron 打开（离线）
bun run electron:package      # 构建并打包 dist，产物在 release/
bun run electron:package:linux  # 同上，出 Linux x64 AppImage
bun run electron:package:win  # 同上，出 Windows x64 安装包（macOS 上可直接交叉构建）
```

Windows 产物是 NSIS 安装包 `release/Lane Setup <版本>.exe`，未签名，首次运行会被 SmartScreen 拦一下（更多信息 → 仍要运行）。

主进程用 TypeScript（`src/app/*.ts`），`electron:*` 脚本会先用 `tsc -p tsconfig.electron.json` 编译到 `dist-electron/` 再启动或打包；该目录不进 git。只编译主进程用 `bun run build:app`。

生产环境把 dist 打进安装包，Electron 用固定的本地 HTTP 服务（`http://localhost:5173`）加载它。启动时还会用内置的 opencode CLI，通过 `@opencode/client/service` 的 `Service.ensure` 拉起本地 opencode 服务（`opencode serve --service`）；连接页会自动填入服务地址和生成的密码。agent 因此在本机执行，agent-desktop skill 和 CLI 都能直接用。

内置 CLI 在打包前下载：`bun run bundle:cli`（默认当前平台，Linux/Windows 打包脚本会传 `OPENCODE_TARGET`）。它按目标平台从 `@opencode/cli-*@2.3.0` 取二进制，放到 `resources/opencode-cli/`（约 220–250MB），作为 extraResources 带进安装包；开发时没下载就退回 PATH 里的 `opencode`。

5173 被占用时静态服务会直接报错（不退回随机端口），避免页面 origin 变化导致本地服务的 CORS 失效。连接页底部的命令会按当前页面 origin 自动填好。

连接页的项目目录在桌面端可以点「选择」打开系统文件夹选择器，也可以手动输入；Web 端不可修改，固定使用 `/Users/cr/opencode-workspace`。

`electron:package` 在 macOS 上出 dmg + zip，未做代码签名（没有 Apple 证书），拷到别的机器首次打开要右键 → 打开。脚本里写死了 npmmirror 的 Electron 下载镜像；网络能直连 GitHub 的话删掉那两个环境变量即可。

## Node 通道

渲染进程不直接拿 Node，主进程通过 IPC 提供受控能力：

1. `src/app/ipc/*.ts` 用 `ipcMain.handle('app:xxx', ...)` 注册操作，新增能力就加一个文件并在 `ipc/index.ts` 里注册。
2. `src/app/preload.cts` 在 `contextBridge` 里把对应方法暴露到 `window.appBridge`（编译为 `preload.cjs`）。
3. `src/core/lib/bridge.ts` 补类型；浏览器里 `window.appBridge` 是 `undefined`，用之前先判断。

目前提供：

- `ping()` / `info()`：健康检查。
- `fs.list(root, dir?)`：列出目录，返回 `{ name, path, dir }`，`path` 相对 `root`。
- `fs.read(root, path)` / `fs.write(root, path, content)`：读写 UTF-8 文本。
- `fs.writeBytes(root, path, data)`：按字节写入，用于把上传的附件保存到工作目录。
- `exec.npx(root, args)`：在 `root` 里执行 `npx --yes <args>`，返回 `{ code, stdout, stderr }`；超时 5 分钟，stdout/stderr 各截断到 1MB。使用安装包内置的 npm（`resources/npm`），JS 跑在 Electron 自带的 Node 上，用户机器不需要装 Node/npm；包脚本里的 `node` 由临时 shim 指向 Electron。
- `localService()`：返回本地 opencode 服务的 `{ url, username, password }`；Electron 启动时用内置 CLI 调 `Service.ensure`，连接页用它预填服务地址和密码。
- `openPath(path)`：用系统文件管理器打开路径；聊天页点击顶栏的项目目录时使用。

所有文件操作都限制在传入的 `root` 内（词法校验 + `realpath`，阻止 `../` 和软链接逃逸）。`exec.npx` 会执行任意包代码（包括 install 脚本），只对可信的包使用。打包时 `scripts/bundle-runtime.mjs` 会把 npm 和 agent-desktop 复制到 `.npm-bundle/`，再由 electron-builder 作为 extraResources 带进安装包。

## agent-desktop

应用内置 agent-desktop CLI 和 skill，用户不需要预装：

- 启动时把当前平台的二进制、helper 和 skill 安装到 `~/.config/opencode/skills/agent-desktop/`，带 `.installed` 标记；升级时自动重装，不覆盖用户自己放的同名 skill。
- OpenCode 从全局 skills 目录自动发现它；首次安装后需要重启 `opencode serve`。
- skill 里的命令已替换成安装后的绝对路径（`bin/agent-desktop`），不依赖 PATH；`references/` 和 CLI 的 `skills get` 都可用。
- 真正操作 GUI 的是运行 opencode 的进程，macOS 上要给那个终端/应用授予辅助功能、屏幕录制权限；用 `agent-desktop status` 查看。
- 桌面端启动的是本地 opencode 服务，所以 skill 和 agent-desktop CLI 天然在同一台机器；Web 端连远程服务器时，skill 仍需另外部署到服务器上。

## 三个容易踩的坑

**1. 用户名固定是 `opencode`，不是可选项**

服务端用 HTTP Basic Auth，用户名校验是写死的 `opencode`，密码取 `OPENCODE_PASSWORD`。只给对密码、用户名写错一样 401。

**2. CORS 必须显式放行前端 origin**

默认不放行跨域。`--cors` 的值必须是当前页面的 origin（连接页底部的命令已按当前域名填好），要精确到协议 + 主机 + 端口，不带路径和尾斜杠。多个 origin 就重复写 `--cors`。

**3. `session.idle` 不是「跑完了」**

这个事件表示会话安静下来，实测一次运行结束并不会稳定触发。真正的结束信号是 `session.execution.succeeded / failed / interrupted`，本项目的 busy 状态和消息回填都挂在这三个事件上。

## 代码结构

```
src/
  core/                web 和 app 共用的代码
    components/        消息、Markdown、活动链、弹窗等通用组件
    hooks/             会话事件流、主题
    lib/               Basic Auth 客户端、block 映射、主题 token
    styles.css         页面骨架样式
  web/                 Web 端
    index.html         页面入口
    main.tsx           React 挂载
    App.tsx            连接态切换
    Connect.tsx        连接页（antd Form / Card / Alert）
    Chat.tsx           聊天页（antdX Bubble.List / Sender / ThoughtChain / Prompts / Actions）
  app/                 Electron 端（TypeScript，编译到 dist-electron）
    main.ts            主进程：本地静态服务 + 打开窗口
    service.ts         用内置 CLI 启动本地 opencode 服务
    ipc/
      index.ts         汇总注册 Node 能力
      health.ts        app:ping / app:info
      local.ts         service:local 本地服务地址
      fs.ts            fs:list / fs:read / fs:write / fs:writeBytes
      exec.ts          exec:npx
      paths.ts         root 路径校验
    preload.cts        contextBridge 暴露给渲染进程（编译为 preload.cjs）
    skill.ts           把内置 agent-desktop CLI + skill 装到 OpenCode 全局目录
assets/
  favicon.svg          Lane 图标（网页 favicon 和页面内图标）
  icon.png             打包图标
  agent-desktop-skill/ 内置的 agent-desktop SKILL.md 和 references
scripts/
  bundle-runtime.mjs     把 npm / agent-desktop 复制到 .npm-bundle
  bundle-opencode-cli.mjs 按目标平台下载 opencode CLI 到 resources/opencode-cli
resources/opencode-cli/  打包时生成的内置 CLI（不提交）
```

Web 和 Electron 共用 `core`；Electron 加载的是 `web` 构建出来的 `dist`。跨目录引用用 `@core/*` 等别名，Vite 的 `resolve.alias` 和 tsconfig 的 `paths` 两边都要配。

样式用 Tailwind CSS v4（`@tailwindcss/vite`）。`src/core/styles.css` 只保留主题变量和 antd/全局样式覆盖，并通过 `@source '../'` 让 Tailwind 扫描 `src`；新组件优先写工具类，antd 组件上的尺寸用 `!` 覆盖它的内置样式。

事件流是 UI 的唯一数据源：`session.text.delta` 增量出字，`session.tool.*` 画工具卡片，`permission.asked` 弹授权框，`execution.*` 收尾。每次运行结束后用 `message.list` 重新对齐一次，避免客户端状态和服务端真值漂移。

## UI 组件

前端用 Ant Design X 组装：

- `Bubble.List`：消息流。`user` / `ai` 两种 role 分别渲染用户和助手气泡，连续的思考与工具调用折叠成一个 `activity` role，系统提示走 `system`。
- `ThoughtChain`：一次运行里的推理过程和工具调用，运行中自动展开，结束后自动收起，失败项保持展开。
- `Sender`：输入框，回车发送、Shift+回车换行，运行中变成停止按钮。
- `Welcome` + `Prompts`：空会话的引导和快捷任务。
- `Actions`：助手消息的复制按钮；弹窗、表单、状态灯用 antd。

暗色主题在 `core/lib/theme.ts` 里用 antd token 表达，antdX 组件复用同一套 token。

## 已知边界

- 每次打开页面都会新建一个 session，没有会话列表 / 历史切换。
- `message.list` 的 `limit` 上限是 200，传大了直接报 `Expected a value less than or equal to 200`。
- 权限弹窗走 `permission.asked` 事件；如果服务器配置里权限全是 allow，就永远不会弹。
- 局域网访问要三件事一起改：`opencode serve --hostname 0.0.0.0`、`vite --host`、以及把真实 origin 加进 `--cors`。
