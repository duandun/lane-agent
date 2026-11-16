import { useState } from "react"
import { App as AntdApp } from "antd"
import zhCN from "antd/locale/zh_CN"
import xZhCN from "@ant-design/x/locale/zh_CN"
import { XProvider } from "@ant-design/x"
import Chat from "./Chat"
import Connect from "./Connect"
import EagleCompanion from "./components/EagleCompanion"
import { useThemeMode } from "./hooks/useThemeMode"
import { DEFAULT_CONN, type Conn } from "./lib/client"
import { darkTheme, lightTheme } from "./lib/theme"

// antd 和 antdX 各自维护 locale 字典，合并后 antd 组件和 antdX 内部
// （例如 Sender 的停止按钮）都使用中文。
const locale = { ...zhCN, ...xZhCN }

const STORAGE_KEY = "opencode-web.conn"

function loadConn(): Conn | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Conn) : null
  } catch {
    return null
  }
}

/** 根组件：恢复本地保存的连接，切换 Connect 与 Chat。 */
export default function App() {
  const [conn, setConn] = useState<Conn | null>(() => loadConn())
  const { mode, resolved, setMode } = useThemeMode()

  return (
    <XProvider theme={resolved === "dark" ? darkTheme : lightTheme} locale={locale}>
      <AntdApp component={false}>
        {conn ? (
          <Chat
            conn={conn}
            themeMode={mode}
            onThemeChange={setMode}
            onDisconnect={() => {
              localStorage.removeItem(STORAGE_KEY)
              setConn(null)
            }}
          />
        ) : (
          <>
            <Connect
              initial={loadConn() ?? DEFAULT_CONN}
              onConnect={(next) => {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
                setConn(next)
              }}
            />
            <EagleCompanion />
          </>
        )}
      </AntdApp>
    </XProvider>
  )
}
