import type { ReactNode } from 'react';
import { Flex, Text } from '@radix-ui/themes';

/** 表单弹窗里的「标签 + 控件」组合。 */
export default function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <Flex direction="column" gap="1">
      <Text size="1" color="gray">
        {label}
      </Text>
      {children}
    </Flex>
  );
}
