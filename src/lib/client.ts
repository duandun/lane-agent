import { OpenCode } from "@opencode/client"

/**
 * Everything the browser needs to reach an OpenCode server.
 *
 * Note: `@opencode/client/service` (Service.ensure / Service.headers) is Node-only
 * because it spawns and authenticates against the local background service.
 * In a browser you must point at a server you started yourself with `opencode serve`
 * and authenticate with HTTP Basic, using the username `opencode`.
 */
export type Conn = {
  baseUrl: string
  password: string
  directory: string
}

export const DEFAULT_CONN: Conn = {
  baseUrl: "http://127.0.0.1:4096",
  password: "",
  directory: "",
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
