import { memo } from "react"
import { CodeHighlighter } from "@ant-design/x"
import {
  XMarkdown,
  type ComponentProps as MarkdownComponentProps,
} from "@ant-design/x-markdown"
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism"

// CodeHighlighter 固定使用 Prism 浅色主题，这里换成暗色，
// 让代码块和外壳风格一致。
const codeTheme = {
  ...oneDark,
  'pre[class*="language-"]': {
    ...oneDark['pre[class*="language-"]'],
    background: "transparent",
    margin: 0,
  },
}

const STREAMING = { hasNextChunk: true, incremental: true } as const
const DONE = false

// Prism 的语言名和模型输出的 fence 标签不完全一致。
const LANG_ALIASES: Record<string, string> = {
  ts: "typescript",
  js: "javascript",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  md: "markdown",
  py: "python",
  rs: "rust",
  yml: "yaml",
  html: "markup",
  xml: "markup",
  dockerfile: "docker",
}

function Code({ children, lang, block, domNode, streamStatus, ...rest }: MarkdownComponentProps) {
  if (block) {
    const name = lang?.split(/\s+/)[0]
    const language = LANG_ALIASES[name ?? ""] ?? name
    return (
      <CodeHighlighter
        lang={language}
        highlightProps={{
          style: codeTheme,
          customStyle: { background: "transparent" },
        }}
      >
        {String(children ?? "")}
      </CodeHighlighter>
    )
  }
  return <code {...rest}>{children}</code>
}

// 上面的 code 组件已经为 fenced code 渲染了块级容器，
// 这里丢掉 <pre> 包装，避免再套一层 div。
function Pre({ children }: MarkdownComponentProps) {
  return <>{children}</>
}

const components = { code: Code, pre: Pre }

/** 把助手文本渲染为 Markdown；fenced code 使用暗色 Prism 主题。 */
function Markdown({ text, streaming }: { text: string; streaming?: boolean }) {
  return (
    <XMarkdown
      className="markdown"
      content={text}
      components={components}
      openLinksInNewTab
      streaming={streaming ? STREAMING : DONE}
    />
  )
}

export default memo(Markdown)
