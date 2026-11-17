import { useState } from 'react';
import { Alert, Avatar, Button, Card, Flex, Form, Input, Typography } from 'antd';
import { Welcome } from '@ant-design/x';
import { ApiOutlined, LockOutlined, FolderOpenOutlined, LinkOutlined } from '@ant-design/icons';
import { appBridge } from '@core/lib/bridge';
import { makeClient, type Conn } from '@core/lib/client';
import { errorText } from '@core/lib/error';

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
  const [bridgeChecking, setBridgeChecking] = useState(false);
  const [bridgeResult, setBridgeResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function checkBridge() {
    if (!appBridge) return;
    setBridgeChecking(true);
    try {
      const [pong, info] = await Promise.all([appBridge.ping(), appBridge.info()]);
      setBridgeResult({
        ok: true,
        text: `${pong} · Electron ${info.versions.electron} · Node ${info.versions.node} · ${info.platform}/${info.arch}`,
      });
    } catch (cause) {
      setBridgeResult({ ok: false, text: errorText(cause) });
    } finally {
      setBridgeChecking(false);
    }
  }

  async function submit(values: Conn) {
    const next: Conn = {
      baseUrl: values.baseUrl.trim(),
      password: values.password ?? '',
      directory: (values.directory ?? '').trim(),
    };

    setPending(true);
    setError(null);
    try {
      const info = await makeClient(next).server.info();
      if (!next.directory) {
        setError(`已连接 v${info.version}，但请填写项目目录（服务器上的绝对路径）`);
        return;
      }
      onConnect(next);
    } catch (cause) {
      setError(`${errorText(cause)}（检查地址、OPENCODE_PASSWORD、CORS）`);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="connect">
      <Card className="connect-card" variant="borderless">
        <Welcome
          variant="borderless"
          icon={
            <Avatar
              size={52}
              icon={<ApiOutlined />}
              style={{ background: 'linear-gradient(135deg, #4f8cff, #7c5cff)' }}
            />
          }
          title="OpenCode Web"
          description="浏览器端的 OpenCode agent 外壳。连接你自己启动的 opencode serve。"
        />

        <Form
          form={form}
          layout="vertical"
          initialValues={initial}
          requiredMark={false}
          onFinish={(values) => void submit(values)}
        >
          <Form.Item
            name="baseUrl"
            label="服务地址"
            rules={[{ required: true, message: '请填写服务地址' }]}
          >
            <Input
              prefix={<LinkOutlined />}
              placeholder="http://127.0.0.1:4096"
              autoComplete="url"
            />
          </Form.Item>

          <Form.Item name="password" label="密码（OPENCODE_PASSWORD）">
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="留空表示服务器未设密码"
              autoComplete="current-password"
            />
          </Form.Item>

          <Form.Item
            name="directory"
            label="项目目录（服务器上的绝对路径）"
            extra="agent 会在这个目录里读写文件、执行命令。"
          >
            <Input
              prefix={<FolderOpenOutlined />}
              placeholder="/Users/cr/opencode-workspace"
              disabled
            />
          </Form.Item>

          {error && (
            <Alert
              className="connect-error"
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

      <Card className="connect-hint" size="small" variant="borderless">
        <Typography.Text type="secondary" className="small">
          先在终端启动服务
        </Typography.Text>
        <pre>{`OPENCODE_PASSWORD=your-secret \\
  opencode serve --hostname 0.0.0.0 --port 4096 --cors https://ai.cr123.life`}</pre>
      </Card>

      {appBridge && (
        <Card className="connect-hint" size="small" variant="borderless">
          <Flex align="center" justify="space-between" gap={8}>
            <Typography.Text type="secondary" className="small">
              App 通道
            </Typography.Text>
            <Button size="small" loading={bridgeChecking} onClick={() => void checkBridge()}>
              检测 IPC
            </Button>
          </Flex>
          {bridgeResult && (
            <Typography.Text
              className="bridge-result small"
              type={bridgeResult.ok ? 'success' : 'danger'}
            >
              {bridgeResult.ok ? `正常：${bridgeResult.text}` : `失败：${bridgeResult.text}`}
            </Typography.Text>
          )}
        </Card>
      )}
    </div>
  );
}
