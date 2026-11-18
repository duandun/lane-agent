export default function CatFigure() {
  return (
    <svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
      <ellipse className="cat-shadow" cx="60" cy="114" rx="24" ry="4" fill="#000" opacity="0.12" />

      <g className="cat-figure">
        {/* 尾巴 */}
        <path
          className="cat-tail"
          d="M82 96 C102 98 110 82 101 71 C96 65 87 67 88 75 C89 82 96 82 97 77"
          fill="none"
          stroke="#e08c3f"
          strokeWidth="9"
          strokeLinecap="round"
        />

        {/* 身体与肚皮 */}
        <ellipse cx="60" cy="82" rx="26" ry="28" fill="#f2a65a" />
        <ellipse cx="60" cy="88" rx="16" ry="19" fill="#ffe9c9" />

        {/* 前爪 */}
        <ellipse cx="50" cy="104" rx="9" ry="5.5" fill="#ffe9c9" />
        <ellipse cx="70" cy="104" rx="9" ry="5.5" fill="#ffe9c9" />

        {/* 头 */}
        <g className="cat-head">
          <g className="cat-ear-l">
            <path d="M36 32 L40 10 L57 24 Z" fill="#f2a65a" />
            <path d="M41 27 L43.5 16 L51 23 Z" fill="#ffc4c4" />
          </g>
          <g className="cat-ear-r">
            <path d="M84 32 L80 10 L63 24 Z" fill="#f2a65a" />
            <path d="M79 27 L76.5 16 L69 23 Z" fill="#ffc4c4" />
          </g>

          <circle cx="60" cy="46" r="27" fill="#f2a65a" />

          {/* 额头虎斑 */}
          <g stroke="#d98a3a" strokeWidth="3" strokeLinecap="round">
            <path d="M52 25 L54 34" />
            <path d="M60 23 L60 33" />
            <path d="M68 25 L66 34" />
          </g>

          <g className="cat-eyes">
            <ellipse cx="48" cy="45" rx="6" ry="7" fill="#3a2a1d" />
            <ellipse cx="72" cy="45" rx="6" ry="7" fill="#3a2a1d" />
            <circle cx="50" cy="42.5" r="2" fill="#fff" />
            <circle cx="74" cy="42.5" r="2" fill="#fff" />
            <circle cx="46.4" cy="47" r="0.9" fill="#fff" opacity="0.7" />
            <circle cx="70.4" cy="47" r="0.9" fill="#fff" opacity="0.7" />
          </g>

          <path d="M56.5 56 L63.5 56 L60 60.5 Z" fill="#ef8f8f" />
          <g
            className="cat-mouth"
            fill="none"
            stroke="#b3765a"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M60 60.5 Q55 66 51 62" />
            <path d="M60 60.5 Q65 66 69 62" />
          </g>

          <g stroke="#d9a06a" strokeWidth="1.6" strokeLinecap="round" opacity="0.85">
            <path d="M32 51 L47 54" />
            <path d="M31 57 L47 58" />
            <path d="M88 51 L73 54" />
            <path d="M89 57 L73 58" />
          </g>

          <circle cx="34" cy="55" r="4" fill="#ef8f8f" opacity="0.4" />
          <circle cx="86" cy="55" r="4" fill="#ef8f8f" opacity="0.4" />
        </g>

        {/* 思考气泡 */}
        <g className="cat-thought" fill="#f7f2e8" stroke="#d9cdb8" strokeWidth="1.2">
          <circle cx="94" cy="21" r="4.2" />
          <circle cx="101" cy="13" r="3.2" />
          <circle cx="107" cy="6" r="2.4" />
        </g>

        {/* 等待提示 */}
        <g className="cat-alert">
          <circle cx="98" cy="18" r="9" fill="#f2b233" stroke="#d99a1f" strokeWidth="1.5" />
          <path d="M98 12 V18.5" stroke="#7a4a12" strokeWidth="2.6" strokeLinecap="round" />
          <circle cx="98" cy="22.5" r="1.6" fill="#7a4a12" />
        </g>
      </g>
    </svg>
  );
}