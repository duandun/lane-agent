import { describe, expect, it } from 'vitest';
import type { Client } from '@core/lib/client';
import { LANE_IDENTITY_PATH, seedLaneIdentity } from '@core/lib/opencodeConfig';

/** 内存文件系统，记录调用顺序，模拟 opencode 的 file / location API。 */
function fakeClient(files: Record<string, string>) {
  const calls: string[] = [];
  const client = {
    file: {
      read: async ({ path }: { path: string }) => {
        calls.push(`read:${path}`);
        const text = files[path];
        if (text === undefined) {
          throw Object.assign(new Error(`missing ${path}`), { name: 'FileNotFoundError' });
        }
        return new TextEncoder().encode(text);
      },
      write: async ({ path, payload }: { path: string; payload: Uint8Array }) => {
        calls.push(`write:${path}`);
        files[path] = new TextDecoder().decode(payload);
        return { path };
      },
    },
    location: {
      reload: async () => {
        calls.push('reload');
      },
    },
  };
  return { client: client as unknown as Client, calls };
}

describe('seedLaneIdentity', () => {
  it('先写身份文件再追加 instructions 并 reload', async () => {
    const files: Record<string, string> = {};
    const { client, calls } = fakeClient(files);

    await seedLaneIdentity(client, '/work');

    expect(files[LANE_IDENTITY_PATH]).toContain('Lane');
    expect(JSON.parse(files['opencode.json']).instructions).toEqual([LANE_IDENTITY_PATH]);
    expect(calls.indexOf(`write:${LANE_IDENTITY_PATH}`)).toBeLessThan(calls.indexOf('reload'));
  });

  it('保留已有 instructions 和用户改过的身份文件', async () => {
    const files: Record<string, string> = {
      'opencode.json': JSON.stringify({ instructions: ['./team.md', LANE_IDENTITY_PATH] }),
      [LANE_IDENTITY_PATH]: '自定义介绍',
    };
    const { client, calls } = fakeClient(files);

    await seedLaneIdentity(client, '/work');

    expect(JSON.parse(files['opencode.json']).instructions).toEqual([
      './team.md',
      LANE_IDENTITY_PATH,
    ]);
    expect(files[LANE_IDENTITY_PATH]).toBe('自定义介绍');
    expect(calls).not.toContain('reload');
  });
});
