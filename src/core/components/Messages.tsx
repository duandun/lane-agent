import { useMemo } from 'react';
import { Avatar, App as AntdApp } from 'antd';
import {
  Actions,
  Bubble,
  Prompts,
  Welcome,
  type BubbleItemType,
  type PromptsItemType,
} from '@ant-design/x';
import {
  AppstoreOutlined,
  BulbOutlined,
  CopyOutlined,
  ExperimentOutlined,
  FileSearchOutlined,
  RedoOutlined,
  RobotOutlined,
  ThunderboltFilled,
  UserOutlined,
} from '@ant-design/icons';
import Markdown from './Markdown';
import Activity, { type ActivityBlock } from './Activity';
import type { Block, SkillTag } from '../lib/blocks';

type ViewItem =
  | { key: string; role: 'user'; text: string; skills?: SkillTag[] }
  | { key: string; role: 'ai'; text: string }
  | { key: string; role: 'activity'; blocks: ActivityBlock[] }
  | { key: string; role: 'system'; text: string };

const ROLES = {
  user: {
    placement: 'end' as const,
    variant: 'filled' as const,
    avatar: <Avatar size="small" icon={<UserOutlined />} />,
    styles: { content: { background: 'var(--user-bubble)' } },
  },
  ai: {
    placement: 'start' as const,
    variant: 'outlined' as const,
    avatar: (
      <Avatar
        size="small"
        icon={<RobotOutlined />}
        style={{ background: 'linear-gradient(135deg, #4f8cff, #7c5cff)' }}
      />
    ),
  },
  activity: {
    placement: 'start' as const,
    variant: 'borderless' as const,
    avatar: (
      <Avatar
        size="small"
        icon={<ThunderboltFilled />}
        style={{ background: 'var(--activity-avatar)', color: 'var(--activity-avatar-fg)' }}
      />
    ),
  },
  system: { placement: 'start' as const },
};

const SUGGESTIONS: PromptsItemType[] = [
  {
    key: 'explain',
    icon: <FileSearchOutlined />,
    label: '了解项目',
    description: '介绍一下这个项目的结构、入口和关键模块',
  },
  {
    key: 'improve',
    icon: <BulbOutlined />,
    label: '找点活干',
    description: '看看这个项目还有哪些可以改进的地方',
  },
  {
    key: 'test',
    icon: <ExperimentOutlined />,
    label: '跑测试',
    description: '运行测试，并修复失败的用例',
  },
];

/**
 * 把连续的 reasoning / tool block 合并成一个 activity 组，
 * 让每次运行只渲染一张活动卡片，而不是一叠单项卡片。
 */
function toViewItems(blocks: Block[]): ViewItem[] {
  const items: ViewItem[] = [];
  for (const block of blocks) {
    if (block.kind === 'reasoning' || block.kind === 'tool') {
      const last = items[items.length - 1];
      if (last?.role === 'activity') {
        last.blocks.push(block);
      } else {
        items.push({ key: `activity:${block.id}`, role: 'activity', blocks: [block] });
      }
      continue;
    }
    if (block.kind === 'notice') {
      items.push({ key: block.id, role: 'system', text: block.text });
      continue;
    }
    if (block.kind === 'user') {
      items.push({ key: block.id, role: 'user', text: block.text, skills: block.skills });
      continue;
    }
    items.push({ key: block.id, role: 'ai', text: block.text });
  }
  return items;
}

/**
 * 对话视图：把思考和工具调用折叠成活动气泡，并为回答提供复制和重新生成。
 */
export default function Messages({
  blocks,
  busy,
  directory,
  onSuggestion,
  onRegenerate,
}: {
  blocks: Block[];
  busy: boolean;
  directory: string;
  onSuggestion: (text: string) => void;
  onRegenerate: (messageID: string, text: string, userBlockID: string) => void;
}) {
  const { message } = AntdApp.useApp();

  const bubbleItems = useMemo<BubbleItemType[]>(() => {
    const copy = async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        message.success('已复制');
      } catch {
        message.error('复制失败');
      }
    };

    const lastTextID = [...blocks].reverse().find((block) => block.kind === 'text')?.id;
    const views = toViewItems(blocks);
    const lastView = views[views.length - 1];
    const activityRunning = busy && lastView?.role === 'activity';
    const lastAIIndex = views.reduce(
      (last, view, index) => (view.role === 'ai' ? index : last),
      -1
    );

    const items: BubbleItemType[] = views.map((item, index) => {
      if (item.role === 'activity') {
        return {
          key: item.key,
          role: 'activity',
          content: (
            <Activity blocks={item.blocks} active={activityRunning && item.key === lastView.key} />
          ),
        };
      }
      if (item.role === 'system') {
        return { key: item.key, role: 'system', content: item.text };
      }
      if (item.role === 'user') {
        return {
          key: item.key,
          role: 'user',
          content: item.skills?.length ? (
            <div className="flex flex-col items-end gap-2">
              <div className="flex flex-wrap justify-end gap-1">
                {item.skills.map((skill) => (
                  <span
                    key={skill.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-(--accent)/25 bg-(--accent)/10 px-2 py-1 text-[12px] font-medium leading-none text-(--accent)"
                  >
                    <AppstoreOutlined className="text-[10px]" />
                    {skill.name}
                  </span>
                ))}
              </div>
              <span>{item.text}</span>
            </div>
          ) : (
            item.text
          ),
        };
      }

      // 重新生成会丢弃该 prompt 之后的所有内容，所以只给最后一条回答展示，
      // 且要求该 prompt 已持久化到服务端。
      const prompt =
        index === lastAIIndex
          ? [...views.slice(0, index)].reverse().find((view) => view.role === 'user')
          : undefined;
      const actions = [
        ...(!busy && prompt?.key.startsWith('msg:')
          ? [
              {
                key: 'regenerate',
                label: '重新生成',
                icon: <RedoOutlined />,
                onItemClick: () => onRegenerate(prompt.key.slice(4), prompt.text, prompt.key),
              },
            ]
          : []),
        {
          key: 'copy',
          label: '复制',
          icon: <CopyOutlined />,
          onItemClick: () => void copy(item.text),
        },
      ];

      return {
        key: item.key,
        role: 'ai',
        content: <Markdown text={item.text} streaming={busy && item.key === lastTextID} />,
        footer: <Actions items={actions} />,
      };
    });

    if (busy) {
      items.push({ key: 'working', role: 'ai', content: '', loading: true });
    }

    return items;
  }, [blocks, busy, message, onRegenerate]);

  if (blocks.length === 0 && !busy) {
    return (
      <div className="empty flex min-h-0 w-full min-w-0 flex-1 flex-col items-center justify-center gap-2.5 overflow-y-auto px-0 pb-6 pt-2">
        <Welcome
          variant="borderless"
          icon={
            <Avatar
              size={48}
              icon={<ThunderboltFilled />}
              style={{
                background: 'linear-gradient(135deg, #4f8cff, #7c5cff)',
                color: '#fff',
              }}
            />
          }
          title="交给 agent 吧"
          description={`已连接 ${directory}，在下面描述你想做的事。`}
        />
        <Prompts
          title="或者试试这些"
          items={SUGGESTIONS}
          vertical
          onItemClick={({ data }) => onSuggestion(String(data.description ?? data.label ?? ''))}
        />
      </div>
    );
  }

  return (
    <Bubble.List
      className="bubbles h-full min-h-0 flex-1"
      items={bubbleItems}
      role={ROLES}
      autoScroll
    />
  );
}
