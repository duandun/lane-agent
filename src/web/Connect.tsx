import { useEffect, useState } from 'react';
import { Cross2Icon, FileIcon, Link2Icon, LockClosedIcon } from '@radix-ui/react-icons';
import { Button, Callout, Card, Flex, IconButton, Text, TextField } from '@radix-ui/themes';
import { Welcome } from '@ant-design/x';
import { appBridge } from '@core/lib/bridge';
import { DEFAULT_CONN, makeClient, type Conn } from '@core/lib/client';
import { errorText } from '@core/lib/error';
import Field from '@core/components/Field';
import laneIcon from '@assets/favicon.svg';

/** 连接表单：先用 Basic Auth 校验服务端，通过后再保存 Conn。 */
export default function Connect({
  initial,
  onConnect,
}: {
  initial: Conn;
  onConnect: (conn: Conn) => void;
}) {
  // Web 端不能选择本机目录，固定用默认工作区。
  const [values, setValues] = useState<Conn>(
    appBridge ? initial : { ...initial, directory: DEFAULT_CONN.directory }
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Electron 端会启动内置 CLI 的本地服务；没有保存过其它地址时自动填上。
  useEffect(() => {
    if (!appBridge) return;
    let alive = true;
    void appBridge.localService().then((service) => {
      if (!alive || !service) return;
      setValues((current) => {
        if (current.baseUrl && current.baseUrl !== DEFAULT_CONN.baseUrl) return current;
        return { ...current, baseUrl: service.url, password: service.password };
      });
    });
    return () => {
      alive = false;
    };
  }, []);

  async function pickDirectory() {
    if (!appBridge) return;
    const path = await appBridge.selectDirectory();
    if (path) setValues((current) => ({ ...current, directory: path }));
  }

  async function submit() {
    const next: Conn = {
      baseUrl: values.baseUrl.trim(),
      password: values.password ?? '',
      directory: appBridge ? (values.directory ?? '').trim() : DEFAULT_CONN.directory,
    };

    if (!next.baseUrl) {
      setError('请填写服务地址');
      return;
    }

    setPending(true);
    setError(null);
    try {
      const info = await makeClient(next).server.info();
      if (!next.directory) {
        setError(`已连接 v${info.version}，但请填写项目目录`);
        return;
      }
      onConnect(next);
    } catch (cause) {
      setError(`${errorText(cause)}${appBridge ? '' : '（检查地址、OPENCODE_PASSWORD、CORS）'}`);
    } finally {
      setPending(false);
    }
  }

  function enter(event: React.KeyboardEvent) {
    if (event.key === 'Enter') void submit();
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 py-8">
      <Card size="3" className="w-full max-w-[480px]">
        <Flex direction="column" gap="4">
          <Welcome
            variant="borderless"
            icon={<img src={laneIcon} alt="Lane" width={52} height={52} />}
            title="Lane"
            description={
              appBridge
                ? '桌面端 AI agent。服务由应用在本机启动。'
                : '浏览器端的 AI agent 外壳。连接你自己启动的 opencode serve。'
            }
          />

          {!appBridge && (
            <>
              <Field label="服务地址">
                <TextField.Root
                  value={values.baseUrl}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, baseUrl: event.target.value }))
                  }
                  onKeyDown={enter}
                  placeholder="http://127.0.0.1:4096"
                  autoComplete="url"
                >
                  <TextField.Slot>
                    <Link2Icon />
                  </TextField.Slot>
                </TextField.Root>
              </Field>

              <Field label="密码（OPENCODE_PASSWORD）">
                <TextField.Root
                  type="password"
                  value={values.password}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, password: event.target.value }))
                  }
                  onKeyDown={enter}
                  placeholder="留空表示服务器未设密码"
                  autoComplete="current-password"
                >
                  <TextField.Slot>
                    <LockClosedIcon />
                  </TextField.Slot>
                </TextField.Root>
              </Field>
            </>
          )}

          <Field label="项目目录">
            <TextField.Root
              value={values.directory}
              onChange={(event) =>
                setValues((current) => ({ ...current, directory: event.target.value }))
              }
              onKeyDown={enter}
              placeholder="/Users/cr/opencode-workspace"
              disabled={!appBridge}
            >
              <TextField.Slot>
                <FileIcon />
              </TextField.Slot>
              {appBridge && (
                <TextField.Slot side="right">
                  <Button variant="soft" size="1" onClick={() => void pickDirectory()}>
                    选择
                  </Button>
                </TextField.Slot>
              )}
            </TextField.Root>
          </Field>

          <Text size="1" color="gray">
            agent 会在这个目录里读写文件、执行命令。
          </Text>

          {error && (
            <Callout.Root color="red" size="1" className="pr-8">
              <Callout.Text>{error}</Callout.Text>
              <IconButton
                size="1"
                variant="ghost"
                color="gray"
                aria-label="关闭"
                className="absolute top-1 right-1"
                onClick={() => setError(null)}
              >
                <Cross2Icon />
              </IconButton>
            </Callout.Root>
          )}

          <Button size="3" loading={pending} onClick={() => void submit()}>
            连接
          </Button>
        </Flex>
      </Card>

      {!appBridge && (
        <Card size="2" className="w-full max-w-[480px]">
          <Flex direction="column" gap="2">
            <Text size="1" color="gray">
              先在终端启动服务
            </Text>
            <pre className="m-0 overflow-x-auto font-mono text-xs leading-[1.7] text-(--muted)">{`OPENCODE_PASSWORD=your-secret \\
  opencode serve --hostname 0.0.0.0 --port 4096 --cors https://ai.cr123.life`}</pre>
          </Flex>
        </Card>
      )}
    </div>
  );
}
