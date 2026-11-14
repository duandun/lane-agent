import { memo } from "react"
import { CodeHighlighter } from "@ant-design/x"
import {
  XMarkdown,
  type ComponentProps as MarkdownComponentProps,
} from "@ant-design/x-markdown"
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism"

// CodeHighlighter hardcodes Prism's light theme; swap in a dark one so fenced
// blocks blend with the rest of the shell.
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

// Prism names some languages differently from the fence labels models emit.
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

// The `code` component above already renders a block container for fenced
// code, so drop the <pre> wrapper instead of nesting a div inside it.
function Pre({ children }: MarkdownComponentProps) {
  return <>{children}</>
}

const components = { code: Code, pre: Pre }

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
