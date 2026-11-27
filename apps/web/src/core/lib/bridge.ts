export type AppInfo = {
  platform: string;
  arch: string;
  appVersion: string;
  versions: { electron: string; node: string; chrome: string };
};

export type FsEntry = {
  name: string;
  /** 相对 root 的路径，统一用 / 分隔 */
  path: string;
  dir: boolean;
};

export type ExecResult = {
  code: number | null;
  stdout: string;
  stderr: string;
};

export type LocalService = {
  url: string;
  username: string;
  password: string;
};

export type SkillInfo = {
  root: string;
  agentDesktopBin: string | null;
};

export type SaveSkillInput = {
  name: string;
  description: string;
  body: string;
  overwrite?: boolean;
};

export type SaveSkillResult =
  | { ok: true; path: string }
  | { ok: false; reason: 'invalid' | 'managed' | 'exists' | 'symlink'; message?: string };

export type PhoneLanInfo = {
  port: number;
  token: string;
  candidates: string[];
};

export type AppBridge = {
  ping: () => Promise<string>;
  info: () => Promise<AppInfo>;
  serverHealth: (baseUrl: string) => Promise<{ status?: string } | null>;
  localService: () => Promise<LocalService | null>;
  selectDirectory: () => Promise<string | null>;
  /** 用系统文件管理器打开路径。 */
  openPath: (path: string) => Promise<void>;
  fs: {
    list: (root: string, dir?: string) => Promise<FsEntry[]>;
    read: (root: string, path: string) => Promise<string>;
    write: (root: string, path: string, content: string) => Promise<void>;
    /** 按字节写入，用于上传的二进制附件。 */
    writeBytes: (root: string, path: string, data: Uint8Array) => Promise<void>;
  };
  exec: {
    npx: (root: string, args: string[]) => Promise<ExecResult>;
  };
  skills: {
    info: () => Promise<SkillInfo>;
    save: (input: SaveSkillInput) => Promise<SaveSkillResult>;
  };
  /** app 数据目录里的 opencode 配置（自定义模型等），桌面端独有。 */
  opencodeConfig: {
    read: () => Promise<string>;
    write: (content: string) => Promise<void>;
  };
  lan: {
    start: () => Promise<PhoneLanInfo>;
    setCode: (code: string | null) => Promise<void>;
    stop: () => Promise<void>;
  };
};

declare global {
  interface Window {
    appBridge?: AppBridge;
  }
}

/** 浏览器里没有 preload，这里是 undefined。 */
export const appBridge = typeof window === 'undefined' ? undefined : window.appBridge;
