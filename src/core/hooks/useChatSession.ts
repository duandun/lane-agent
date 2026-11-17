import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormAnswer, FormInfo, PermissionRequest } from '@opencode/client';
import type { Client, Conn } from '../lib/client';
import { blocksFromMessages, patch, upsert, type Block, type ToolStatus } from '../lib/blocks';
import { errorText } from '../lib/error';

export type ChatStatus = 'connecting' | 'online' | 'offline';

/** 一轮执行中 agent 正在做什么，用来驱动伙伴动画。 */
export type AgentActivity = 'idle' | 'thinking' | 'talking' | 'working';

export type ModelRef = { providerID: string; id: string };

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

  const reload = useCallback(
    async (id: string) => {
      const response = await client.message.list({ sessionID: id, order: 'asc', limit: 200 });
      setBlocks(blocksFromMessages(response.data));
    },
    [client]
  );

  // 在所选目录里创建会话。
  useEffect(() => {
    let cancelled = false;

    async function createSession() {
      try {
        const session = await client.session.create({
          title: 'Web session',
          location: conn.directory ? { directory: conn.directory } : undefined,
        });
        if (cancelled) return;
        setSessionID(session.id);
        setStatus('online');
        await reload(session.id);
        try {
          const pending = await client.session.form.list({ sessionID: session.id });
          if (!cancelled && pending.length) setForms(pending);
        } catch {
          // 老版本服务端没有 form API 时忽略。
        }
      } catch (cause) {
        if (cancelled) return;
        setStatus('offline');
        setError(errorText(cause));
      }
    }

    void createSession();
    return () => {
      cancelled = true;
    };
  }, [client, conn.directory, reload]);

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
              setActivity('working');
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
                    ? { ...block, detail: JSON.stringify(event.data.input, null, 2) }
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
              break;
            }

            case 'session.execution.failed': {
              if (event.data.sessionID !== sessionRef.current) break;
              setBusy(false);
              setActivity('idle');
              setError(JSON.stringify(event.data.error));
              await reload(event.data.sessionID);
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
  }, [client, reload]);

  async function send(text: string, skills: string[] = []) {
    const value = text.trim();
    if (!value || !sessionID || busy) return;
    setBusy(true);
    setActivity('thinking');
    setError(null);
    setBlocks((current) => [...current, { id: `local:${Date.now()}`, kind: 'user', text: value }]);
    try {
      await client.session.prompt({
        sessionID,
        text: value,
        skills: skills.length ? skills.map((id) => ({ id })) : undefined,
      });
    } catch (cause) {
      setBusy(false);
      setError(errorText(cause));
    }
  }

  // 重新执行产生这条回答的 prompt。revert.stage 会让服务端从该 user 消息
  // 开始截断，因此新一轮会替换旧回答，而不是追加。
  const regenerate = useCallback(
    async (userMessageID: string, text: string, userBlockID: string) => {
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
    },
    [busy, client, sessionID]
  );

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

  const switchModel = useCallback(
    async (model: ModelRef) => {
      if (!sessionID) return;
      try {
        await client.session.switchModel({ sessionID, model });
      } catch (cause) {
        setError(errorText(cause));
      }
    },
    [client, sessionID]
  );

  return {
    sessionID,
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
    stop,
    reply,
    replyForm,
    cancelForm,
    regenerate,
    switchModel,
  };
}
