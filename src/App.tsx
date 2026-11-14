import { useState } from "react"
import { App as AntdApp } from "antd"
import zhCN from "antd/locale/zh_CN"
import xZhCN from "@ant-design/x/locale/zh_CN"
import { XProvider } from "@ant-design/x"
import Chat from "./Chat"
import Connect from "./Connect"
import { DEFAULT_CONN, type Conn } from "./lib/client"
import { themeConfig } from "./lib/theme"

// antd and antdX keep separate locale dictionaries; merge them so both antd
// widgets and antdX internals (e.g. the Sender stop button) speak Chinese.
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

export default function App() {
  const [conn, setConn] = useState<Conn | null>(() => loadConn())

  return (
    <XProvider theme={themeConfig} locale={locale}>
      <AntdApp component={false}>
        {conn ? (
          <Chat
            conn={conn}
            onDisconnect={() => {
              localStorage.removeItem(STORAGE_KEY)
              setConn(null)
            }}
          />
        ) : (
          <Connect
            initial={loadConn() ?? DEFAULT_CONN}
            onConnect={(next) => {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
              setConn(next)
            }}
          />
        )}
      </AntdApp>
    </XProvider>
  )
}
