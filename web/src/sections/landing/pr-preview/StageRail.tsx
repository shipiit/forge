import { motion } from 'framer-motion';
import { STAGES, type Frame } from '../lib/preview-script';

interface StageRailProps {
  frame: Frame;
}

export function StageRail({ frame }: StageRailProps) {
  const current = STAGES.findIndex((s) => s.id === frame.stage);
  return (
    <ol className="grid grid-cols-5 border-b border-white/[0.08]" aria-label="Review stages">
      {STAGES.map((s, i) => {
        const state = i < current ? 'done' : i === current ? 'active' : 'waiting';
        return (
          <li key={s.id} className="relative px-3 py-3" aria-current={state === 'active' ? 'step' : undefined}>
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em]">
              <span
                className={`flex h-4 w-4 items-center justify-center border text-[9px] tabular-nums ${
                  state === 'waiting' ? 'border-white/15 text-white/35' : 'border-accentWarm text-accentWarm'
                }`}
              >
                {i + 1}
              </span>
              <span className={state === 'waiting' ? 'text-white/35' : 'text-text'}>{s.label}</span>
              <span className="sr-only">{state}</span>
            </div>
            <div className="absolute inset-x-0 bottom-0 h-px bg-white/[0.06]">
              <motion.div
                className="h-px origin-left bg-accentWarm"
                initial={false}
                animate={{ scaleX: state === 'done' ? 1 : state === 'active' ? frame.progress : 0 }}
                transition={{ duration: 0.12, ease: 'linear' }}
              />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
