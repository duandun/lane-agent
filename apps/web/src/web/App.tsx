import { lazy, useEffect, useState } from 'react';
import { App as AntdApp, Spin } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import xZhCN from '@ant-design/x/locale/zh_CN';
import { XProvider } from '@ant-design/x';
import { Helmet, HelmetProvider } from 'react-helmet-async';
import favicon from '@assets/favicon.svg';
import Companion from '@core/components/companion';
import { useThemeMode } from '@core/hooks/useThemeMode';
import { appBridge } from '@core/lib/bridge';
import { DEFAULT_CONN } from '@core/lib/client';
import { useAppStore } from '@core/lib/store';
import { darkTheme, lightTheme } from '@core/lib/theme';

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
  const directory = useAppStore((state) => state.directory);
  const { resolved } = useThemeMode();

  // 桌面端凭据不落盘：启动时向主进程要内嵌服务的最新地址和密码，只从本地存储恢复目录。
  const [ready, setReady] = useState(!appBridge);
  useEffect(() => {
    if (!appBridge) return;
    let alive = true;
    appBridge
      .localService()
      .catch(() => null)
      .then((service) => {
        if (!alive) return;
        const stored = useAppStore.getState();
        // 老版本存过整个连接，目录还能接着用。
        const saved = stored.directory || stored.conn?.directory;
        if (service && saved) {
          connect({ baseUrl: service.url, password: service.password, directory: saved });
        } else {
          disconnect();
        }
        setReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <HelmetProvider>
      <Helmet>
        <link rel="icon" type="image/svg+xml" href={favicon} />
      </Helmet>
      <XProvider theme={resolved === 'dark' ? darkTheme : lightTheme} locale={locale}>
        <AntdApp component={false}>
          {!ready ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-(--muted)">
              <Spin size="large" />
              <span>正在启动…</span>
            </div>
          ) : conn ? (
            <LazyChat conn={conn} onDisconnect={disconnect} />
          ) : (
            <>
              <LazyConnect initial={{ ...DEFAULT_CONN, directory }} onConnect={connect} />
              <Companion kind={companion} />
            </>
          )}
        </AntdApp>
      </XProvider>
    </HelmetProvider>
  );
}
