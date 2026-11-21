import { useEffect, useRef, useState } from 'react';
import type { FormAnswer, FormInfo, PermissionRequest, SessionInfo } from '@opencode/client';
import type { Client, Conn } from '../lib/client';
import {
  blocksFromMessages,
  patch,
  upsert,
  type Block,
  type SkillTag,
  type ToolStatus,
} from '../lib/blocks';
import { errorText } from '../lib/error';

export type ChatStatus = 'connecting' | 'online' | 'offline';

/** 一轮执行中 agent 正在做什么，用来驱动伙伴动画。 */
export type AgentActivity = 'idle' | 'thinking' | 'talking' | 'reading' | 'working';

export type ModelRef = { providerID: string; id: string };

/** 会话标题取第一条提问的首行，太长截断。 */
function titleOf(text: string): string {
  const line = text.trim().split('\n')[0];
  return line.length > 60 ? `${line.slice(0, 60)}…` : line;
}

function textOf(content: unknown): string {
  if (!Array.isArray(content)) return '';
  return content
    .map((item) =>
      item && typeof item === 'object' && 'text' in item ? String((item as any).text) : ''
    )
    .filter(Boolean)
    .join('\n');
}

/**
 * 一个 OpenCode 会话的全部状态与行为：建会话、订阅 SSE 事件流、维护消息
 * block、等待授权，以及发送 / 停止 / 重新生成。
 *
 * UI 只消费返回值；模型选择等展示层状态仍留在 Chat 里。
 */
