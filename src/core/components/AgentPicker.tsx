import { useEffect, useState } from 'react';
import { Pencil2Icon, PlusIcon, TrashIcon } from '@radix-ui/react-icons';
import { Callout, Flex, IconButton, Text } from '@radix-ui/themes';
import type { AgentInfo } from '@opencode/client';
import type { Client } from '../lib/client';
import { DEFAULT_AGENTS, type DefaultAgent } from '../lib/defaultAgents';
import { errorText } from '../lib/error';
import { deleteAgentConfig, saveAgentConfig, seedDefaultAgents } from '../lib/opencodeConfig';
import { useAppStore, type CustomAgent } from '../lib/store';
import CustomAgentModal from './CustomAgentModal';
import OptionPicker, { type PickerOption } from './OptionPicker';

/**
 * 角色选择器：拉取服务端 agent 列表、合并内置默认角色模板，
 * 并负责自定义角色的新增 / 编辑 / 删除。
 */
export default function AgentPicker({
  client,
  directory,
  agentID,
  modelOptions,
  onSwitch,
}: {
  client: Client;
  directory: string;
  agentID: string | null;
  modelOptions: { value: string; label: string }[];
  onSwitch: (agentID: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const customAgents = useAppStore((state) => state.customAgents);
  const saveCustomAgent = useAppStore((state) => state.saveCustomAgent);
  const removeCustomAgent = useAppStore((state) => state.removeCustomAgent);
  const seededAgentDirs = useAppStore((state) => state.seededAgentDirs);
  const markAgentSeeded = useAppStore((state) => state.markAgentSeeded);
  const [agentOptions, setAgentOptions] = useState<AgentInfo[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CustomAgent | null>(null);

  // 当前目录可用的 agent 角色；隐藏子代理，只留可选的主/通用角色。
  async function reloadAgents() {
    const location = directory ? { directory } : undefined;
    const list = await client.agent.list({ location });
    setAgentOptions(list.data.filter((item) => !item.hidden && item.mode !== 'subagent'));
  }

  // 首次连接项目目录时把默认角色写进 opencode.json，之后按自定义角色管理。
  useEffect(() => {
    let cancelled = false;
    async function init() {
      if (!seededAgentDirs.includes(directory)) {
        try {
          await seedDefaultAgents(client, directory, DEFAULT_AGENTS);
          if (cancelled) return;
          markAgentSeeded(directory);
          const known = useAppStore.getState().customAgents;
          DEFAULT_AGENTS.filter((agent) => !known.some((item) => item.id === agent.id)).forEach(
            (agent) => saveCustomAgent(agent)
          );
        } catch {
          // 写入失败不标记，下次连接重试；选中模板时仍会补写。
        }
      }
      if (cancelled) return;
      await reloadAgents().catch(() => {
        // 角色列表属于可选 UI；拉取失败时保留空列表。
      });
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, [client, directory]);

  type AgentOption = { value: string; label: string; description?: string };
  const options: AgentOption[] = [
    ...agentOptions.map((item) => ({
      value: item.id,
      // 服务端用 agent id 作为 name；默认角色沿用中文显示名。
      label: DEFAULT_AGENTS.find((a) => a.id === item.id)?.name ?? item.name ?? item.id,
      description: item.description,
    })),
    ...DEFAULT_AGENTS.filter((a) => !agentOptions.some((o) => o.id === a.id)).map((a) => ({
      value: a.id,
      label: a.name,
      description: a.description,
    })),
  ];

  /** 默认角色第一次选中时才写入项目配置，之后按自定义角色管理。 */
  async function materializeDefaultAgent(agent: DefaultAgent) {
    try {
      await saveAgentConfig(client, directory, agent);
      saveCustomAgent(agent);
      setError(null);
      await reloadAgents();
      onSwitch(agent.id);
    } catch (cause) {
      setError(errorText(cause));
    }
  }

  async function deleteCustom(custom: CustomAgent) {
    if (agentID === custom.id) return;
    try {
      await deleteAgentConfig(client, directory, custom.id);
      removeCustomAgent(custom.id);
      setError(null);
      await reloadAgents();
    } catch (cause) {
      setError(errorText(cause));
    }
  }

  const pickerOptions: PickerOption[] = options.map((option) => {
    const selected = agentID === option.value;
    const custom = customAgents.find((item) => item.id === option.value);
    return {
      value: option.value,
      search: `${option.label} ${option.description ?? ''}`,
      content: () => (
        <Flex align="center" gap="2" className="min-w-0 flex-1">
          <span
            className={`size-2 shrink-0 rounded-full ${selected ? 'bg-(--ok)' : 'bg-(--line)'}`}
          />
          <Text size="2" className="shrink-0">
            {option.label}
          </Text>
          {!selected && option.description && (
            <Text size="1" color="gray" truncate className="min-w-0">
              {option.description}
            </Text>
          )}
        </Flex>
      ),
      actions: custom ? (
        <>
          <IconButton
            size="1"
            variant="ghost"
            color="gray"
            aria-label="编辑"
            title="编辑"
            onClick={() => {
              setEditing(custom);
              setModalOpen(true);
            }}
          >
            <Pencil2Icon />
          </IconButton>
          <IconButton
            size="1"
            variant="ghost"
            color="red"
            aria-label="删除"
            title={selected ? '当前角色不能删除' : '删除'}
            disabled={selected}
            onClick={() => void deleteCustom(custom)}
          >
            <TrashIcon />
          </IconButton>
        </>
      ) : undefined,
    };
  });

  const current = options.find((option) => option.value === agentID);

  return (
    <>
      <OptionPicker
        value={agentID}
        trigger={current?.label ?? '选择角色'}
        triggerClassName="max-w-[150px] max-sm:max-w-[110px]"
        placeholder="搜索角色"
        options={pickerOptions}
        width={320}
        notice={
          error ? (
            <Callout.Root color="red" size="1">
              <Callout.Text>{error}</Callout.Text>
            </Callout.Root>
          ) : undefined
        }
        onSelect={(value) => {
          setError(null);
          const def = DEFAULT_AGENTS.find((a) => a.id === value);
          if (def && !agentOptions.some((o) => o.id === value)) {
            void materializeDefaultAgent(def);
            return;
          }
          onSwitch(value);
        }}
        addLabel="添加角色"
        addIcon={<PlusIcon />}
        onAdd={() => {
          setEditing(null);
          setModalOpen(true);
        }}
      />

      <CustomAgentModal
        open={modalOpen}
        client={client}
        directory={directory}
        modelOptions={modelOptions}
        editing={editing}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        onSaved={async (saved) => {
          await reloadAgents();
          if (!editing) onSwitch(saved.id);
        }}
      />
    </>
  );
}
