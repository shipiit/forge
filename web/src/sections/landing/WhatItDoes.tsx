import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CalendarClock, History, LifeBuoy, MessageSquare, RefreshCw, ScanSearch, Search, ShieldAlert, Wrench, type LucideIcon,
} from 'lucide-react';
import { useCycle } from './hooks/useCycle';
import { CAPABILITIES, type CapabilityIcon } from './lib/capabilities';
import { rise } from './motion';
import { ScriptPlayer } from './player/ScriptPlayer';

const ICONS: Record<CapabilityIcon, LucideIcon> = {
  review: Search, fix: Wrench, shield: ShieldAlert, audit: ScanSearch, ci: RefreshCw,
  mention: MessageSquare, help: LifeBuoy, history: History, routine: CalendarClock,
};

export function WhatItDoes() {
  const [picked, setPicked] = useState<number | null>(null);
  const cycled = useCycle(CAPABILITIES.length, 7000, picked !== null);
  const index = picked ?? cycled;
  const current = CAPABILITIES[index]!;
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);

  const onKey = (e: React.KeyboardEvent) => {
    const last = CAPABILITIES.length - 1;
    const next = e.key === 'ArrowDown' ? (index === last ? 0 : index + 1) : e.key === 'ArrowUp' ? (index === 0 ? last : index - 1) : null;
    if (next === null) return;
    e.preventDefault();
    setPicked(next);
    tabs.current[next]?.focus();
  };

  return (
    <section id="what" className="border-t border-white/[0.07] px-7 py-24">
      <div className="mx-auto max-w-7xl">
        <motion.div {...rise}>
          <span className="eyebrow eyebrow-ember">What it does</span>
          <h2 className="display mt-6 text-[clamp(34px,5vw,60px)]">
            A teammate that
            <br />
            <span className="dim">works on GitHub events.</span>
          </h2>
          <p className="mt-5 max-w-2xl text-muted">
            Issues, pull requests, failing checks and @mentions — Forge acts on each, and{' '}
            <span className="text-text">never merges or approves on its own</span>. Pick one to see a run.
          </p>
        </motion.div>

        <motion.div {...rise} className="mt-12 grid gap-px overflow-hidden border border-white/[0.08] bg-white/[0.06] lg:grid-cols-[360px_1fr]">
          <div role="tablist" aria-orientation="vertical" aria-label="Capabilities" onKeyDown={onKey} className="bg-[rgb(11_11_14)]">
            {CAPABILITIES.map((c, i) => {
              const Icon = ICONS[c.icon];
              const on = i === index;
              return (
                <button
                  key={c.id}
                  ref={(el) => {
                    tabs.current[i] = el;
                  }}
                  role="tab"
                  id={`cap-tab-${c.id}`}
                  aria-selected={on}
                  aria-controls="cap-panel"
                  tabIndex={on ? 0 : -1}
                  onClick={() => setPicked(i === picked ? null : i)}
                  className={`relative flex w-full items-center gap-3 border-b border-white/[0.06] px-5 py-3.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white/50 ${
                    on ? 'bg-accentWarm/[0.06]' : 'hover:bg-white/[0.03]'
                  }`}
                >
                  {on && <motion.span layoutId="cap-marker" className="absolute inset-y-0 left-0 w-0.5 bg-accentWarm" aria-hidden />}
                  <Icon size={16} className={on ? 'text-accentWarm' : 'text-white/55'} aria-hidden />
                  <span className={`text-[14px] ${on ? 'font-semibold text-text' : 'text-white/75'}`}>{c.title}</span>
                </button>
              );
            })}
          </div>

          <div id="cap-panel" role="tabpanel" aria-labelledby={`cap-tab-${current.id}`} className="relative min-h-[360px] bg-[rgb(11_11_14)] p-7">
            <AnimatePresence mode="wait">
              <motion.div key={current.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.3 }}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-xl font-semibold">{current.title}</h3>
                  <code className="border border-white/10 px-2.5 py-0.5 text-[11px] text-white/60">{current.trigger}</code>
                </div>
                <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">{current.summary}</p>
                <div className="mt-6 border border-white/[0.08] bg-black/30">
                  <div className="flex items-center gap-2 border-b border-white/[0.08] px-4 py-2 text-[11px] uppercase tracking-[0.16em] text-white/45">
                    <span className="h-1.5 w-1.5 rounded-full bg-accentWarm" aria-hidden /> Run log
                  </div>
                  <div className="p-4">
                    <ScriptPlayer lines={current.run} playKey={current.id} />
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
            <p className="mt-4 text-xs text-muted">
              {picked === null ? 'Cycling through every capability. Pick one to stay on it.' : 'Holding here. Pick it again to resume.'}
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
