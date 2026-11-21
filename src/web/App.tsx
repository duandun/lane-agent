import { lazy } from 'react';
import { Theme } from '@astryxdesign/core/theme';
import { App as AntdApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import xZhCN from '@ant-design/x/locale/zh_CN';
import { XProvider } from '@ant-design/x';
import { Helmet, HelmetProvider } from 'react-helmet-async';
import favicon from '@assets/favicon.svg';
import Companion from '@core/components/companion';
import { useThemeMode } from '@core/hooks/useThemeMode';
import { DEFAULT_CONN } from '@core/lib/client';
import { useAppStore } from '@core/lib/store';
import { darkTheme, lightTheme } from '@core/lib/theme';
import { defaultThemeSlug, themes } from '../astryx-themes';

// antd 和 antdX 各自维护 locale 字典，合并后 antd 组件和 antdX 内部
// （例如 Sender 的停止按钮）都使用中文。
const locale = { ...zhCN, ...xZhCN };

const LazyChat = lazy(() => import('./Chat'));
const LazyConnect = lazy(() => import('./Connect'));

/** 根组件：连接状态来自 store，切换 Connect 与 Chat。 */
export default function App() {
  const conn = useAppStore((state) => state.conn);
  const connect = useAppStore((state) => state.connect);
  const disconnect = useAppStore((state) => state.disconnect);
  const companion = useAppStore((state) => state.companion);
  const { resolved } = useThemeMode();

  return (
    <HelmetProvider>
      <Helmet>
        <link rel="icon" type="image/svg+xml" href={favicon} />
      </Helmet>
      <Theme theme={themes[defaultThemeSlug]} mode={resolved}>
        <XProvider theme={resolved === 'dark' ? darkTheme : lightTheme} locale={locale}>
          <AntdApp component={false}>
            {conn ? (
              <LazyChat conn={conn} onDisconnect={disconnect} />
            ) : (
              <>
                <LazyConnect initial={DEFAULT_CONN} onConnect={connect} />
                <Companion kind={companion} />
              </>
            )}
          </AntdApp>
        </XProvider>
      </Theme>
    </HelmetProvider>
  );
}
