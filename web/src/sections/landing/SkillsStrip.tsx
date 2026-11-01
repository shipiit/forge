import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Lock, PenLine, Plus } from 'lucide-react';
import { useCycle } from './hooks/useCycle';
import { READ_ONLY, SKILL_DEMOS, WRITE } from './lib/skills-demo';
import { rise } from './motion';
import { ScriptPlayer } from './player/ScriptPlayer';

export function SkillsStrip() {
  const [picked, setPicked] = useState<number | null>(null);
  const cycled = useCycle(SKILL_DEMOS.length, 6000, picked !== null);
  const index = picked ?? cycled;
  const skill = SKILL_DEMOS[index]!;
  const writes = skill.access === 'read & write';

  return (
    <section id="skills" className="border-t border-white/[0.07] px-7 py-24">
      <div className="mx-auto max-w-7xl">
        <motion.div {...rise} className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <span className="eyebrow eyebrow-ember">Skills</span>
            <h2 className="display mt-6 text-[clamp(34px,5vw,60px)]">
              Prompt packs
              <br />
              <span className="dim">your team controls.</span>
            </h2>
            <p className="mt-5 max-w-xl text-muted">
              A skill is instructions plus an <span className="text-text">enforced tool allowlist</span> — a read-only
              skill is never handed a write tool. Eight ship built in; your repository can override any of them.
            </p>
          </div>
          <Link to="/github#skills" className="btn btn-line !rounded-none uppercase tracking-[0.14em]">
            All skills <ArrowRight size={15} aria-hidden />
          </Link>
        </motion.div>

        <motion.div {...rise} className="mt-12 grid gap-6 lg:grid-cols-[1fr_1.15fr]">
          <ul className="grid grid-cols-2 gap-px self-start overflow-hidden border border-white/[0.08] bg-white/[0.06]">
            {SKILL_DEMOS.map((s, i) => {
              const on = i === index;
              return (
                <li key={s.name}>
                  <button
                    type="button"
                    onClick={() => setPicked(i === picked ? null : i)}
                    aria-pressed={on}
                    className={`relative flex h-full w-full flex-col items-start gap-1.5 p-4 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white/50 ${
                      on ? 'bg-accentWarm/[0.07]' : 'bg-[rgb(11_11_14)] hover:bg-white/[0.03]'
                    }`}
                  >
                    {on && <motion.span layoutId="skill-marker" className="absolute inset-x-0 top-0 h-0.5 bg-accentWarm" aria-hidden />}
                    <code className={`text-[13px] font-semibold ${on ? 'text-accentWarm' : 'text-white/90'}`}>/{s.name}</code>
                    <span className="text-[12.5px] leading-snug text-muted">{s.blurb}</span>
                  </button>
                </li>
              );
            })}
            <li className="col-span-2 flex items-start gap-3 bg-[rgb(11_11_14)] p-4 text-[12.5px] text-muted">
              <Plus size={15} className="mt-0.5 shrink-0 text-accentWarm" aria-hidden />
              <span>
                <span className="text-text">Your own</span> — commit <code className="text-white/75">.forge/skills/*.md</code> with a{' '}
                <code className="text-white/75">tools:</code> line, or define one inline in the workflow.
              </span>
            </li>
          </ul>

          <div className="border border-white/[0.08] bg-[rgb(11_11_14)]">
            <div className="flex items-center gap-2 border-b border-white/[0.08] px-4 py-2.5">
              <span className="flex gap-1.5" aria-hidden>
                <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
              </span>
              <span className="ml-2 font-mono text-[11px] text-white/45">issue comment</span>
            </div>
            <AnimatePresence mode="wait">
              <motion.div key={skill.name} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} className="p-5">
                <div className="font-mono text-[13px]">
                  <span className="text-white/40">$ </span>
                  <motion.span
                    className="inline-block overflow-hidden whitespace-nowrap align-bottom text-text"
                    initial={{ width: 0 }}
                    animate={{ width: 'auto' }}
                    transition={{ duration: 0.9, ease: 'easeOut' }}
                  >
                    {skill.invoke}
                  </motion.span>
                </div>

                <div className="mt-5 text-[11px] uppercase tracking-[0.16em] text-white/45">Tools this run is handed</div>
                <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Tools allowed">
                  {READ_ONLY.map((t) => (
                    <li key={t} className="inline-flex items-center gap-1 border border-white/12 px-2 py-0.5 font-mono text-[11px] text-white/75">
                      <Lock size={10} aria-hidden /> {t}
                    </li>
                  ))}
                  {WRITE.map((t) => (
                    <li
                      key={t}
                      className={`inline-flex items-center gap-1 border px-2 py-0.5 font-mono text-[11px] ${
                        writes ? 'border-accentWarm/40 text-accentWarm' : 'border-white/[0.06] text-white/25 line-through'
                      }`}
                    >
                      <PenLine size={10} aria-hidden /> {t}
                      <span className="sr-only">{writes ? 'allowed' : 'not allowed'}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[12px] text-muted">
                  {writes ? 'Read and write: it can edit files and run the tests.' : 'Read-only: write tools are removed before the model sees them.'}
                </p>

                <div className="mt-6 border-t border-white/[0.08] pt-4">
                  <ScriptPlayer lines={skill.run} playKey={skill.name} stepMs={650} />
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
