import { useEffect, useRef, useState } from 'react';
import { Popover, Segmented } from 'antd';
import { useAppStore, type CompanionKind } from '@core/lib/store';
import CatFigure from './Cat';
import EagleFigure from './Eagle';
import './companion.css';

const SIZE = 96;

const KINDS: { value: CompanionKind; label: string }[] = [
  { value: 'eagle', label: '小鹰' },
  { value: 'cat', label: '小猫' },
];

export type CompanionState =
  'idle' | 'takeoff' | 'thinking' | 'talking' | 'reading' | 'soaring' | 'waiting' | 'error';

type Pos = { x: number; y: number };

/** 可拖拽的卡通伙伴，动作由 agent 状态驱动；kind 决定画哪只动物。 */
export default function Companion({
  kind = 'eagle',
  state = 'idle',
}: {
  kind?: CompanionKind;
  state?: CompanionState;
}) {
  const [pos, setPos] = useState<Pos>(() => ({
    x: Math.max(0, window.innerWidth - SIZE - 24),
    y: Math.max(0, window.innerHeight - 220 - 24),
  }));
  const [dragging, setDragging] = useState(false);
  const offset = useRef<Pos | null>(null);
  const anchor = useRef<HTMLDivElement>(null);
  const setCompanion = useAppStore((state) => state.setCompanion);

  useEffect(() => {
    const clamp = () =>
      setPos((p) => ({
        x: Math.min(p.x, Math.max(0, window.innerWidth - SIZE)),
        y: Math.min(p.y, Math.max(0, window.innerHeight - SIZE)),
      }));
    window.addEventListener('resize', clamp);
    return () => window.removeEventListener('resize', clamp);
  }, []);

  function down(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    offset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    setDragging(true);
  }

  function move(e: React.PointerEvent<HTMLDivElement>) {
    const start = offset.current;
    if (!start) return;
    setPos({
      x: Math.min(Math.max(0, e.clientX - start.x), window.innerWidth - SIZE),
      y: Math.min(Math.max(0, e.clientY - start.y), window.innerHeight - SIZE),
    });
  }

  function up(e: React.PointerEvent<HTMLDivElement>) {
    offset.current = null;
    setDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }

  return (
    <Popover
      trigger="hover"
      placement="top"
      mouseEnterDelay={0.15}
      getPopupContainer={() => anchor.current ?? document.body}
      content={
        <Segmented
          size="small"
          value={kind}
          options={KINDS}
          onChange={(value) => setCompanion(value as CompanionKind)}
        />
      }
    >
      <div
        ref={anchor}
        className={`companion ${kind} state-${state}${dragging ? ' dragging' : ''}`}
        style={{ left: pos.x, top: pos.y }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        title="按住拖动"
        role="group"
        aria-label={kind === 'cat' ? '小猫助手' : '鹰助手'}
      >
        {kind === 'cat' ? <CatFigure /> : <EagleFigure />}
      </div>
    </Popover>
  );
}