export function useChatSession(conn: Conn, client: Client) {
  const [sessionID, setSessionID] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [sessionCursor, setSessionCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [agentID, setAgentID] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [status, setStatus] = useState<ChatStatus>('connecting');
  const [busy, setBusy] = useState(false);
  const [activity, setActivity] = useState<AgentActivity>('idle');
  const [queue, setQueue] = useState<PermissionRequest[]>([]);
  const [forms, setForms] = useState<FormInfo[]>([]);
  const [formPending, setFormPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sessionRef = useRef<string | null>(null);

  useEffect(() => {
    sessionRef.current = sessionID;
  }, [sessionID]);

  async function reload(id: string) {
    const response = await client.message.list({ sessionID: id, order: 'asc', limit: 200 });
    setBlocks(blocksFromMessages(response.data));
  }

  // 旧版本把所有会话标题固定写成 Lane，这里用第一条提问在本地修正显示。
  // 不回写服务端：session.update 会顺带刷新 updated 时间，打乱历史排序。
  const derivedTitles = useRef(new Map<string, string>());
  const titleChecked = useRef(new Set<string>());

  // 当前目录的最近会话；子代理和归档会话不放进历史列表。
  async function loadSessions(cursor?: string): Promise<{
    list: SessionInfo[];
    next: string | null;
  }> {
    const response = await client.session.list({
      directory: conn.directory || undefined,
      order: 'desc',
      limit: 30,
      // 官方接口约定：parentID=null 只返回根会话；archived=false 排除归档会话。
      parentID: null,
      archived: false,
      cursor,
    });
    const list = response.data.map((item) => {
      const title = derivedTitles.current.get(item.id);
      return title !== undefined ? { ...item, title } : item;
    });
    return { list, next: response.cursor?.next ?? null };
  }

  function deriveTitles(list: SessionInfo[]) {
    for (const session of list) {
      if (session.title?.trim() && session.title !== 'Lane') continue;
      if (titleChecked.current.has(session.id)) continue;
      titleChecked.current.add(session.id);
      void client.message
        .list({ sessionID: session.id, order: 'asc', limit: 50 })
        .then((response) => {
          const first = response.data.find((item) => item.type === 'user');
          const title = first?.type === 'user' && first.text.trim() ? titleOf(first.text) : '';
          derivedTitles.current.set(session.id, title);
          setSessions((current) =>
            current.map((item) => (item.id === session.id ? { ...item, title } : item))
          );
        })
        .catch(() => {});
    }
  }

  async function refreshSessions() {
    try {
      const page = await loadSessions();
      setSessions(page.list);
      setSessionCursor(page.next);
      deriveTitles(page.list);
    } catch {
      // 历史列表是辅助 UI，拉取失败不影响当前会话。
    }
  }

  /** 追加下一页历史会话。 */
  async function loadMoreSessions() {
    if (!sessionCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await loadSessions(sessionCursor);
      setSessions((current) => {
        const ids = new Set(current.map((item) => item.id));
        return [...current, ...page.list.filter((item) => !ids.has(item.id))];
      });
      setSessionCursor(page.next);
      deriveTitles(page.list);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setLoadingMore(false);
    }
  }

  // 打开一个已有会话：ID、agent、消息和待回答的表单都从服务端重建。
  async function openSession(id: string, info?: SessionInfo) {
    setSessionID(id);
    setAgentID(info?.agent ?? null);
    setBlocks([]);
    setForms([]);
    setError(null);
    await reload(id);
    if (!info?.agent) {
      try {
        const detail = await client.session.get({ sessionID: id });
        setAgentID(detail.agent ?? null);
      } catch {
        // 拿不到详情时保留空 agent，服务端会用默认角色。
      }
    }
    try {
      const pending = await client.session.form.list({ sessionID: id });
      if (pending.length) setForms(pending);
    } catch {
      // 老版本服务端没有 form API 时忽略。
    }
  }

  async function createSession() {
    const session = await client.session.create({
      location: conn.directory ? { directory: conn.directory } : undefined,
    });
    await openSession(session.id, session);
    return session;
  }

  // 打开目录里最近的会话；没有历史时才新建。
  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        let list: SessionInfo[] = [];
        try {
          const page = await loadSessions();
          list = page.list;
          if (!cancelled) setSessionCursor(page.next);
        } catch {
          // 老服务端没有会话列表时直接新建。
        }
        if (cancelled) return;
        setSessions(list);
        if (list.length) await openSession(list[0].id, list[0]);
        else await createSession();
        if (cancelled) return;
        setStatus('online');
        void refreshSessions();
      } catch (cause) {
        if (cancelled) return;
        setStatus('offline');
        setError(errorText(cause));
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [client, conn.directory]);

  // 连接建立前已经产生的授权请求。
  useEffect(() => {
    let cancelled = false;

    async function loadPendingPermissions() {
      try {
        const response = await client.permission.request.list({
          location: conn.directory ? { directory: conn.directory } : undefined,
        });
        if (!cancelled && response.data.length) setQueue(response.data);
      } catch {
        // 实验性接口；服务端不提供时忽略。
      }
    }

    void loadPendingPermissions();
    return () => {
      cancelled = true;
    };
  }, [client, conn.directory]);

  // 驱动整个 UI 的唯一事件流。
  useEffect(() => {
    const controller = new AbortController();

    async function subscribe() {
      try {
        for await (const event of client.event.subscribe({ signal: controller.signal })) {
          switch (event.type) {
            case 'server.connected':
              setStatus('online');
              break;

            case 'session.agent.selected':
              if (event.data.sessionID !== sessionRef.current) break;
              setAgentID(event.data.agent);
              break;

            case 'session.execution.started':
              if (event.data.sessionID !== sessionRef.current) break;
              setBusy(true);
              setActivity('thinking');
              break;

            case 'session.text.started': {
              if (event.data.sessionID !== sessionRef.current) break;
              const id = `text:${event.data.assistantMessageID}:${event.data.ordinal}`;
              setBlocks((current) => upsert(current, { id, kind: 'text', text: '' }));
              setActivity('talking');
              break;
            }

            case 'session.text.delta': {
              if (event.data.sessionID !== sessionRef.current) break;
              const id = `text:${event.data.assistantMessageID}:${event.data.ordinal}`;
              setBlocks((current) =>
                upsert(current, {
                  id,
                  kind: 'text',
                  text:
                    (current.find((b) => b.id === id) as { text?: string } | undefined)?.text ?? '',
                })
              );
              setBlocks((current) =>
                patch(current, id, (block) =>
                  block.kind === 'text' ? { ...block, text: block.text + event.data.delta } : block
                )
              );
              setActivity('talking');
              break;
            }

            case 'session.text.ended': {
              if (event.data.sessionID !== sessionRef.current) break;
              const id = `text:${event.data.assistantMessageID}:${event.data.ordinal}`;
              setBlocks((current) => upsert(current, { id, kind: 'text', text: event.data.text }));
              setActivity('thinking');
              break;
            }

            case 'session.reasoning.started': {
              if (event.data.sessionID !== sessionRef.current) break;
              const id = `reasoning:${event.data.assistantMessageID}:${event.data.ordinal}`;
              setBlocks((current) => upsert(current, { id, kind: 'reasoning', text: '' }));
              setActivity('thinking');
              break;
            }

            case 'session.reasoning.delta': {
              if (event.data.sessionID !== sessionRef.current) break;
              const id = `reasoning:${event.data.assistantMessageID}:${event.data.ordinal}`;
              setBlocks((current) =>
                upsert(current, {
                  id,
                  kind: 'reasoning',
                  text:
                    (current.find((b) => b.id === id) as { text?: string } | undefined)?.text ?? '',
                })
              );
              setBlocks((current) =>
                patch(current, id, (block) =>
                  block.kind === 'reasoning'
                    ? { ...block, text: block.text + event.data.delta }
                    : block
                )
              );
              break;
            }

            case 'session.tool.input.started': {
              if (event.data.sessionID !== sessionRef.current) break;
              setActivity(event.data.name === 'read' ? 'reading' : 'working');
              setBlocks((current) =>
                upsert(current, {
                  id: `tool:${event.data.id}`,
                  kind: 'tool',
                  name: event.data.name,
                  status: 'running',
                  detail: '',
                })
              );
              break;
            }

            case 'session.tool.called': {
              if (event.data.sessionID !== sessionRef.current) break;
              setBlocks((current) =>
                patch(current, `tool:${event.data.id}`, (block) =>
                  block.kind === 'tool'
                    ? {
                        ...block,
                        detail: JSON.stringify(event.data.input, null, 2),
                        input: event.data.input,
                      }
                    : block
                )
              );
              break;
            }

            case 'session.tool.success': {
              if (event.data.sessionID !== sessionRef.current) break;
              setBlocks((current) =>
                patch(current, `tool:${event.data.id}`, (block) =>
                  block.kind === 'tool'
                    ? {
                        ...block,
                        status: 'ok' as ToolStatus,
                        detail: textOf(event.data.content) || block.detail,
                      }
                    : block
                )
              );
              break;
            }

            case 'session.tool.failed': {
              if (event.data.sessionID !== sessionRef.current) break;
              setBlocks((current) =>
                patch(current, `tool:${event.data.id}`, (block) =>
                  block.kind === 'tool'
                    ? {
                        ...block,
                        status: 'error' as ToolStatus,
                        detail: textOf(event.data.content) || errorText(event.data.error),
                      }
                    : block
                )
              );
              break;
            }

            case 'permission.asked':
              setActivity('thinking');
              setQueue((current) =>
                current.some((item) => item.id === event.data.id)
                  ? current
                  : [...current, { ...event.data } as PermissionRequest]
              );
              break;

            case 'permission.replied':
              setQueue((current) => current.filter((item) => item.id !== event.data.requestID));
              break;

            case 'form.created': {
              const form = event.data.form as unknown as FormInfo;
              if (form.sessionID !== sessionRef.current) break;
              setActivity('thinking');
              setForms((current) =>
                current.some((item) => item.id === form.id) ? current : [...current, form]
              );
              break;
            }

            case 'form.replied':
            case 'form.cancelled':
              setForms((current) => current.filter((item) => item.id !== event.data.id));
              break;

            // `session.idle` 只表示会话安静下来，并不稳定代表一轮结束；
            // 真正的结束信号是 execution.*，因此在这几个事件上收尾。
            case 'session.execution.succeeded':
            case 'session.execution.interrupted':
            case 'session.idle': {
              if (event.data.sessionID !== sessionRef.current) break;
              setBusy(false);
              setActivity('idle');
              await reload(event.data.sessionID);
              void refreshSessions();
              break;
            }

            case 'session.execution.failed': {
              if (event.data.sessionID !== sessionRef.current) break;
              setBusy(false);
              setActivity('idle');
              setError(JSON.stringify(event.data.error));
              await reload(event.data.sessionID);
              void refreshSessions();
              break;
            }
          }
        }
      } catch (cause) {
        if (!controller.signal.aborted) {
          setStatus('offline');
          setError(errorText(cause));
        }
      }
    }

    void subscribe();
    return () => controller.abort();
  }, [client]);

  async function selectSession(id: string) {
    if (busy || id === sessionID) return;
    try {
      await openSession(
        id,
        sessions.find((item) => item.id === id)
      );
      setStatus('online');
    } catch (cause) {
      setError(errorText(cause));
    }
  }

  async function newSession() {
    if (busy) return;
    try {
      await createSession();
      setStatus('online');
      await refreshSessions();
    } catch (cause) {
      setError(errorText(cause));
    }
  }

  async function renameSession(id: string, title: string) {
    try {
      await client.session.update({ sessionID: id, title });
      // 用户改过的标题优先于本地推导的历史标题。
      derivedTitles.current.delete(id);
      setSessions((current) => current.map((item) => (item.id === id ? { ...item, title } : item)));
    } catch (cause) {
      setError(errorText(cause));
    }
  }

  async function deleteSession(id: string) {
    try {
      await client.session.remove({ sessionID: id });
      derivedTitles.current.delete(id);
      titleChecked.current.delete(id);
      const remaining = sessions.filter((item) => item.id !== id);
      setSessions(remaining);
      if (id !== sessionID) return;
      setQueue([]);
      if (remaining.length) await openSession(remaining[0].id, remaining[0]);
      else await createSession();
      setStatus('online');
      await refreshSessions();
    } catch (cause) {
      setError(errorText(cause));
    }
  }

  async function send(text: string, skills: SkillTag[] = []) {
    const value = text.trim();
    if (!value || !sessionID || busy) return;
    // 第一条提问作为会话标题。
    const first = !blocks.some((block) => block.kind === 'user');
    setBusy(true);
    setActivity('thinking');
    setError(null);
    setBlocks((current) => [
      ...current,
      { id: `local:${Date.now()}`, kind: 'user', text: value, skills },
    ]);
    try {
      await client.session.prompt({
        sessionID,
        text: value,
        skills: skills.length ? skills.map(({ id }) => ({ id })) : undefined,
      });
      if (first) {
        const title = titleOf(value);
        setSessions((current) =>
          current.map((item) => (item.id === sessionID ? { ...item, title } : item))
        );
        void client.session.update({ sessionID, title }).catch(() => {});
      }
    } catch (cause) {
      setBusy(false);
      setError(errorText(cause));
    }
  }

  // 重新执行产生这条回答的 prompt。revert.stage 会让服务端从该 user 消息
  // 开始截断，因此新一轮会替换旧回答，而不是追加。
  async function regenerate(userMessageID: string, text: string, userBlockID: string) {
    if (!sessionID || busy) return;
    setError(null);
    setBusy(true);
    setActivity('thinking');
    setBlocks((current) => {
      const index = current.findIndex((block) => block.id === userBlockID);
      return index === -1 ? current : current.slice(0, index + 1);
    });
    try {
      await client.session.revert.stage({ sessionID, messageID: userMessageID, files: false });
      await client.session.prompt({ sessionID, text });
    } catch (cause) {
      setBusy(false);
      setError(errorText(cause));
    }
  }

  async function stop() {
    if (!sessionID) return;
    try {
      await client.session.interrupt({ sessionID });
    } catch (cause) {
      setError(errorText(cause));
    }
  }

  async function reply(decision: 'once' | 'always' | 'reject') {
    const request = queue[0];
    if (!request) return;
    setQueue((current) => current.slice(1));
    try {
      await client.permission.reply({
        sessionID: request.sessionID,
        requestID: request.id,
        decision,
      });
    } catch (cause) {
      setError(errorText(cause));
    }
  }

  async function replyForm(answer: FormAnswer) {
    const form = forms[0];
    if (!form) return;
    setFormPending(true);
    try {
      await client.session.form.reply({
        sessionID: form.sessionID,
        formID: form.id,
        answer,
      });
      setForms((current) => current.slice(1));
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setFormPending(false);
    }
  }

  async function cancelForm() {
    const form = forms[0];
    if (!form) return;
    setFormPending(true);
    try {
      await client.session.form.cancel({
        sessionID: form.sessionID,
        formID: form.id,
        message: '用户取消',
      });
      setForms((current) => current.slice(1));
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setFormPending(false);
    }
  }

  async function switchModel(model: ModelRef) {
    if (!sessionID) return;
    try {
      await client.session.switchModel({ sessionID, model });
    } catch (cause) {
      setError(errorText(cause));
    }
  }

  async function switchAgent(agent: string) {
    if (!sessionID) return;
    try {
      await client.session.switchAgent({ sessionID, agent });
      setAgentID(agent);
    } catch (cause) {
      setError(errorText(cause));
    }
  }

  return {
    sessionID,
    sessions,
    hasMore: sessionCursor !== null,
    loadingMore,
    loadMore: loadMoreSessions,
    agentID,
    blocks,
    status,
    busy,
    activity,
    queue,
    forms,
    formPending,
    error,
    clearError: () => setError(null),
    send,
    selectSession,
    newSession,
    renameSession,
    deleteSession,
    stop,
    reply,
    replyForm,
    cancelForm,
    regenerate,
    switchModel,
    switchAgent,
  };
}
