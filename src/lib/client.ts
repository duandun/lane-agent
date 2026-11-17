import { OpenCode } from "@opencode/client"

/**
 * 浏览器连接 OpenCode server 所需的全部信息。
 *
 * 注意：`@opencode/client/service`（Service.ensure / Service.headers）只能跑在
 * Node 里，因为它要拉起并认证本地后台服务。浏览器必须连接自己用
 * `opencode serve` 启动的服务，并用 HTTP Basic 认证，用户名固定为 `opencode`。
 */
export type Conn = {
  baseUrl: string
  password: string
  directory: string
}

export const DEFAULT_CONN: Conn = {
  baseUrl: "http://127.0.0.1:4096",
  password: "",
  directory: "/Users/cr/opencode-workspace",
}

const USERNAME = "opencode"

function basicToken(password: string): string {
  const bytes = new TextEncoder().encode(`${USERNAME}:${password}`)
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export function makeClient(conn: Conn) {
  return OpenCode.make({
    baseUrl: conn.baseUrl.replace(/\/+$/, ""),
    headers: {
      authorization: `Basic ${basicToken(conn.password)}`,
    },
  })
}

export type Client = ReturnType<typeof makeClient>
