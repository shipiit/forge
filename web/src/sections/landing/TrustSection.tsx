import { motion } from 'framer-motion';
import { GitFork, KeyRound, ScrollText, ShieldCheck } from 'lucide-react';
import { rise } from './motion';

const RULES = [
  {
    I: KeyRound,
    t: 'Only people with write access',
    d: 'A comment, /command, @mention or new issue from anyone else is ignored before a single token is spent, so a stranger cannot start a run from a thread or get a commit pushed. Pull-request reviews stay read-only, bounded by your hourly limit and spend cap.',
  },
  {
    I: GitFork,
    t: 'Fork-safe',
    d: 'A pull request from a fork is read by its pull-request number, never by a branch name that might also exist in your repository — and Forge never pushes to a fork.',
  },
  {
    I: ScrollText,
    t: 'Rules from the base branch',
    d: 'REVIEW.md, FORGE.md, AGENTS.md and skills are read from the branch being merged into. A pull request cannot rewrite the instructions it is reviewed by.',
  },
  {
    I: ShieldCheck,
    t: 'Never merges, never approves',
    d: 'Every change is a pull request you control. A high-severity finding is posted as "changes requested"; the scan\'s check run gates a merge only if you make it a required check.',
  },
];

export function TrustSection() {
  return (
    <section id="trust" className="border-t border-white/[0.07] px-7 py-24">
      <div className="mx-auto max-w-7xl">
        <motion.div {...rise}>
          <span className="eyebrow eyebrow-ember">Safe on public repositories</span>
          <h2 className="display mt-6 text-[clamp(34px,5vw,60px)]">
            An agent with write access
            <br />
            <span className="dim">answers only to you.</span>
          </h2>
        </motion.div>
        <div className="mt-12 grid gap-px overflow-hidden border border-white/[0.08] bg-white/[0.06] sm:grid-cols-2">
          {RULES.map((r, i) => (
            <motion.div key={r.t} {...rise} transition={{ ...rise.transition, delay: (i % 2) * 0.07 }} className="bg-[rgb(11_11_14)] p-8">
              <r.I size={20} className="text-accentWarm" aria-hidden />
              <h3 className="mt-5 text-lg font-semibold">{r.t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{r.d}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
