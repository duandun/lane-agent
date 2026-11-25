import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SessionMessageInfo } from '@opencode/client';
import type { Client } from '../lib/client';
import type { Block, StepInfo } from '../lib/blocks';
import { buildTrajectory, mergeMessagePages } from '../lib/trajectory';

const PAGE_SIZE = 200;

/**
 * 轨迹视图的消息快照：独立于聊天的 200 条窗口，用 cursor 按需加载更早页面；
 * 运行结束后把最新一页合并回来，流式尾部由 blocks 提供。
 */
export function useTrajectory(input: {
  client: Client;
  sessionID: string | null;
  blocks: Block[];
  steps: Record<string, StepInfo>;
  busy: boolean;
  revision: number;
}) {
  const { client, sessionID, blocks, steps, busy, revision } = input;
  const [messages, setMessages] = useState<SessionMessageInfo[]>([]);
  const [contextMessages, setContextMessages] = useState<SessionMessageInfo[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [ready, setReady] = useState(false);
  const wasBusy = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setMessages([]);
    setContextMessages([]);
    setCursor(null);
    setReady(false);
    wasBusy.current = false;
    if (!sessionID) return;

    void (async () => {
      try {
        const [page, context] = await Promise.all([
          client.message.list({ sessionID, order: 'desc', limit: PAGE_SIZE }),
          client.session.context({ sessionID }).catch(() => [] as SessionMessageInfo[]),
        ]);
        if (cancelled) return;
        setMessages([...page.data].reverse());
        setContextMessages(context);
        setCursor(page.cursor?.next ?? null);
      } catch {
        // 拉取失败时保留空快照，页面仍可用实时尾部展示当前运行。
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [client, sessionID, revision]);

  // 一轮执行结束后把最新一页合并回来；已加载的更早页面不受影响。
  useEffect(() => {
    if (!sessionID) return;
    if (busy) {
      wasBusy.current = true;
      return;
    }
    if (!wasBusy.current) return;
    wasBusy.current = false;
    let cancelled = false;
    void (async () => {
      try {
        const [page, context] = await Promise.all([
          client.message.list({ sessionID, order: 'desc', limit: PAGE_SIZE }),
          client.session.context({ sessionID }).catch(() => [] as SessionMessageInfo[]),
        ]);
        if (cancelled) return;
        setMessages((current) => mergeMessagePages(current, [...page.data].reverse()));
        setContextMessages(context);
      } catch {
        // 保留旧快照。
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [busy, client, sessionID]);

  const loadOlder = useCallback(async () => {
    if (!sessionID || !cursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const page = await client.message.list({
        sessionID,
        order: 'desc',
        limit: PAGE_SIZE,
        cursor,
      });
      setMessages((current) => mergeMessagePages(current, [...page.data].reverse()));
      setCursor(page.cursor?.next ?? null);
    } catch {
      // 网络失败时保留当前游标，用户可以重试。
    } finally {
      setLoadingOlder(false);
    }
  }, [client, sessionID, cursor, loadingOlder]);

  const trajectory = useMemo(
    () => buildTrajectory({ messages, steps, liveBlocks: blocks, contextMessages }),
    [messages, steps, blocks, contextMessages]
  );

  return {
    trajectory,
    messages,
    ready,
    hasMore: cursor !== null,
    loadingOlder,
    loadOlder,
  };
}
