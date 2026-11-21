import { FileIcon } from '@radix-ui/react-icons';
import { IconButton, Tooltip } from '@radix-ui/themes';

/** 输入框左下角的附件入口，配合 useAttachments 使用。 */
export default function AttachmentButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Tooltip content="上传附件">
      <IconButton
        size="1"
        variant="ghost"
        color="gray"
        aria-label="上传附件"
        disabled={disabled}
        onClick={onClick}
      >
        <FileIcon />
      </IconButton>
    </Tooltip>
  );
}
