import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { FLOW_STEPS } from '../lib/flow';

interface FlowStepsProps {
  active: number;
  onPick: (index: number) => void;
}

export function FlowSteps({ active, onPick }: FlowStepsProps) {
  return (
    <ol className="mt-12 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
      {FLOW_STEPS.map((s, i) => {
        const state = i < active ? 'done' : i === active ? 'active' : 'next';
        return (
          <li key={s.n}>
            <button
              type="button"
              onClick={() => onPick(i)}
              aria-current={state === 'active' ? 'step' : undefined}
              className={`relative flex h-full w-full flex-col items-start justify-start overflow-hidden border p-5 text-left transition-colors duration-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/50 ${
                state === 'active' ? 'border-accentWarm/50 bg-accentWarm/[0.05]' : 'border-white/[0.08] bg-[rgb(11_11_14)] hover:border-white/20'
              }`}
            >
              {state === 'active' && (
                <motion.span
                  layoutId="flow-step-bar"
                  className="absolute inset-x-0 top-0 h-0.5 bg-accentWarm"
                  transition={{ type: 'spring', stiffness: 300, damping: 32 }}
                  aria-hidden
                />
              )}
              <span className="flex items-center gap-2.5 text-[11px] uppercase tracking-[0.16em]">
                <span
                  className={`flex h-6 w-6 items-center justify-center border text-[11px] ${
                    state === 'done'
                      ? 'border-ok/40 text-ok'
                      : state === 'active'
                        ? 'border-accentWarm bg-accentWarm text-black'
                        : 'border-white/15 text-white/50'
                  }`}
                >
                  {state === 'done' ? <Check size={12} aria-hidden /> : s.n}
                </span>
                <span className={state === 'next' ? 'text-white/50' : 'text-accentWarm'}>Step {s.n}</span>
              </span>
              <span className="mt-4 block text-[16px] font-semibold">{s.title}</span>
              <span className="mt-2 block text-sm leading-relaxed text-muted">{s.detail}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
