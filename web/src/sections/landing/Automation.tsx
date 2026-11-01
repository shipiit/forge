import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, History, CalendarClock } from 'lucide-react';
import { Code } from '../../components/Code';
import { rise } from './motion';

export function Automation() {
  return (
    <section id="automation" className="border-t border-white/[0.07] px-7 py-24">
      <div className="mx-auto max-w-7xl">
        <motion.div {...rise}>
          <span className="eyebrow eyebrow-ember">Always on</span>
          <h2 className="display mt-6 text-[clamp(34px,5vw,60px)]">It keeps working<br /><span className="dim">between your commits.</span></h2>
        </motion.div>

        <motion.div {...rise} className="mt-12 grid gap-px overflow-hidden border border-white/[0.08] bg-white/[0.06] md:grid-cols-2">
          <div className="bg-[rgb(11_11_14)] p-8">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5"><History size={18} /></span>
            <h3 className="mt-5 text-xl font-semibold">A documented history of every change</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              On every merge, Forge writes one entry from <span className="text-text">that change's diff alone</span> —
              what changed, why, the areas touched, the risk, and anything a consumer would notice. It opens as a
              PR, never a push to your default branch.
            </p>
            <div className="mt-5 overflow-hidden rounded-lg border border-white/10 p-4 font-mono text-[12.5px] leading-6 text-white/70">
              <div className="text-white/90">## 2026-08-02 — Add response caching (#128)</div>
              <div className="mt-1">**Risk:** 🟡 medium · **Areas:** <span className="text-white/85">`src/cache`</span></div>
              <div className="mt-2 text-muted">Responses are now cached for 60s…</div>
            </div>
            <Link to="/github#history" className="mt-6 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted hover:text-text">
              How it works <ArrowRight size={14} />
            </Link>
          </div>

          <div className="bg-[rgb(11_11_14)] p-8">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5"><CalendarClock size={18} /></span>
            <h3 className="mt-5 text-xl font-semibold">Routines, on your schedule</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              A saved skill plus its triggers — and one routine can carry all three at once: a nightly cron, an
              on-demand <code className="text-white/70">/run</code>, and a reaction to any repository event, each
              narrowed by filters.
            </p>
            <div className="mt-5 space-y-2.5 text-sm">
              {[
                ['Scheduled', 'Nightly digests, weekly docs-drift sweeps.'],
                ['On demand', '/run nightly-digest, from any thread.'],
                ['Event-driven', 'On merge, on release, on a labelled PR.'],
              ].map(([t, d]) => (
                <div key={t} className="flex gap-3">
                  <span className="text-white/40">→</span>
                  <span><span className="font-medium text-text">{t}</span> — {d}</span>
                </div>
              ))}
            </div>
            <div className="mt-4">
              <Code label=".github/agent.yml" lang="yaml" code={`routines:
- name: nightly-digest
  skill: commit-summary
  schedule: "0 9 * * *"
  manual: true`} />
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Runs on GitHub's own scheduler, inside your CI, on your credentials — no Forge-operated service
              holds a token for your repo.
            </p>
            <Link to="/schedules" className="mt-5 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted hover:text-text">
              Set up a schedule <ArrowRight size={14} />
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
