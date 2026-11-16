import React, { useEffect, useRef, useState } from "react"

const SIZE = 96

export type EagleState =
  | "idle"
  | "takeoff"
  | "thinking"
  | "talking"
  | "soaring"
  | "waiting"
  | "error"

type Pos = { x: number; y: number }

/** 可拖拽的卡通雄鹰伙伴，动作由 agent 状态驱动；单击可开关语音。 */
export default function EagleCompanion({
  state = "idle",
  voiceEnabled = false,
  onToggleVoice,
}: {
  state?: EagleState
  voiceEnabled?: boolean
  onToggleVoice?: () => void
}) {
  const [pos, setPos] = useState<Pos>(() => ({
    x: Math.max(0, window.innerWidth - SIZE - 24),
    y: Math.max(0, window.innerHeight - SIZE - 24),
  }))
  const [dragging, setDragging] = useState(false)
  const offset = useRef<Pos | null>(null)
  const press = useRef<{ x: number; y: number; moved: boolean } | null>(null)

  useEffect(() => {
    const clamp = () =>
      setPos((p) => ({
        x: Math.min(p.x, Math.max(0, window.innerWidth - SIZE)),
        y: Math.min(p.y, Math.max(0, window.innerHeight - SIZE)),
      }))
    window.addEventListener("resize", clamp)
    return () => window.removeEventListener("resize", clamp)
  }, [])

  function down(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    offset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y }
    press.current = { x: e.clientX, y: e.clientY, moved: false }
    setDragging(true)
  }

  function move(e: React.PointerEvent<HTMLDivElement>) {
    const start = offset.current
    if (!start) return
    if (press.current && Math.hypot(e.clientX - press.current.x, e.clientY - press.current.y) > 4) {
      press.current.moved = true
    }
    setPos({
      x: Math.min(Math.max(0, e.clientX - start.x), window.innerWidth - SIZE),
      y: Math.min(Math.max(0, e.clientY - start.y), window.innerHeight - SIZE),
    })
  }

  function up(e: React.PointerEvent<HTMLDivElement>) {
    const wasClick = press.current && !press.current.moved
    offset.current = null
    press.current = null
    setDragging(false)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    if (wasClick) onToggleVoice?.()
  }

  return (
    <div
      className={`eagle state-${state}${dragging ? " dragging" : ""}`}
      style={{ left: pos.x, top: pos.y }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      title={
        onToggleVoice
          ? voiceEnabled
            ? "单击关闭语音 · 按住拖动"
            : "单击开启语音 · 按住拖动"
          : "按住拖动"
      }
      role="img"
      aria-label="鹰助手"
    >
      <svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
        <ellipse className="eagle-shadow" cx="60" cy="114" rx="24" ry="4" fill="#000" opacity="0.12" />

        <g className="eagle-figure">
          {/* 尾羽 */}
          <path d="M47 94 L60 116 L73 94 Z" fill="#6b4423" />
          <path d="M53 98 L60 113 L67 98" fill="none" stroke="#5b3a1e" strokeWidth="2" />

          {/* 爪子 */}
          <g className="eagle-feet" stroke="#f2b233" strokeWidth="4" strokeLinecap="round" fill="none">
            <path d="M50 98 L46 109 M50 98 L50 111 M50 98 L54 109" />
            <path d="M70 98 L66 109 M70 98 L70 111 M70 98 L74 109" />
          </g>

          {/* 身体与胸羽 */}
          <ellipse cx="60" cy="78" rx="27" ry="29" fill="#8a5a2b" />
          <ellipse cx="60" cy="84" rx="17" ry="20" fill="#e9d6b7" />

          {/* 翅膀 */}
          <g className="eagle-wing eagle-wing-l">
            <path d="M35 62 C19 67 15 89 24 99 C31 93 35 85 38 75 Z" fill="#6f4620" />
            <path d="M30 76 C26 83 25 90 27 95" fill="none" stroke="#5b3a1e" strokeWidth="2" strokeLinecap="round" />
          </g>
          <g className="eagle-wing eagle-wing-r">
            <path d="M85 62 C101 67 105 89 96 99 C89 93 85 85 82 75 Z" fill="#6f4620" />
            <path d="M90 76 C94 83 95 90 93 95" fill="none" stroke="#5b3a1e" strokeWidth="2" strokeLinecap="round" />
          </g>

          {/* 头 */}
          <g className="eagle-head">
            <path d="M50 20 L60 6 L66 20 Q60 15 50 20" fill="#f7f2e8" />
            <circle cx="60" cy="43" r="29" fill="#f7f2e8" />

            <g className="eagle-eyes">
              <ellipse cx="48" cy="41" rx="8" ry="9" fill="#fff" stroke="#e3dacb" strokeWidth="1.5" />
              <ellipse cx="72" cy="41" rx="8" ry="9" fill="#fff" stroke="#e3dacb" strokeWidth="1.5" />
              <circle cx="49.5" cy="42" r="3.6" fill="#2c2118" />
              <circle cx="70.5" cy="42" r="3.6" fill="#2c2118" />
              <circle cx="50.6" cy="40.4" r="1.2" fill="#fff" />
              <circle cx="71.6" cy="40.4" r="1.2" fill="#fff" />
            </g>

            <path d="M38 31 L53 34" stroke="#8a5a2b" strokeWidth="4" strokeLinecap="round" />
            <path d="M82 31 L67 34" stroke="#8a5a2b" strokeWidth="4" strokeLinecap="round" />

            <g className="eagle-beak">
              <path d="M51 50 C53 59 67 59 69 50 C63 54 57 54 51 50 Z" fill="#f2b233" />
              <path d="M55 56 Q60 62 65 56" fill="none" stroke="#cf8f17" strokeWidth="2.5" strokeLinecap="round" />
            </g>

            <circle cx="36" cy="54" r="4" fill="#e8b48d" opacity="0.55" />
            <circle cx="84" cy="54" r="4" fill="#e8b48d" opacity="0.55" />
          </g>

          {/* 思考气泡 */}
          <g className="eagle-thought" fill="#f7f2e8" stroke="#d9cdb8" strokeWidth="1.2">
            <circle cx="94" cy="21" r="4.2" />
            <circle cx="101" cy="13" r="3.2" />
            <circle cx="107" cy="6" r="2.4" />
          </g>

          {/* 等待提示 */}
          <g className="eagle-alert">
            <circle cx="98" cy="18" r="9" fill="#f2b233" stroke="#d99a1f" strokeWidth="1.5" />
            <path d="M98 12 V18.5" stroke="#7a4a12" strokeWidth="2.6" strokeLinecap="round" />
            <circle cx="98" cy="22.5" r="1.6" fill="#7a4a12" />
          </g>
        </g>
      </svg>
    </div>
  )
}
