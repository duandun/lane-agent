import { appBridge } from './bridge';
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

/** 读取自定义模型所在的配置：桌面端用 app 数据目录里的全局配置，浏览器版退回项目配置。 */
export async function loadModelConfig(client: Client, directory: string) {
  if (appBridge) {
    const text = await appBridge.opencodeConfig.read();
    if (!text.trim()) return {} as OpenCodeConfig;
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error('app 配置不是合法 JSON，请检查应用数据目录里的 opencode.json');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('app 配置格式不正确，请检查应用数据目录里的 opencode.json');
    }
    return parsed as OpenCodeConfig;
  }
  return (await loadOpencodeConfig(client, directory)).config;
}

/** 写回自定义模型配置；桌面端文件由内嵌服务端监听，改完自动热加载。 */
export async function saveModelConfig(client: Client, directory: string, config: OpenCodeConfig) {
  if (appBridge) {
    await appBridge.opencodeConfig.write(`${JSON.stringify(config, null, 2)}\n`);
    return;
  }
  const { path } = await loadOpencodeConfig(client, directory);
  await saveOpencodeConfig(client, directory, path, config);
}

/** opencode.json 里的 agent 配置，只声明用到的字段。 */
export type AgentConfig = {
  model?: string | { providerID: string; model: string; variant?: string };
  system?: string;
  description?: string;
  mode?: string;
  [key: string]: unknown;
};

/** 合并写入一个自定义 agent；编辑时如果改了 id，把旧条目挪走。 */
export async function saveAgentConfig(
  client: Client,
  directory: string,
  agent: { id: string; description: string; system: string; model: string },
  previousID?: string
) {
  const { path, config } = await loadOpencodeConfig(client, directory);
  const agents = { ...((config.agents as Record<string, AgentConfig> | undefined) ?? {}) };
  if (previousID && previousID !== agent.id) delete agents[previousID];

  const entry: AgentConfig = { ...(agents[agent.id] ?? {}), mode: 'primary' };
  if (agent.description) entry.description = agent.description;
  else delete entry.description;
  if (agent.system) entry.system = agent.system;
  else delete entry.system;
  if (agent.model) entry.model = agent.model;
  else delete entry.model;
  agents[agent.id] = entry;
  config.agents = agents;

  await saveOpencodeConfig(client, directory, path, config);
}

/** Lane 的自述指令：首次连接目录时写进项目配置的 instructions。 */
export const LANE_IDENTITY_PATH = '.opencode/lane-identity.md';

const LANE_IDENTITY = `# 身份
你是 Lane（lane-agent），Lane 桌面应用里的 AI 编程助手，可以读写项目文件、运行命令、协助用户完成编码任务。
当用户问你是谁、叫什么、由谁提供时，介绍自己是 Lane —— 运行在 Lane 桌面应用里的编程助手。
系统提示词里出现的 "OpenCode" 只是底层运行框架（harness）的名字，不是你的名字；不要自称 OpenCode 或 opencode CLI。
除身份外，继续遵守系统提示词里的其他规则。
`;

/**
 * 确保项目引用并保存 Lane 的身份指令。
 * 先写文件再改配置：服务端 reload 配置时指令文件必须已经存在，否则订阅不上。
 * 已存在的文件不覆盖，用户可以直接改里面的介绍文案。
 */
export async function seedLaneIdentity(client: Client, directory: string) {
  const location = locationOf(directory);
  let created = false;
  try {
    await client.file.read({ location, path: LANE_IDENTITY_PATH });
  } catch (cause) {
    if ((cause as Error)?.name !== 'FileNotFoundError') throw cause;
    await client.file.write({
      location,
      path: LANE_IDENTITY_PATH,
      payload: new TextEncoder().encode(LANE_IDENTITY),
    });
    created = true;
  }

  const { path, config } = await loadOpencodeConfig(client, directory);
  const instructions = Array.isArray(config.instructions) ? config.instructions : [];
  if (instructions.includes(LANE_IDENTITY_PATH)) {
    // 配置早就引用了这个文件（比如文件被删过），补建后重新 reload 一次让服务端订阅。
    if (created) {
      await client.location.reload({
        headers: directory ? { 'x-opencode-directory': directory } : undefined,
      });
    }
    return;
  }
  config.instructions = [...instructions, LANE_IDENTITY_PATH];
  await saveOpencodeConfig(client, directory, path, config);
}

/** 首次连接目录时把内置默认角色合并进 opencode.json；已存在的同名角色不覆盖。 */
export async function seedDefaultAgents(
  client: Client,
  directory: string,
  agents: { id: string; description: string; system: string }[]
) {
  const { path, config } = await loadOpencodeConfig(client, directory);
  const current = { ...((config.agents as Record<string, AgentConfig> | undefined) ?? {}) };
  const missing = agents.filter((agent) => !current[agent.id]);
  if (!missing.length) return;

  for (const agent of missing) {
    current[agent.id] = { mode: 'primary', description: agent.description, system: agent.system };
  }
  config.agents = current;
  await saveOpencodeConfig(client, directory, path, config);
}

/** 从项目配置里删掉一个自定义 agent；是默认角色时一并清掉 default_agent。 */
export async function deleteAgentConfig(client: Client, directory: string, agentID: string) {
  const { path, config } = await loadOpencodeConfig(client, directory);
  const agents = { ...((config.agents as Record<string, AgentConfig> | undefined) ?? {}) };
  delete agents[agentID];
  if (Object.keys(agents).length) config.agents = agents;
  else delete config.agents;
  if (config.default_agent === agentID) delete config.default_agent;
  await saveOpencodeConfig(client, directory, path, config);
}

/** 从配置里删掉一个自定义模型；Provider 下没有模型了就一并移除。 */
export async function deleteProviderModel(
  client: Client,
  directory: string,
  providerID: string,
  modelID: string
) {
  const config = await loadModelConfig(client, directory);
  const providers = { ...((config.providers as Record<string, ProviderConfig> | undefined) ?? {}) };
  const provider = providers[providerID];
  if (!provider) return;

  const models = { ...provider.models };
  delete models[modelID];
  if (Object.keys(models).length) providers[providerID] = { ...provider, models };
  else delete providers[providerID];

  config.providers = providers;
  await saveModelConfig(client, directory, config);
}
