import { useEffect, useState } from 'react';
import { useAppStore } from '../lib/store';

export type ResolvedTheme = 'light' | 'dark';

function systemTheme(): ResolvedTheme {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * 主题模式：auto 跟随系统，light/dark 手动固定。
 * 把解析结果写到 <html data-theme>，CSS 变量和 antd token 一起切换。
 */
export function useThemeMode() {
  const mode = useAppStore((state) => state.themeMode);
  const setMode = useAppStore((state) => state.setThemeMode);
  const [system, setSystem] = useState<ResolvedTheme>(systemTheme);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setSystem(media.matches ? 'dark' : 'light');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const resolved: ResolvedTheme = mode === 'auto' ? system : mode;

  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
  }, [resolved]);

  return { mode, resolved, setMode };
}
