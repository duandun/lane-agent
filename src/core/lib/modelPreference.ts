export type SavedModel = { providerID: string; id: string };

const STORAGE_KEY = 'opencode-web.model';

export function loadModel(): SavedModel | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<SavedModel> | null;
    if (!value || typeof value.providerID !== 'string' || typeof value.id !== 'string') return null;
    return { providerID: value.providerID, id: value.id };
  } catch {
    return null;
  }
}

export function saveModel(model: SavedModel) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ providerID: model.providerID, id: model.id })
    );
  } catch {
    // 隐私模式可能禁用 localStorage；不影响当前会话。
  }
}

export function clearModel() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 同上。
  }
}
