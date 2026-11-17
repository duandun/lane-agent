import SyntaxHighlighter from 'react-syntax-highlighter/dist/esm/prism-light';
import { refractor } from 'refractor/core';
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash';
import c from 'react-syntax-highlighter/dist/esm/languages/prism/c';
import cpp from 'react-syntax-highlighter/dist/esm/languages/prism/cpp';
import css from 'react-syntax-highlighter/dist/esm/languages/prism/css';
import diff from 'react-syntax-highlighter/dist/esm/languages/prism/diff';
import docker from 'react-syntax-highlighter/dist/esm/languages/prism/docker';
import go from 'react-syntax-highlighter/dist/esm/languages/prism/go';
import ini from 'react-syntax-highlighter/dist/esm/languages/prism/ini';
import java from 'react-syntax-highlighter/dist/esm/languages/prism/java';
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript';
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json';
import jsx from 'react-syntax-highlighter/dist/esm/languages/prism/jsx';
import kotlin from 'react-syntax-highlighter/dist/esm/languages/prism/kotlin';
import less from 'react-syntax-highlighter/dist/esm/languages/prism/less';
import lua from 'react-syntax-highlighter/dist/esm/languages/prism/lua';
import markdown from 'react-syntax-highlighter/dist/esm/languages/prism/markdown';
import markup from 'react-syntax-highlighter/dist/esm/languages/prism/markup';
import nginx from 'react-syntax-highlighter/dist/esm/languages/prism/nginx';
import powershell from 'react-syntax-highlighter/dist/esm/languages/prism/powershell';
import protobuf from 'react-syntax-highlighter/dist/esm/languages/prism/protobuf';
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python';
import rust from 'react-syntax-highlighter/dist/esm/languages/prism/rust';
import scss from 'react-syntax-highlighter/dist/esm/languages/prism/scss';
import sql from 'react-syntax-highlighter/dist/esm/languages/prism/sql';
import swift from 'react-syntax-highlighter/dist/esm/languages/prism/swift';
import tsx from 'react-syntax-highlighter/dist/esm/languages/prism/tsx';
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript';
import yaml from 'react-syntax-highlighter/dist/esm/languages/prism/yaml';

// 只注册常用的 Prism 语言：完整 Prism 含 297 种语言，约 570KB。
// 其它语言回落到 plaintext，不影响代码块结构。
const LANGUAGES = [
  bash,
  c,
  cpp,
  css,
  diff,
  docker,
  go,
  ini,
  java,
  javascript,
  json,
  jsx,
  kotlin,
  less,
  lua,
  markdown,
  markup,
  nginx,
  powershell,
  protobuf,
  python,
  rust,
  scss,
  sql,
  swift,
  tsx,
  typescript,
  yaml,
];

for (const language of LANGUAGES) {
  SyntaxHighlighter.registerLanguage(language.displayName, language);
}

// Prism 自带大部分别名，这里只补它没有的。
const ALIASES: Record<string, string> = { zsh: 'bash' };

/** 把 fence 语言名转成已注册的语言，未知语言用 plaintext 兜底。 */
export function codeLanguage(name: string | undefined): string {
  const lang = name ? (ALIASES[name] ?? name) : '';
  return lang && refractor.registered(lang) ? lang : 'plaintext';
}
