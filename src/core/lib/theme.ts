import { theme, type ThemeConfig } from 'antd';

/**
 * 暗色 token。原先手写的调色板改用 antd token 表达，
 * 让 antdX 组件（读取同一套 token）保持一致。
 */
export const darkTheme: ThemeConfig = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorPrimary: '#4f8cff',
    colorInfo: '#4f8cff',
    colorSuccess: '#35c48a',
    colorError: '#ef5b5b',
    colorBgBase: '#0f1115',
    colorBgLayout: '#0f1115',
    colorBgContainer: '#161a21',
    colorBgElevated: '#1d222b',
    colorBorder: '#2a303b',
    colorBorderSecondary: '#222834',
    colorText: '#e6e9ef',
    colorTextSecondary: '#8b93a4',
    colorTextTertiary: '#6b7385',
    borderRadius: 10,
    fontFamily: '-apple-system, "SF Pro Text", "PingFang SC", "Segoe UI", system-ui, sans-serif',
    fontFamilyCode: '"SF Mono", ui-monospace, Menlo, monospace',
  },
  components: {
    Modal: {
      contentBg: '#161a21',
      headerBg: '#161a21',
    },
    Input: {
      activeShadow: '0 0 0 3px rgba(79, 140, 255, 0.18)',
    },
    Button: {
      primaryShadow: 'none',
    },
  },
};

const fontFamily = '-apple-system, "SF Pro Text", "PingFang SC", "Segoe UI", system-ui, sans-serif';
const fontFamilyCode = '"SF Mono", ui-monospace, Menlo, monospace';

/** 亮色 token；和暗色共用品牌色，只替换背景、边框和文字层级。 */
export const lightTheme: ThemeConfig = {
  algorithm: theme.defaultAlgorithm,
  token: {
    colorPrimary: '#2f6fed',
    colorInfo: '#2f6fed',
    colorSuccess: '#1f9d6b',
    colorError: '#dc4a4a',
    colorBgBase: '#f5f6f8',
    colorBgLayout: '#f5f6f8',
    colorBgContainer: '#ffffff',
    colorBgElevated: '#ffffff',
    colorBorder: '#dfe3ea',
    colorBorderSecondary: '#e8ebf0',
    colorText: '#1f2430',
    colorTextSecondary: '#6b7280',
    colorTextTertiary: '#8a91a0',
    borderRadius: 10,
    fontFamily,
    fontFamilyCode,
  },
  components: {
    Modal: {
      contentBg: '#ffffff',
      headerBg: '#ffffff',
    },
    Input: {
      activeShadow: '0 0 0 3px rgba(47, 111, 237, 0.15)',
    },
    Button: {
      primaryShadow: 'none',
    },
  },
};
