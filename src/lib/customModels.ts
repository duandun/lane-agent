export type CustomModel = {
  providerID: string
  modelID: string
  name: string
  baseURL: string
}

const STORAGE_KEY = "opencode-web.custom-models"

export function loadCustomModels(): CustomModel[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]")
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is CustomModel =>
        !!item &&
        typeof item.providerID === "string" &&
        typeof item.modelID === "string" &&
        typeof item.name === "string" &&
        typeof item.baseURL === "string",
    )
  } catch {
    return []
  }
}

export function saveCustomModel(model: CustomModel) {
  const list = loadCustomModels().filter((item) => item.providerID !== model.providerID)
  list.push(model)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    // 隐私模式可能禁用 localStorage；以服务端配置为准。
  }
}
