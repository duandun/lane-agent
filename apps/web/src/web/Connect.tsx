import { useEffect, useState } from 'react';
import { Alert, Button, Card, Form, Input, Typography } from 'antd';
import { Welcome } from '@ant-design/x';
import { LockOutlined, FolderOpenOutlined, LinkOutlined } from '@ant-design/icons';
import { appBridge } from '@core/lib/bridge';
import { DEFAULT_CONN, makeClient, type Conn } from '@core/lib/client';
import { errorText } from '@core/lib/error';
import laneIcon from '@assets/favicon.svg';

/** 连接表单：先用 Basic Auth 校验服务端，通过后再保存 Conn。 */
export default function Connect({
  initial,
  onConnect,
}: {
  initial: Conn;
  onConnect: (conn: Conn) => void;
}) {
  const [form] = Form.useForm<Conn>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Electron 端会启动内置 CLI 的本地服务；没有保存过其它地址时自动填上。
  useEffect(() => {
    if (!appBridge) return;
    let alive = true;
    appBridge.localService().then((service) => {
      if (!alive || !service) return;
      const current = String(form.getFieldValue('baseUrl') ?? '');
      if (current && current !== DEFAULT_CONN.baseUrl) return;
      form.setFieldsValue({ baseUrl: service.url, password: service.password });
    });
    return () => {
      alive = false;
    };
  }, [form]);

  async function pickDirectory() {
    if (!appBridge) return;
    const path = await appBridge.selectDirectory();
    if (path) form.setFieldValue('directory', path);
  }

  async function submit(values: Conn) {
    const next: Conn = {
      baseUrl: values.baseUrl.trim(),
      password: values.password ?? '',
      directory: appBridge ? (values.directory ?? '').trim() : DEFAULT_CONN.directory,
    };

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

  // Web 端不能选择本机目录，固定用默认工作区。
  const initialValues: Conn = appBridge
    ? initial
    : { ...initial, directory: DEFAULT_CONN.directory };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 py-8">
      <Card
        className="w-full max-w-[480px] border! border-(--line)! bg-(--panel)! [&_.ant-form]:mt-5! [&_.ant-form-item-label>label]:text-(--muted)! [&_.ant-welcome]:pb-2! [&_.ant-welcome]:pt-1!"
        variant="borderless"
      >
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

        <Form
          form={form}
          layout="vertical"
          initialValues={initialValues}
          requiredMark={false}
          onFinish={(values) => void submit(values)}
        >
          <Form.Item
            name="baseUrl"
            label="服务地址"
            rules={[{ required: true, message: '请填写服务地址' }]}
            hidden={!!appBridge}
          >
            <Input
              prefix={<LinkOutlined />}
              placeholder="http://127.0.0.1:4096"
              autoComplete="url"
            />
          </Form.Item>

          <Form.Item name="password" label="密码（OPENCODE_PASSWORD）" hidden={!!appBridge}>
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="留空表示服务器未设密码"
              autoComplete="current-password"
            />
          </Form.Item>

          <Form.Item
            name="directory"
            label="项目目录"
            extra="agent 会在这个目录里读写文件、执行命令。"
          >
            <Input
              prefix={<FolderOpenOutlined />}
              placeholder="/Users/cr/opencode-workspace"
              disabled={!appBridge}
              suffix={
                appBridge ? (
                  <Button variant="filled" size="small" onClick={() => void pickDirectory()}>
                    选择
                  </Button>
                ) : undefined
              }
            />
          </Form.Item>

          {error && (
            <Alert
              className="mb-4"
              type="error"
              showIcon
              title={error}
              closable={{ onClose: () => setError(null) }}
            />
          )}

          <Button type="primary" htmlType="submit" block size="large" loading={pending}>
            连接
          </Button>
        </Form>
      </Card>

      {!appBridge && (
        <Card
          className="w-full max-w-[480px] border! border-(--line)! bg-(--panel)! [&_.ant-card-body]:grid! [&_.ant-card-body]:gap-2!"
          size="small"
          variant="borderless"
        >
          <Typography.Text type="secondary" className="text-xs!">
            先在终端启动服务
          </Typography.Text>
          <pre className="m-0 overflow-x-auto font-mono text-xs leading-[1.7] text-(--muted)">{`OPENCODE_PASSWORD=your-secret \\
  opencode serve --hostname 0.0.0.0 --port 4096 --cors https://ai.cr123.life`}</pre>
        </Card>
      )}
    </div>
  );
}
