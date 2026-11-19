import type { Client } from './client';

/** opencode.json 里的 provider 配置，只声明用到的字段。 */
export type ProviderConfig = {
  name?: string;
  env?: string[];
  package?: string;
  settings?: Record<string, unknown>;
  models?: Record<string, unknown>;
};

type OpenCodeConfig = Record<string, unknown>;

function locationOf(directory: string) {
  return directory ? { directory } : undefined;
}

/** 读取项目里的 opencode.json / opencode.jsonc，找不到时返回待新建的路径。 */
export async function loadOpencodeConfig(client: Client, directory: string) {
  const location = locationOf(directory);
  let path = 'opencode.json';
  let config: OpenCodeConfig = {};

  for (const candidate of ['opencode.json', 'opencode.jsonc']) {
    try {
      const bytes = await client.file.read({ location, path: candidate });
      const text = new TextDecoder().decode(bytes);
      try {
        const parsed = JSON.parse(text || '{}');
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('根节点不是对象');
        }
        config = parsed as OpenCodeConfig;
      } catch {
        throw new Error(`${candidate} 解析失败（可能含注释），请手动编辑该文件`);
      }
      path = candidate;
      break;
    } catch (cause) {
      if ((cause as Error)?.name === 'FileNotFoundError') continue;
      throw cause;
    }
  }

  return { path, config };
}

/** 写回配置并让服务端重新加载。 */
export async function saveOpencodeConfig(
  client: Client,
  directory: string,
  path: string,
  config: OpenCodeConfig
) {
  await client.file.write({
    location: locationOf(directory),
    path,
    payload: new TextEncoder().encode(`${JSON.stringify(config, null, 2)}\n`),
  });
  await client.location.reload({
    headers: directory ? { 'x-opencode-directory': directory } : undefined,
  });
}

/** 从项目配置里删掉一个自定义模型；Provider 下没有模型了就一并移除。 */
export async function deleteProviderModel(
  client: Client,
  directory: string,
  providerID: string,
  modelID: string
) {
  const { path, config } = await loadOpencodeConfig(client, directory);
  const providers = { ...(config.providers as Record<string, ProviderConfig> | undefined) };
  const provider = providers[providerID];
  if (!provider) return;

  const models = { ...provider.models };
  delete models[modelID];
  if (Object.keys(models).length) providers[providerID] = { ...provider, models };
  else delete providers[providerID];

  config.providers = providers;
  await saveOpencodeConfig(client, directory, path, config);
}
