import { useEffect, useState } from 'react';
import { App as AntdApp, Button, Modal, Typography } from 'antd';
import { MobileOutlined } from '@ant-design/icons';
import { errorText } from '../lib/error';
import { requestPhonePairing, type PhonePairing } from '../lib/phone';
import { subscribePhoneMessages } from '../lib/socket';

/**
 * 手机连接：向 lane-serve 申请一次性配对码，展示二维码；
 * 广播消息的订阅和连接码校验统一在 lib/socket.ts 里完成。
 */
export default function PhoneConnect({ onMessage }: { onMessage: (text: string) => void }) {
  const { message } = AntdApp.useApp();
  const [open, setOpen] = useState(false);
  const [pairing, setPairing] = useState(false);
  const [pair, setPair] = useState<PhonePairing | null>(null);

  useEffect(() => subscribePhoneMessages(onMessage), [onMessage]);

  async function connect() {
    if (pairing) return;
    setPairing(true);
    try {
      const data = await requestPhonePairing();
      setPair(data);
      setOpen(true);
    } catch (cause) {
      message.error(`手机连接失败：${errorText(cause)}`);
    } finally {
      setPairing(false);
    }
  }

  return (
    <>
      <Button
        type="text"
        icon={<MobileOutlined />}
        loading={pairing}
        onClick={() => void connect()}
      >
        <span className="max-sm:hidden">手机连接</span>
      </Button>

      <Modal
        title="手机连接"
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        width={340}
        centered
        destroyOnHidden
      >
        {pair && (
          <div className="flex flex-col items-center gap-3 py-2">
            <img
              src={pair.qr}
              alt="手机连接二维码"
              className="h-[260px] w-[260px] rounded-lg bg-white p-2"
            />
            <Typography.Text type="secondary" className="text-xs!">
              连接码：<span className="font-mono">{pair.code}</span>
            </Typography.Text>
            <Typography.Text type="secondary" className="text-center text-xs!">
              用手机扫码打开手机对话页。之后的消息会携带该连接码，不匹配的消息会被忽略。
            </Typography.Text>
          </div>
        )}
      </Modal>
    </>
  );
}
