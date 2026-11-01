import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Hammer } from 'lucide-react';
import { useCycle } from '../hooks/useCycle';
import type { HubTab } from '../lib/hub';
import { HubNodeCard } from './HubNodeCard';

/**
 * Coordinates in a 1000×500 box stretched over the grid: the side columns are
 * 36% wide, the centre node sits in the middle 28%, and five rows share the
 * height evenly. The SVG only draws on large screens; below that the cards
 * stack and the lines would point at nothing.
 */
const ROW_Y = [50, 150, 250, 350, 450];
const SIDE_EDGE = 360;
const CENTER_EDGE = 418;

function curve(side: 'left' | 'right', y: number): string {
  const fromX = side === 'left' ? SIDE_EDGE : 1000 - SIDE_EDGE;
  const toX = side === 'left' ? CENTER_EDGE : 1000 - CENTER_EDGE;
  const bend = side === 'left' ? 45 : -45;
  return `M ${fromX} ${y} C ${fromX + bend} ${y}, ${toX - bend} 250, ${toX} 250`;
}

interface HubDiagramProps {
  tab: HubTab;
}

export function HubDiagram({ tab }: HubDiagramProps) {
  const reduce = useReducedMotion();
  const [hovering, setHovering] = useState(false);
  const nodes = [...tab.left.map((n) => ({ n, side: 'left' as const })), ...tab.right.map((n) => ({ n, side: 'right' as const }))];
  const active = useCycle(nodes.length, 1400, hovering);

  return (
    <div onMouseEnter={() => setHovering(true)} onMouseLeave={() => setHovering(false)}>
      <div className="relative grid gap-3 lg:h-[470px] lg:grid-cols-[36%_28%_36%] lg:gap-0">
        <svg className="pointer-events-none absolute inset-0 hidden h-full w-full lg:block" viewBox="0 0 1000 500" preserveAspectRatio="none" aria-hidden>
          {nodes.map(({ side }, i) => {
            const d = curve(side, ROW_Y[i % 5]!);
            const on = i === active;
            return (
              <g key={`${tab.id}-${i}`}>
                <path d={d} fill="none" stroke={on ? 'rgba(251,146,60,0.55)' : 'rgba(255,255,255,0.12)'} strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
                {!reduce && (
                  <motion.path
                    d={d}
                    fill="none"
                    stroke="rgb(251 146 60)"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                    pathLength={1}
                    strokeDasharray="0.07 1"
                    initial={{ strokeDashoffset: side === 'left' ? 1.07 : 0 }}
                    animate={{ strokeDashoffset: side === 'left' ? 0 : 1.07 }}
                    transition={{ duration: on ? 1.1 : 2.6 + (i % 5) * 0.35, repeat: Infinity, ease: 'linear', delay: (i % 5) * 0.2 }}
                    opacity={on ? 1 : 0.35}
                  />
                )}
              </g>
            );
          })}
        </svg>

        <ul className="relative z-10 flex flex-col justify-between gap-3">
          {tab.left.map((n, i) => (
            <li key={n.title}>
              <HubNodeCard node={n} active={i === active} />
            </li>
          ))}
        </ul>

        <div className="relative z-10 flex items-center justify-center py-8 lg:py-0">
          <motion.div
            aria-hidden
            className="absolute h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(251,146,60,0.28),transparent_65%)] blur-2xl"
            animate={reduce ? undefined : { scale: [1, 1.12, 1], opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            aria-hidden
            className="absolute h-56 w-56 rounded-full border border-dashed border-white/15"
            animate={reduce ? undefined : { rotate: 360 }}
            transition={{ duration: 40, repeat: Infinity, ease: 'linear' }}
          />
          <div className="relative flex items-center gap-3 bg-accentWarm px-5 py-4 text-black shadow-[0_20px_60px_-15px_rgba(251,146,60,0.7)]">
            <span className="flex h-10 w-10 items-center justify-center bg-black/15">
              <Hammer size={20} aria-hidden />
            </span>
            <span>
              <span className="block text-lg font-bold leading-tight">{tab.center.title}</span>
              <span className="block font-mono text-[12px] text-black/70">{tab.center.detail}</span>
            </span>
          </div>
        </div>

        <ul className="relative z-10 flex flex-col justify-between gap-3">
          {tab.right.map((n, i) => (
            <li key={n.title}>
              <HubNodeCard node={n} active={i + tab.left.length === active} />
            </li>
          ))}
        </ul>
      </div>
      <p className="mx-auto mt-8 max-w-2xl text-center text-sm text-muted">{tab.caption}</p>
    </div>
  );
}
