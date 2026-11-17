import type { ReactNode } from 'react';
import { Flex, Typography } from 'antd';

/** 表单弹窗里的「标签 + 控件」组合。 */
export default function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <Flex vertical gap={6}>
      <Typography.Text type="secondary" className="text-xs!">
        {label}
      </Typography.Text>
      {children}
    </Flex>
  );
}
