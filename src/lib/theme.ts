import { theme, type ThemeConfig } from "antd"

/**
 * The original hand-rolled palette, expressed as antd tokens so antdX
 * components (which read from the same token system) stay consistent.
 */
export const themeConfig: ThemeConfig = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorPrimary: "#4f8cff",
    colorInfo: "#4f8cff",
    colorSuccess: "#35c48a",
    colorError: "#ef5b5b",
    colorBgBase: "#0f1115",
    colorBgLayout: "#0f1115",
    colorBgContainer: "#161a21",
    colorBgElevated: "#1d222b",
    colorBorder: "#2a303b",
    colorBorderSecondary: "#222834",
    colorText: "#e6e9ef",
    colorTextSecondary: "#8b93a4",
    colorTextTertiary: "#6b7385",
    borderRadius: 10,
    fontFamily:
      '-apple-system, "SF Pro Text", "PingFang SC", "Segoe UI", system-ui, sans-serif',
    fontFamilyCode: '"SF Mono", ui-monospace, Menlo, monospace',
  },
  components: {
    Modal: {
      contentBg: "#161a21",
      headerBg: "#161a21",
    },
    Input: {
      activeShadow: "0 0 0 3px rgba(79, 140, 255, 0.18)",
    },
    Button: {
      primaryShadow: "none",
    },
  },
}
