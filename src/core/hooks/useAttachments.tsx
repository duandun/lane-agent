import { useRef, useState, type ComponentRef } from 'react';
import type { UploadFile } from 'antd';
import { Attachments } from '@ant-design/x';
import { appBridge } from '../lib/bridge';

/** 同名文件已存在时追加序号，避免覆盖工作目录里的现有文件。 */
function uniqueName(existing: Set<string>, name: string): string {
  if (!existing.has(name)) return name;
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  let index = 1;
  while (existing.has(`${base} (${index})${ext}`)) index += 1;
  return `${base} (${index})${ext}`;
}

/**
 * 附件上传：选择阶段只保留文件，发送时统一写入工作目录并返回文件清单。
 * 依赖 Electron 的 appBridge，Web 端调用方不要渲染它。
 */
export function useAttachments({ directory, disabled }: { directory: string; disabled?: boolean }) {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const attachmentsRef = useRef<ComponentRef<typeof Attachments>>(null);
  const savedNames = useRef(new Map<string, string>());
  const knownNames = useRef<Set<string> | null>(null);

  const header = (
    <Attachments
      ref={attachmentsRef}
      items={files}
      disabled={disabled}
      beforeUpload={() => false}
      onChange={({ fileList }) => setFiles(fileList)}
      // 上传入口由 AttachmentButton 触发，这里只展示已选文件卡片。
      styles={{ placeholder: { display: 'none' } }}
    />
  );

  /** 发送时把附件写入工作目录，返回要追加到 prompt 末尾的文件清单。 */
  async function commit(): Promise<string> {
    const saved: string[] = [];
    for (const item of files) {
      const file = item.originFileObj;
      if (!file) continue;
      let name = savedNames.current.get(item.uid);
      if (!name) {
        if (!appBridge || !directory) throw new Error('当前环境不支持上传附件');
        if (!knownNames.current) {
          knownNames.current = new Set(
            (await appBridge.fs.list(directory)).map((entry) => entry.name)
          );
        }
        name = uniqueName(knownNames.current, file.name);
        await appBridge.fs.writeBytes(directory, name, new Uint8Array(await file.arrayBuffer()));
        knownNames.current.add(name);
        savedNames.current.set(item.uid, name);
      }
      saved.push(name);
    }
    return saved.length
      ? `\n\n已上传到工作目录：${saved.map((name) => `\`${name}\``).join('、')}`
      : '';
  }

  function clear() {
    setFiles([]);
    savedNames.current.clear();
  }

  return {
    header,
    open: () => attachmentsRef.current?.select({ multiple: true }),
    commit,
    clear,
  };
}
