import { Badge, Button, Code, Dialog, Flex, ScrollArea, Text } from '@radix-ui/themes';
import type { PermissionRequest } from '@opencode/client';

/** 待处理工具授权请求的弹窗；队列数量显示在标题里。 */
export default function PermissionModal({
  request,
  count,
  onReply,
}: {
  request?: PermissionRequest;
  count: number;
  onReply: (decision: 'once' | 'always' | 'reject') => void;
}) {
  return (
    <Dialog.Root open={!!request}>
      <Dialog.Content
        maxWidth="520px"
        aria-describedby={undefined}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <Flex align="center" gap="2">
          <Dialog.Title>需要授权</Dialog.Title>
          {count > 1 && <Badge color="blue">{count} 个待处理</Badge>}
        </Flex>
        <Flex direction="column" gap="3" mt="3">
          <Text size="2" color="gray">
            {request?.message ?? `工具请求执行 ${request?.action ?? ''}`}
          </Text>
          {request && <Code>{request.action}</Code>}
          {!!request?.resources.length && (
            <ScrollArea type="auto" style={{ maxHeight: 200 }}>
              <Flex direction="column" gap="2">
                {request.resources.map((resource) => (
                  <Code key={resource} variant="soft" className="break-all">
                    {resource}
                  </Code>
                ))}
              </Flex>
            </ScrollArea>
          )}
        </Flex>
        <Flex justify="end" gap="2" mt="4">
          <Button color="red" variant="soft" onClick={() => onReply('reject')}>
            拒绝
          </Button>
          <Button variant="soft" color="gray" onClick={() => onReply('once')}>
            仅本次
          </Button>
          <Button onClick={() => onReply('always')}>总是允许</Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
