import { useCallback, useEffect, useRef, useState } from "react"

const STORAGE_KEY = "opencode-web.voice"

/** 按句切块：Chrome 对超长 utterance 会提前截断，分块后能完整念完。 */
function chunkText(text: string, limit = 80): string[] {
  const chunks: string[] = []
  const sentences = text.match(/[^。！？!?；;.]+[。！？!?；;.]?/g) ?? [text]
  let current = ""

  for (const sentence of sentences) {
    if (sentence.length > limit) {
      if (current) {
        chunks.push(current)
        current = ""
      }
      for (let i = 0; i < sentence.length; i += limit) chunks.push(sentence.slice(i, i + limit))
      continue
    }
    if (current && (current + sentence).length > limit) {
      chunks.push(current)
      current = sentence
    } else {
      current += sentence
    }
  }

  if (current) chunks.push(current)
  return chunks
}

function loadEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "off"
  } catch {
    return true
  }
}

/**
 * 浏览器自带语音合成。免 key、离线可用；语音由系统提供。
 * enabled 会持久化，静音后刷新仍然静音。
 */
export function useSpeech() {
  const [enabled, setEnabled] = useState(loadEnabled)
  const [speaking, setSpeaking] = useState(false)
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled

  const stop = useCallback(() => {
    window.speechSynthesis?.cancel()
    setSpeaking(false)
  }, [])

  const toggle = useCallback(() => {
    const next = !enabledRef.current
    setEnabled(next)
    try {
      localStorage.setItem(STORAGE_KEY, next ? "on" : "off")
    } catch {
      // 隐私模式可能禁用 localStorage。
    }
    if (!next) stop()
  }, [stop])

  const speak = useCallback((text: string) => {
    const synth = window.speechSynthesis
    if (!enabledRef.current || !text || !synth) return
    const chunks = chunkText(text)
    if (!chunks.length) return

    synth.cancel()
    const voice = synth.getVoices().find((item) => item.lang.replace("_", "-").startsWith("zh"))
    const last = chunks.length - 1

    chunks.forEach((chunk, index) => {
      const utterance = new SpeechSynthesisUtterance(chunk)
      utterance.lang = "zh-CN"
      utterance.rate = 1.05
      utterance.pitch = 1.08
      if (voice) utterance.voice = voice
      utterance.onstart = () => setSpeaking(true)
      utterance.onend = () => {
        if (index === last) setSpeaking(false)
      }
      utterance.onerror = () => setSpeaking(false)
      synth.speak(utterance)
    })
  }, [])

  useEffect(() => stop, [stop])

  return { enabled, speaking, toggle, speak, stop }
}
