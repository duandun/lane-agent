import { useEffect, useRef } from "react"

const MODEL_URL = "/live2d/haru/haru_greeter_t03.model3.json"

export type AvatarState = "idle" | "connecting" | "thinking" | "talking" | "waiting" | "error"

// 模型自带的表情：f03 皱眉思考，f05 惊讶，f07 失落。
const EXPRESSIONS: Partial<Record<AvatarState, string>> = {
  connecting: "f03",
  thinking: "f03",
  waiting: "f05",
  error: "f07",
}

type InternalModel = {
  coreModel: { setParameterValueById(id: string, value: number): void }
  motionManager: { expressionManager?: { resetExpression(): void } }
  on(event: string, fn: () => void): void
  off(event: string, fn: () => void): void
}

type Live2DModel = {
  width: number
  height: number
  x: number
  y: number
  scale: { set(value: number): void }
  anchor: { set(x: number, y: number): void }
  internalModel: InternalModel
  expression(id: string): Promise<boolean>
  destroy(): void
}

type PixiApp = {
  stage: { addChild(child: unknown): void }
  renderer: {
    width: number
    height: number
    on(event: "resize", fn: () => void): void
    off(event: "resize", fn: () => void): void
  }
  view: HTMLCanvasElement
  destroy(removeView?: boolean, options?: { children?: boolean }): void
}

declare global {
  interface Window {
    PIXI?: {
      Application: new (options: Record<string, unknown>) => PixiApp
      live2d?: {
        Live2DModel: {
          from(url: string, options?: Record<string, unknown>): Promise<Live2DModel>
        }
      }
    }
  }
}

function applyState(model: Live2DModel, state: AvatarState) {
  const expression = EXPRESSIONS[state]
  if (expression) void model.expression(expression)
  else model.internalModel.motionManager.expressionManager?.resetExpression()
}

/**
 * 右下角的二次元看板娘。脚本在 index.html 里以全局方式加载，
 * 避免 PixiJS 6 与打包器之间的兼容问题。
 */
export default function Live2DAvatar({ state }: { state: AvatarState }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const modelRef = useRef<Live2DModel | null>(null)
  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    const host = hostRef.current
    const PIXI = window.PIXI
    if (!host || !PIXI?.live2d) return

    const app = new PIXI.Application({ backgroundAlpha: 0, resizeTo: host })
    host.appendChild(app.view)
    let model: Live2DModel | null = null
    let disposed = false

    // 模型按“撑满容器”缩放，底部对齐；容器尺寸变化时重算。
    const fit = () => {
      if (!model) return
      const { width, height } = app.renderer
      model.scale.set(Math.min(width / model.width, height / model.height))
      model.anchor.set(0.5, 1)
      model.x = width / 2
      model.y = height
    }

    // 说话状态直接驱动口型参数，不依赖 TTS。
    const mouth = () => {
      if (!model || stateRef.current !== "talking") return
      const t = performance.now() / 1000
      const value = Math.max(0, 0.55 + 0.5 * Math.sin(t * 17) * Math.sin(t * 7.3))
      model.internalModel.coreModel.setParameterValueById("ParamMouthOpenY", value)
    }

    PIXI.live2d.Live2DModel.from(MODEL_URL, { autoInteract: false })
      .then((loaded) => {
        if (disposed) {
          loaded.destroy()
          return
        }
        model = loaded
        modelRef.current = loaded
        app.stage.addChild(loaded)
        fit()
        applyState(loaded, stateRef.current)
        loaded.internalModel.on("afterMotionUpdate", mouth)
        app.renderer.on("resize", fit)
      })
      .catch((cause: unknown) => {
        console.error("Live2D 模型加载失败", cause)
      })

    return () => {
      disposed = true
      app.renderer.off("resize", fit)
      model?.internalModel.off("afterMotionUpdate", mouth)
      modelRef.current = null
      app.destroy(true, { children: true })
    }
  }, [])

  useEffect(() => {
    if (modelRef.current) applyState(modelRef.current, state)
  }, [state])

  return <div ref={hostRef} className="live2d-avatar" aria-hidden />
}
