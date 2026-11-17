export type AppInfo = {
  platform: string;
  arch: string;
  appVersion: string;
  versions: { electron: string; node: string; chrome: string };
};

export type AppBridge = {
  ping: () => Promise<string>;
  info: () => Promise<AppInfo>;
};

declare global {
  interface Window {
    appBridge?: AppBridge;
  }
}

/** 浏览器里没有 preload，这里是 undefined。 */
export const appBridge = typeof window === 'undefined' ? undefined : window.appBridge;
