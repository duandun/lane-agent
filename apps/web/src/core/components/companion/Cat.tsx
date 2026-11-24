export default function CatFigure() {
  return (
    <svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
      <ellipse className="cat-shadow" cx="60" cy="114" rx="24" ry="4" fill="#000" opacity="0.12" />

      <g className="cat-figure">
        {/* 尾巴：白毛、黑尾尖 */}
        <path
          d="M82 96 C102 98 110 82 101 71 C96 65 87 67 88 75 C89 82 96 82 97 77"
          fill="none"
          stroke="#e3ded7"
          strokeWidth="11"
          strokeLinecap="round"
        />
        <path
          className="cat-tail"
          d="M82 96 C102 98 110 82 101 71 C96 65 87 67 88 75 C89 82 96 82 97 77"
          fill="none"
          stroke="#fdfdfd"
          strokeWidth="9"
          strokeLinecap="round"
        />
        <path
          className="cat-tail"
          d="M100 72 C95 65 87 66 88 75"
          fill="none"
          stroke="#3a3a3a"
          strokeWidth="9"
          strokeLinecap="round"
        />

        {/* 身体、背上的黑毛和肚皮 */}
        <ellipse
          cx="60"
          cy="82"
          rx="26"
          ry="28"
          fill="#fdfdfd"
          stroke="#e3ded7"
          strokeWidth="1.5"
        />
        <ellipse cx="74" cy="76" rx="8" ry="15" fill="#3a3a3a" transform="rotate(10 74 76)" />
        <ellipse cx="60" cy="88" rx="16" ry="19" fill="#f6f1ea" />

        {/* 前爪 */}
        <ellipse cx="50" cy="104" rx="9" ry="5.5" fill="#f6f1ea" stroke="#e3ded7" />
        <ellipse cx="70" cy="104" rx="9" ry="5.5" fill="#f6f1ea" stroke="#e3ded7" />

        {/* 头：左耳和左眼周是黑毛 */}
        <g className="cat-head">
          <g className="cat-ear-l">
            <path d="M36 32 L40 10 L57 24 Z" fill="#3a3a3a" />
            <path d="M41 27 L43.5 16 L51 23 Z" fill="#ffb3b3" />
          </g>
          <g className="cat-ear-r">
            <path d="M84 32 L80 10 L63 24 Z" fill="#fdfdfd" stroke="#e3ded7" strokeWidth="1.5" />
            <path d="M79 27 L76.5 16 L69 23 Z" fill="#ffc4c4" />
          </g>

          <circle cx="60" cy="46" r="27" fill="#fdfdfd" stroke="#e3ded7" strokeWidth="1.5" />
          <ellipse cx="44" cy="32" rx="9" ry="5.5" fill="#3a3a3a" transform="rotate(-18 44 32)" />

          <g className="cat-eyes">
            <ellipse cx="48" cy="45" rx="6" ry="7" fill="#8ec98e" />
            <ellipse cx="72" cy="45" rx="6" ry="7" fill="#8ec98e" />
            <ellipse cx="48" cy="45" rx="2.4" ry="5.5" fill="#2b2b2b" />
            <ellipse cx="72" cy="45" rx="2.4" ry="5.5" fill="#2b2b2b" />
            <circle cx="50.5" cy="42.5" r="1.8" fill="#fff" />
            <circle cx="74.5" cy="42.5" r="1.8" fill="#fff" />
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

          <circle cx="34" cy="55" r="4" fill="#ef8f8f" opacity="0.35" />
          <circle cx="86" cy="55" r="4" fill="#ef8f8f" opacity="0.35" />
        </g>

        {/* 思考：头顶冒星光 */}
        <g className="cat-sparks" fill="#f2b233">
          <path d="M92 16 L93.6 21 L98 22.6 L93.6 24.2 L92 29 L90.4 24.2 L86 22.6 L90.4 21 Z" />
          <path d="M104 10 L105.1 13.3 L108 14.4 L105.1 15.5 L104 18.8 L102.9 15.5 L100 14.4 L102.9 13.3 Z" />
          <path d="M84 9 L85.1 12.3 L88 13.4 L85.1 14.5 L84 17.8 L82.9 14.5 L80 13.4 L82.9 12.3 Z" />
        </g>

        {/* 执行指令：在纸上写字 */}
        <g className="cat-write">
          <g transform="rotate(-6 76 84)">
            <rect
              x="64"
              y="66"
              width="26"
              height="34"
              rx="3"
              fill="#fff"
              stroke="#cfcac4"
              strokeWidth="1.5"
            />
            <path
              d="M69 75 H85 M69 81 H85 M69 87 H80"
              stroke="#c9c9c9"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </g>
          <g className="cat-pen">
            <path d="M84 66 L72 88" stroke="#f2b233" strokeWidth="4.5" strokeLinecap="round" />
            <path d="M72 88 L69.5 94" stroke="#3a3a3a" strokeWidth="3" strokeLinecap="round" />
          </g>
        </g>

        {/* 读文件：捧着纸看 */}
        <g className="cat-read">
          <g transform="rotate(-4 60 62)">
            <rect
              x="40"
              y="48"
              width="40"
              height="28"
              rx="3"
              fill="#fff"
              stroke="#cfcac4"
              strokeWidth="1.5"
            />
            <path
              d="M45 56 H75 M45 62 H75 M45 68 H68"
              stroke="#c9c9c9"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </g>
          <rect
            x="35"
            y="56"
            width="9"
            height="12"
            rx="4.5"
            fill="#fdfdfd"
            stroke="#e3ded7"
            strokeWidth="1.5"
          />
          <rect
            x="76"
            y="56"
            width="9"
            height="12"
            rx="4.5"
            fill="#fdfdfd"
            stroke="#e3ded7"
            strokeWidth="1.5"
          />
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
