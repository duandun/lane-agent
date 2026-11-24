import { EVENTS } from '@lane/protocol'
import type { PhoneForm, PhoneFormValue, PhoneMessage } from '@lane/protocol'
import QuestionPrompt from '../components/QuestionPrompt'
import { createFileRoute } from '@tanstack/react-router'
import React, { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { io, type Socket } from 'socket.io-client'
import {
  Badge,
  Button,
  Card,
  Container,
  Flex,
  Heading,
  ScrollArea,
  Separator,
  Text,
  TextArea,
} from '@radix-ui/themes'

export const Route = createFileRoute('/phone')({ component: Phone })

function Phone() {
  const [code, setCode] = useState('')
  const [messages, setMessages] = useState<PhoneMessage[]>([])
  const [form, setForm] = useState<PhoneForm | null>(null)
  const [connected, setConnected] = useState(false)
  const [working, setWorking] = useState(false)
  const [text, setText] = useState('')
  const [status, setStatus] = useState('')
  const [lanOrigins, setLanOrigins] = useState<string[]>([])
  const [lanToken, setLanToken] = useState('')
  const [transport, setTransport] = useState<'lan' | 'relay' | null>(null)
  const socketRef = useRef<Socket | null>(null)
  const endRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setCode(params.get('code')?.trim() ?? '')
    setLanToken(params.get('token') ?? '')
    setLanOrigins(
      (params.get('lan') ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    )
  }, [])

  useEffect(() => {
    if (!code) return
    let disposed = false
    let current: Socket | null = null
    let fellBack = false

    function attach(socket: Socket, kind: 'lan' | 'relay') {
      current = socket
      socketRef.current = socket
      setTransport(kind)
      const onConnect = () => {
        setConnected(true)
        socket.emit(EVENTS.phoneJoin, { code })
        // 加入房间后请 agent 补一次当前对话。
        socket.emit(EVENTS.agentSync, { code })
      }
      // 局域网 socket 在探测成功后才 attach，此时已经连上，不会再触发 connect。
      if (socket.connected) onConnect()
      else socket.on('connect', onConnect)
      socket.on('disconnect', () => {
        setConnected(false)
        setWorking(false)
        if (kind === 'lan' && !disposed && !fellBack) {
          fellBack = true
          socket.disconnect()
          attachRelay()
        }
      })
      socket.on(EVENTS.agentMessages, (payload: { messages?: PhoneMessage[]; working?: boolean }) => {
        setMessages(payload.messages ?? [])
        setWorking(payload.working === true)
      })
      socket.on(EVENTS.agentForm, (payload: { form?: PhoneForm | null }) => {
        const next = payload?.form
        const ok =
          next &&
          typeof next.id === 'string' &&
          Array.isArray(next.fields) &&
          next.fields.every(
            (field) => field && typeof field.key === 'string' && typeof field.type === 'string'
          )
        setForm(ok ? next : null)
      })
    }

    function attachRelay() {
      if (disposed) return
      attach(io(), 'relay')
    }

    async function connectLan() {
      for (const origin of lanOrigins) {
        if (disposed) return
        const socket = io(origin, {
          transports: ['websocket'],
          auth: { token: lanToken },
          reconnection: false,
          timeout: 1200,
        })
        const ok = await new Promise<boolean>((resolve) => {
          const timer = setTimeout(() => resolve(false), 1600)
          socket.once('connect', () => {
            clearTimeout(timer)
            resolve(true)
          })
          socket.once('connect_error', () => {
            clearTimeout(timer)
            resolve(false)
          })
        })
        if (ok && !disposed) {
          attach(socket, 'lan')
          return
        }
        socket.close()
      }
      attachRelay()
    }

    if (lanOrigins.length && lanToken) void connectLan()
    else attachRelay()

    return () => {
      disposed = true
      current?.disconnect()
      socketRef.current = null
    }
  }, [code, lanOrigins, lanToken])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages, working])

  function send(e: React.FormEvent) {
    e.preventDefault()
    const msg = text.trim()
    if (!msg || !code || working) return
    const socket = socketRef.current
    if (!socket?.connected) {
      setStatus('连接未就绪，请稍候')
      return
    }
    socket.emit(EVENTS.chatMessage, { msg, code })
    setText('')
    setStatus('已发送，等待 agent 处理')
  }

  function replyForm(answer: Record<string, PhoneFormValue>) {
    if (!form) return
    socketRef.current?.emit(EVENTS.formAnswer, { code, formID: form.id, answer })
  }

  function cancelForm() {
    if (!form) return
    socketRef.current?.emit(EVENTS.formAnswer, { code, formID: form.id, cancel: true })
  }

  const isError = status.includes('失败')

  return (
    <main>
      <Container size="2" px="4" py="6">
        <Flex align="center" justify="between" gap="3" wrap="wrap" mb="2">
          <Heading size="6">手机对话</Heading>
          <Badge size="2" color={connected ? 'green' : 'gray'} variant="soft">
            {connected
              ? `已连接 · ${transport === 'lan' ? '局域网' : '中继'}`
              : code
                ? '连接中…'
                : '缺少连接码'}
          </Badge>
        </Flex>
        <Text size="2" color="gray" as="p" mb="4">
          {code ? `连接码：${code}` : '请从 agent 端点击「手机连接」后扫码进入'}
        </Text>

        <Card size="2">
          <ScrollArea className="phone-scroll">
            <Flex direction="column" gap="2" pr="3">
              {messages.length === 0 ? (
                <Flex align="center" justify="center" py="8">
                  <Text size="2" color="gray">
                    等待 agent 输出…
                  </Text>
                </Flex>
              ) : (
                messages.map((message, index) => (
                  <div key={`${index}-${message.role}`} className={`phone-row ${message.role}`}>
                    <div className="phone-bubble">
                      {message.role === 'assistant' ? (
                        <div className="phone-markdown">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              a: ({ node: _node, ...props }) => (
                                <a {...props} target="_blank" rel="noreferrer" />
                              ),
                            }}
                          >
                            {message.text}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <Text size="2" as="div">
                          {message.text}
                        </Text>
                      )}
                    </div>
                  </div>
                ))
              )}
              {working && (
                <div className="phone-working">
                  <span className="dot" />
                  <span className="dot" />
                  <span className="dot" />
                  <Text size="1" color="gray">
                    Agent 正在工作…
                  </Text>
                </div>
              )}
              <div ref={endRef} />
            </Flex>
          </ScrollArea>

          <Separator size="4" my="3" />

          {form ? (
            <QuestionPrompt form={form} onReply={replyForm} onCancel={cancelForm} />
          ) : (
            <form onSubmit={send}>
              <Flex direction="column" gap="2">
                <TextArea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  autoComplete="off"
                  placeholder={code ? '给 agent 发消息' : '缺少连接码'}
                  rows={2}
                  resize="vertical"
                  disabled={!code}
                />
                <Flex align="center" justify="between" gap="3" wrap="wrap">
                  <Text size="2" color={isError ? 'red' : 'gray'}>
                    {status}
                  </Text>
                  <Button
                    type="submit"
                    disabled={!text.trim() || !code || working}
                  >
                    发送
                  </Button>
                </Flex>
              </Flex>
            </form>
          )}
        </Card>
      </Container>
    </main>
  )
}
