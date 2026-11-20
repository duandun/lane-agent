import { useEffect, useState, type ReactNode } from 'react';
import { App as AntdApp, Button, Select } from 'antd';
import { CheckOutlined, DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import type { AgentInfo } from '@opencode/client';
import type { Client } from '../lib/client';
import { DEFAULT_AGENTS, type DefaultAgent } from '../lib/defaultAgents';
import { errorText } from '../lib/error';
import { deleteAgentConfig, saveAgentConfig, seedDefaultAgents } from '../lib/opencodeConfig';
import { useAppStore, type CustomAgent } from '../lib/store';
import CustomAgentModal from './CustomAgentModal';

const AGENT_ADD_VALUE = '__agent_add__';

type AgentOption = {
  value: string;
  label: string;
  description?: string;
  className?: string;
};

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
  const { message } = AntdApp.useApp();
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
    { value: AGENT_ADD_VALUE, label: '添加新角色', className: 'model-add-option' },
  ];

  /** 默认角色第一次选中时才写入项目配置，之后按自定义角色管理。 */
  async function materializeDefaultAgent(agent: DefaultAgent) {
    try {
      await saveAgentConfig(client, directory, agent);
      saveCustomAgent(agent);
      message.success(`已添加默认角色「${agent.name}」`);
      await reloadAgents();
      onSwitch(agent.id);
    } catch (cause) {
      message.error(errorText(cause));
    }
  }

  async function deleteCustom(custom: CustomAgent) {
    if (agentID === custom.id) return;
    try {
      await deleteAgentConfig(client, directory, custom.id);
      removeCustomAgent(custom.id);
      message.success('角色已删除');
      await reloadAgents();
    } catch (cause) {
      message.error(errorText(cause));
    }
  }

  function renderOption(option: {
    value?: unknown;
    label?: ReactNode;
    data?: { description?: string; className?: string };
  }): ReactNode {
    if (String(option.value) === AGENT_ADD_VALUE) {
      return (
        <span className="flex w-full items-center justify-center gap-1.5 text-[13px] text-(--muted)">
          <PlusOutlined className="text-[11px]" />
          添加角色
        </span>
      );
    }

    const id = String(option.value);
    const description = option.data?.description;
    const selected = agentID === id;
    const custom = customAgents.find((item) => item.id === id);

    return (
      <div className="group flex w-full min-w-0 items-center gap-2.5">
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${selected ? 'bg-(--ok)' : 'bg-(--line)'}`}
        />
        <span className="min-w-0 shrink-0 text-[13px] text-(--text)">{option.label}</span>
        <span className="ml-auto flex min-w-0 shrink items-center gap-1">
          {/* 非选中显示描述；自定义角色悬停时换成编辑/删除按钮。 */}
          <span
            className={`truncate text-[11px] text-(--muted) ${selected ? 'hidden' : ''} ${
              custom ? 'group-hover:hidden' : ''
            }`}
          >
            {description}
          </span>
          {custom && (
            <span
              className="hidden shrink-0 items-center group-hover:flex"
              onMouseDown={(event) => event.preventDefault()}
              onClick={(event) => event.stopPropagation()}
            >
              <Button
                size="small"
                type="text"
                title="编辑"
                icon={<EditOutlined />}
                onClick={() => {
                  setEditing(custom);
                  setModalOpen(true);
                }}
              />
              <Button
                size="small"
                type="text"
                danger
                title={selected ? '当前角色不能删除' : '删除'}
                disabled={selected}
                icon={<DeleteOutlined />}
                onClick={() => void deleteCustom(custom)}
              />
            </span>
          )}
        </span>
      </div>
    );
  }

  return (
    <>
      <Select
        className="max-w-[150px]!"
        placeholder="选择角色"
        value={agentID ?? undefined}
        options={options}
        optionRender={renderOption}
        classNames={{ popup: { root: 'model-picker' } }}
        onChange={(value) => {
          if (value === AGENT_ADD_VALUE) {
            setEditing(null);
            setModalOpen(true);
            return;
          }
          const def = DEFAULT_AGENTS.find((a) => a.id === value);
          if (def && !agentOptions.some((o) => o.id === value)) {
            void materializeDefaultAgent(def);
            return;
          }
          onSwitch(value);
        }}
        popupMatchSelectWidth={false}
        showSearch={{
          filterOption: (input, option) =>
            `${option?.label ?? ''} ${option?.description ?? ''}`
              .toLowerCase()
              .includes(input.toLowerCase()),
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
