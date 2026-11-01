import { motion } from 'framer-motion';
import { Boxes, Bot, Code2, KeyRound, Radar, Server, type LucideIcon } from 'lucide-react';
import { CHECK_GROUPS, type CheckGroup } from './lib/checks';
import { rise } from './motion';

const ICONS: Record<CheckGroup['source'], LucideIcon> = {
  deps: Boxes,
  secrets: KeyRound,
  code: Code2,
  iac: Server,
  model: Bot,
  audit: Radar,
};

export function WhatWeCheck() {
  return (
    <section id="checks" className="border-t border-white/[0.07] px-7 py-24">
      <div className="mx-auto max-w-7xl">
        <motion.div {...rise} className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <span className="eyebrow eyebrow-ember">What it checks</span>
            <h2 className="display mt-6 text-[clamp(34px,5vw,60px)]">
              Five passes.
              <br />
              <span className="dim">One review.</span>
            </h2>
            <p className="mt-5 max-w-2xl text-muted">
              Four deterministic scanners run first and cost nothing; the agent review is told what they found and
              spends its turns on what is reachable. One problem, one comment. For the whole repository,{' '}
              <code className="text-white/75">/audit</code> sends a team.
            </p>
          </div>
          <dl className="flex gap-8 font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
            <div><dt>Free · no model</dt><dd className="mt-1 text-2xl font-sans font-bold normal-case tracking-tight text-ok">4</dd></div>
            <div><dt>Your key</dt><dd className="mt-1 text-2xl font-sans font-bold normal-case tracking-tight text-text">2</dd></div>
          </dl>
        </motion.div>

        <div className="mt-12 grid gap-px overflow-hidden border border-white/[0.08] bg-white/[0.06] md:grid-cols-2 lg:grid-cols-3">
          {CHECK_GROUPS.map((g, i) => {
            const Icon = ICONS[g.source];
            const free = g.cost === 'free';
            return (
              <motion.section
                key={g.title}
                aria-labelledby={`check-${g.source}`}
                {...rise}
                transition={{ ...rise.transition, delay: (i % 3) * 0.07 }}
                className="group relative bg-[rgb(11_11_14)] p-7 transition-colors duration-300 hover:bg-[rgb(14_14_18)]"
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 top-0 h-px origin-left scale-x-0 bg-accentWarm transition-transform duration-500 group-hover:scale-x-100"
                />
                <div className="flex items-start gap-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center border border-white/10 bg-white/[0.03] text-white/75 transition-colors duration-300 group-hover:border-accentWarm/40 group-hover:text-accentWarm">
                    <Icon size={18} aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <h3 id={`check-${g.source}`} className="text-[17px] font-semibold leading-snug">{g.title}</h3>
                    <div className="mt-1.5 flex items-center gap-2 text-[10.5px] uppercase tracking-[0.16em]">
                      <span className={free ? 'text-ok' : 'text-white/55'}>{free ? 'Free · no model' : 'Model · your key'}</span>
                      <span className="text-white/25" aria-hidden>·</span>
                      <span className="text-white/45">{g.items.length} checks</span>
                    </div>
                  </div>
                </div>
                <ul className="mt-6 space-y-2.5">
                  {g.items.map((it) => (
                    <li key={it.name} className="flex items-start gap-3 text-[13.5px] leading-snug">
                      <span className="mt-[7px] h-1 w-1 shrink-0 bg-accentWarm/70" aria-hidden />
                      <span className="flex-1 text-white/85">{it.name}</span>
                      {it.cwe && (
                        <code className="shrink-0 border border-white/[0.08] px-1.5 py-px text-[10.5px] text-white/50">{it.cwe}</code>
                      )}
                    </li>
                  ))}
                </ul>
              </motion.section>
            );
          })}
        </div>
      </div>
    </section>
  );
}
