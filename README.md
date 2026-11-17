# OpenCode Web

浏览器端的 OpenCode agent 外壳。走「方案 A」：不改 OpenCode 源码，只用一个 Web 客户端连它自己的 HTTP API。

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
  opencode serve --port 4096 --cors http://localhost:5173
```

终端 2 — 起前端：

```bash
cd opencode-web-demo
bun install
bun dev
```

打开 http://localhost:5173 ，填：

| 字段 | 值 |
| --- | --- |
| 服务地址 | `http://127.0.0.1:4096` |
| 密码 | 你上面设的 `OPENCODE_PASSWORD` |
| 项目目录 | 服务器上的绝对路径，agent 就在这里干活 |

## Electron 桌面壳

```bash
bun run electron:dev      # Vite + Electron 窗口，热更新
bun run electron:start    # 构建 dist 后用 Electron 打开
bun run electron:package      # 构建并打包，产物在 release/
bun run electron:package:win  # 同上，出 Windows x64 安装包（macOS 上可直接交叉构建）
```

Windows 产物是 NSIS 安装包 `release/OpenCode Web Setup <版本>.exe`，未签名，首次运行会被 SmartScreen 拦一下（更多信息 → 仍要运行）。

Electron 里也是 http origin（默认 `http://localhost:5173`，被占用时退回随机端口），所以上面的 `--cors` 不用改。

`electron:package` 在 macOS 上出 dmg + zip，未做代码签名（没有 Apple 证书），拷到别的机器首次打开要右键 → 打开。脚本里写死了 npmmirror 的 Electron 下载镜像；网络能直连 GitHub 的话删掉那两个环境变量即可。

## 三个容易踩的坑

**1. 用户名固定是 `opencode`，不是可选项**

服务端用 HTTP Basic Auth，用户名校验是写死的 `opencode`，密码取 `OPENCODE_PASSWORD`。只给对密码、用户名写错一样 401。

**2. CORS 必须显式放行前端 origin**

默认不放行跨域。`--cors http://localhost:5173` 要精确到协议 + 主机 + 端口，不带路径和尾斜杠。多个 origin 就重复写 `--cors`。

**3. `session.idle` 不是「跑完了」**

这个事件表示会话安静下来，实测一次运行结束并不会稳定触发。真正的结束信号是 `session.execution.succeeded / failed / interrupted`，本项目的 busy 状态和消息回填都挂在这三个事件上。

## 代码结构

```
src/App.tsx          XProvider 主题 + 连接态切换
src/Connect.tsx      连接页（antd Form / Card / Alert）
src/Chat.tsx         聊天页（antdX Bubble.List / Sender / ThoughtChain / Prompts / Actions）
src/lib/client.ts    Basic Auth + 建客户端
src/lib/blocks.ts    把服务端消息映射成渲染用的 block 列表
src/lib/theme.ts     antd / antdX 暗色 token
src/styles.css       页面骨架样式
```

事件流是 UI 的唯一数据源：`session.text.delta` 增量出字，`session.tool.*` 画工具卡片，`permission.asked` 弹授权框，`execution.*` 收尾。每次运行结束后用 `message.list` 重新对齐一次，避免客户端状态和服务端真值漂移。

## UI 组件

前端用 Ant Design X 组装：

- `Bubble.List`：消息流。`user` / `ai` 两种 role 分别渲染用户和助手气泡，连续的思考与工具调用折叠成一个 `activity` role，系统提示走 `system`。
- `ThoughtChain`：一次运行里的推理过程和工具调用，运行中自动展开，结束后自动收起，失败项保持展开。
- `Sender`：输入框，回车发送、Shift+回车换行，运行中变成停止按钮。
- `Welcome` + `Prompts`：空会话的引导和快捷任务。
- `Actions`：助手消息的复制按钮；弹窗、表单、状态灯用 antd。

暗色主题在 `src/lib/theme.ts` 里用 antd token 表达，antdX 组件复用同一套 token。

## 已知边界

- 每次打开页面都会新建一个 session，没有会话列表 / 历史切换。
- `message.list` 的 `limit` 上限是 200，传大了直接报 `Expected a value less than or equal to 200`。
- 权限弹窗走 `permission.asked` 事件；如果服务器配置里权限全是 allow，就永远不会弹。
- 局域网访问要三件事一起改：`opencode serve --hostname 0.0.0.0`、`vite --host`、以及把真实 origin 加进 `--cors`。
