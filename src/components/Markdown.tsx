import { memo } from 'react';
import { Actions } from '@ant-design/x';
import { XMarkdown, type ComponentProps as MarkdownComponentProps } from '@ant-design/x-markdown';
import SyntaxHighlighter from 'react-syntax-highlighter/dist/esm/prism-light';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { codeLanguage } from '../lib/prism';

// 代码块统一用暗色主题，和外壳风格一致。
const codeTheme = {
  ...oneDark,
  'pre[class*="language-"]': {
    ...oneDark['pre[class*="language-"]'],
    background: 'transparent',
    margin: 0,
  },
};

const STREAMING = { hasNextChunk: true, incremental: true } as const;
const DONE = false;

function Code({ children, lang, block, domNode, streamStatus, ...rest }: MarkdownComponentProps) {
  if (!block) {
    return <code {...rest}>{children}</code>;
  }
  const language = codeLanguage(lang?.split(/\s+/)[0]);
  const text = String(children ?? '').replace(/\n$/, '');
  return (
    <div className="code-block">
      <div className="code-block-header">
        <span>{language}</span>
        <Actions.Copy text={text} />
      </div>
      <div className="code-block-body">
        <SyntaxHighlighter
          language={language}
          codeTagProps={{ style: { background: 'transparent' } }}
          style={codeTheme}
          customStyle={{ background: 'transparent', margin: 0, padding: 12 }}
        >
          {text}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}

// 流式输出每个 chunk 都会重渲染整棵 Markdown；代码没变就不必重新高亮。
const MemoCode = memo(
  Code,
  (prev, next) =>
    prev.children === next.children && prev.lang === next.lang && prev.block === next.block
);

// 上面的 code 组件已经为 fenced code 渲染了块级容器，
// 这里丢掉 <pre> 包装，避免再套一层 div。
function Pre({ children }: MarkdownComponentProps) {
  return <>{children}</>;
}

const components = { code: MemoCode, pre: Pre };

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
  );
}

export default memo(Markdown);
