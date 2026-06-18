import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

export type Step = { label: string; detail: string; lines: string[] };

/** Auto-advancing step player: numbered list on the left, a live "terminal" on the right. */
export function StepPlayer({ steps }: { steps: Step[] }) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setActive((a) => (a + 1) % steps.length), 3200);
    return () => clearInterval(id);
  }, [steps.length]);

  return (
    <div className="grid gap-px overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.06] lg:grid-cols-[minmax(280px,360px)_1fr]">
      {/* steps */}
      <div className="bg-[rgb(11_11_14)] p-3">
        {steps.map((s, i) => (
          <button
            key={s.label}
            onClick={() => setActive(i)}
            className={`group flex w-full items-start gap-4 rounded-xl px-4 py-4 text-left transition ${i === active ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]'}`}
          >
            <span className={`mt-0.5 text-xs tabular-nums ${i === active ? 'text-white' : 'text-muted'}`}>(0{i + 1})</span>
            <span>
              <span className={`block font-semibold ${i === active ? 'text-white' : 'text-muted'}`}>{s.label}</span>
              <span className="mt-0.5 block text-sm leading-relaxed text-muted">{s.detail}</span>
            </span>
          </button>
        ))}
      </div>

      {/* live terminal */}
      <div className="relative min-h-[320px] bg-[rgb(8_8_11)] p-6">
        <div className="mb-4 flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
          <span className="ml-2 font-mono text-xs text-muted">shipit-forge · {steps[active].label.toLowerCase()}</span>
        </div>
        <AnimatePresence mode="wait">
          <motion.div key={active} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} className="space-y-2 font-mono text-[13px]">
            {steps[active].lines.map((ln, i) => (
              <motion.div key={ln} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.35, duration: 0.3 }} className="text-white/80">
                <span className="mr-2 text-white/30">$</span>{ln}
              </motion.div>
            ))}
          </motion.div>
        </AnimatePresence>
        {/* progress dots */}
        <div className="absolute bottom-5 left-6 flex gap-1.5">
          {steps.map((_, i) => (
            <span key={i} className={`h-1 rounded-full transition-all ${i === active ? 'w-6 bg-white' : 'w-1.5 bg-white/25'}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
