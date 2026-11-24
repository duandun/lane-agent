import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Badge, Card, Container, Flex, Heading, Table, Text } from '@radix-ui/themes'

export const Route = createFileRoute('/')({ component: Monitor })

type Connection = {
  id: string
  code: string | null
  rooms: string[]
  ip: string
  xff: string | null
  origin: string | null
  userAgent: string | null
  connectedAt: number | null
}

type Payload = { connections: Connection[]; count: number; updatedAt: number }

function formatDuration(from: number | null): string {
  if (!from) return '—'
  const seconds = Math.max(0, Math.floor((Date.now() - from) / 1000))
  if (seconds < 60) return `${seconds} 秒`
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟`
  return `${Math.floor(seconds / 3600)} 小时`
}

function Monitor() {
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    async function tick() {
      try {
        const res = await fetch('/api/connections')
        const payload = await res.json()
        if (!res.ok) throw new Error(payload?.error ?? `HTTP ${res.status}`)
        if (!alive) return
        setData(payload)
        setError('')
      } catch (err) {
        if (alive) setError(`获取连接失败：${(err as Error).message}`)
      }
    }
    void tick()
    const timer = setInterval(tick, 2000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [])

  return (
    <main>
      <Container size="3" px="4" py="6">
        <Flex align="center" justify="between" gap="3" wrap="wrap" mb="2">
          <Heading size="6">监控</Heading>
          <Badge size="2" color={error ? 'red' : 'green'} variant="soft">
            {error ? '连接异常' : `${data?.count ?? 0} 个连接`}
          </Badge>
        </Flex>
        <Text size="1" color="gray" as="p" mb="4">
          {data ? `每 2 秒刷新 · 更新于 ${new Date(data.updatedAt).toLocaleTimeString()}` : '加载中…'}
        </Text>

        {error && (
          <Text size="2" color="red" as="p" mb="3">
            {error}
          </Text>
        )}

        <Card size="2">
          <div className="monitor-table-wrap">
            <Table.Root size="1" variant="surface">
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeaderCell>连接</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>连接码</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>来源</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>客户端</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>已连接</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>房间</Table.ColumnHeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {data?.connections.length ? (
                  data.connections.map((connection) => (
                    <Table.Row key={connection.id} align="center">
                      <Table.Cell>
                        <Text size="1" className="font-mono">
                          {connection.id.slice(0, 8)}
                        </Text>
                      </Table.Cell>
                      <Table.Cell>
                        {connection.code ? (
                          <Badge color="indigo" variant="soft">
                            {connection.code}
                          </Badge>
                        ) : (
                          <Text size="1" color="gray">
                            —
                          </Text>
                        )}
                      </Table.Cell>
                      <Table.Cell>
                        <Flex direction="column" gap="0">
                          <Text size="1">{connection.origin ?? connection.ip}</Text>
                          <Text size="1" color="gray" className="monitor-ua">
                            {connection.xff ?? connection.ip}
                          </Text>
                        </Flex>
                      </Table.Cell>
                      <Table.Cell>
                        <Text size="1" color="gray" className="monitor-ua" title={connection.userAgent ?? ''}>
                          {connection.userAgent ?? '—'}
                        </Text>
                      </Table.Cell>
                      <Table.Cell>
                        <Text size="1">{formatDuration(connection.connectedAt)}</Text>
                      </Table.Cell>
                      <Table.Cell>
                        <Text size="1" color="gray">
                          {connection.rooms.length ? connection.rooms.join(', ') : '—'}
                        </Text>
                      </Table.Cell>
                    </Table.Row>
                  ))
                ) : (
                  <Table.Row>
                    <Table.Cell colSpan={6}>
                      <Text size="2" color="gray">
                        {data ? '当前没有连接' : '加载中…'}
                      </Text>
                    </Table.Cell>
                  </Table.Row>
                )}
              </Table.Body>
            </Table.Root>
          </div>
        </Card>
      </Container>
    </main>
  )
}
