import { useEffect, useState } from "react"

export type ThemeMode = "auto" | "light" | "dark"
export type ResolvedTheme = "light" | "dark"

const STORAGE_KEY = "opencode-web.theme"

function loadMode(): ThemeMode {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value === "light" || value === "dark" || value === "auto" ? value : "auto"
  } catch {
    // 隐私模式可能禁用 localStorage，退回跟随系统。
    return "auto"
  }
}

function systemTheme(): ResolvedTheme {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

/**
 * 主题模式：auto 跟随系统，light/dark 手动固定。
 * 把解析结果写到 <html data-theme>，CSS 变量和 antd token 一起切换。
 */
export function useThemeMode() {
  const [mode, setMode] = useState<ThemeMode>(loadMode)
  const [system, setSystem] = useState<ResolvedTheme>(systemTheme)

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = () => setSystem(media.matches ? "dark" : "light")
    media.addEventListener("change", onChange)
    return () => media.removeEventListener("change", onChange)
  }, [])

  const resolved: ResolvedTheme = mode === "auto" ? system : mode

  useEffect(() => {
    document.documentElement.dataset.theme = resolved
    try {
      localStorage.setItem(STORAGE_KEY, mode)
    } catch {
      // 存不了也不影响当前会话。
    }
  }, [mode, resolved])

  return { mode, resolved, setMode }
}
