import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Conn } from './client';

export type ThemeMode = 'auto' | 'light' | 'dark';
export type CompanionKind = 'eagle' | 'cat';
export type SavedModel = { providerID: string; id: string };
export type CustomModel = { providerID: string; modelID: string; name: string; baseURL: string };

/* 旧版本分散存储的键：首次运行仍从这些键读，之后统一写进 STORE_KEY。 */
const LEGACY = {
  conn: 'opencode-web.conn',
  theme: 'opencode-web.theme',
  companion: 'opencode-web.companion',
  model: 'opencode-web.model',
  customModels: 'opencode-web.custom-models',
} as const;

const STORE_KEY = 'opencode-web.store';

function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    // 隐私模式可能禁用 localStorage。
    return null;
  }
}

function loadConn(): Conn | null {
  try {
    const raw = readRaw(LEGACY.conn);
    return raw ? (JSON.parse(raw) as Conn) : null;
  } catch {
    return null;
  }
}

function loadThemeMode(): ThemeMode {
  const value = readRaw(LEGACY.theme);
  return value === 'light' || value === 'dark' || value === 'auto' ? value : 'auto';
}

function loadCompanion(): CompanionKind {
  return readRaw(LEGACY.companion) === 'cat' ? 'cat' : 'eagle';
}

function loadModel(): SavedModel | null {
  try {
    const value = JSON.parse(readRaw(LEGACY.model) ?? 'null') as Partial<SavedModel> | null;
    if (!value || typeof value.providerID !== 'string' || typeof value.id !== 'string') return null;
    return { providerID: value.providerID, id: value.id };
  } catch {
    return null;
  }
}

function loadCustomModels(): CustomModel[] {
  try {
    const parsed = JSON.parse(readRaw(LEGACY.customModels) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is CustomModel =>
        !!item &&
        typeof item.providerID === 'string' &&
        typeof item.modelID === 'string' &&
        typeof item.name === 'string' &&
        typeof item.baseURL === 'string'
    );
  } catch {
    return [];
  }
}

type AppState = {
  conn: Conn | null;
  themeMode: ThemeMode;
  companion: CompanionKind;
  model: SavedModel | null;
  customModels: CustomModel[];
  connect: (conn: Conn) => void;
  disconnect: () => void;
  setThemeMode: (mode: ThemeMode) => void;
  setCompanion: (kind: CompanionKind) => void;
  setModel: (model: SavedModel | null) => void;
  saveCustomModel: (model: CustomModel) => void;
};

/** 全局状态：连接、主题、智能伙伴、模型偏好和自定义模型，统一持久化。 */
export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      conn: loadConn(),
      themeMode: loadThemeMode(),
      companion: loadCompanion(),
      model: loadModel(),
      customModels: loadCustomModels(),
      connect: (conn) => set({ conn }),
      disconnect: () => set({ conn: null }),
      setThemeMode: (themeMode) => set({ themeMode }),
      setCompanion: (companion) => set({ companion }),
      setModel: (model) => set({ model }),
      saveCustomModel: (model) =>
        set((state) => ({
          customModels: [
            ...state.customModels.filter((item) => item.providerID !== model.providerID),
            model,
          ],
        })),
    }),
    {
      name: STORE_KEY,
      storage: createJSONStorage(() => localStorage),
      // 只持久化数据，不写入 action。
      partialize: ({ conn, themeMode, companion, model, customModels }) => ({
        conn,
        themeMode,
        companion,
        model,
        customModels,
      }),
    }
  )
);
