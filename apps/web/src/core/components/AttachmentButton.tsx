import { Button, Tooltip } from 'antd';
import { PaperClipOutlined } from '@ant-design/icons';

/** 输入框左下角的附件入口，配合 useAttachments 使用。 */
export default function AttachmentButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Tooltip title="上传附件">
      <Button
        type="text"
        size="small"
        icon={<PaperClipOutlined />}
        disabled={disabled}
        onClick={onClick}
      />
    </Tooltip>
  );
}
