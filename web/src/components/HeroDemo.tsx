import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Sparkles, RotateCcw } from 'lucide-react';

const ISSUE = 'The /search tool scans node_modules and floods results before reaching real code…';
const STEPS = [
  '🔍  Cloning repo + mapping the codebase',
  '✏️  Editing src/agent/tools/search.ts',
  '🧪  Installing deps · running tests … ✓ pass',
  '🛡️  Self-review (security + code) … clean',
];

type Phase = 'typing' | 'running' | 'done';

/** Live, self-playing demo of an issue → fix PR. */
export function HeroDemo() {
  const [typed, setTyped] = useState('');
  const [phase, setPhase] = useState<Phase>('typing');
  const [step, setStep] = useState(-1);
  const timers = useRef<number[]>([]);

  function clear() { timers.current.forEach(clearTimeout); timers.current = []; }
  const after = (ms: number, fn: () => void) => { timers.current.push(window.setTimeout(fn, ms)); };

  function play() {
    clear();
    setTyped(''); setPhase('typing'); setStep(-1);
    // type the issue
    for (let i = 1; i <= ISSUE.length; i++) after(18 * i, () => setTyped(ISSUE.slice(0, i)));
    const t = 18 * ISSUE.length;
    after(t + 500, () => setPhase('running'));
    // stream steps
    STEPS.forEach((_, i) => after(t + 700 + i * 850, () => setStep(i)));
    after(t + 700 + STEPS.length * 850 + 400, () => setPhase('done'));
  }

  useEffect(() => { play(); return clear; /* eslint-disable-next-line */ }, []);

  return (
    <div className="panel relative p-7">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-[0.18em] text-muted">New issue</span>
        <button onClick={play} className="inline-flex items-center gap-1 text-xs text-muted hover:text-text" aria-label="Replay demo">
          <RotateCcw size={12} /> replay
        </button>
      </div>
      <h3 className="mt-4 text-center text-2xl font-bold">What's broken?</h3>
      <p className="mt-2 text-center text-sm text-muted">Describe the bug — Forge opens a fix PR.</p>

      <div className="mt-5 min-h-[84px] rounded-xl border border-white/10 bg-black/40 p-4 text-sm text-white/80">
        {typed}
        {phase === 'typing' && <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 bg-white/70" style={{ animation: 'dotpulse 1s steps(1) infinite' }} />}
      </div>

      <div className="mx-auto mt-5 flex w-fit items-center gap-2 rounded-lg border border-white/15 px-5 py-2.5 text-sm font-semibold">
        {phase === 'running' ? <span className="h-3.5 w-3.5 animate-spinslow rounded-full border-2 border-white/30 border-t-white" /> : <Sparkles size={15} />}
        {phase === 'running' ? 'Working…' : phase === 'done' ? 'Done' : 'Open a fix PR'}
      </div>

      {/* live stream */}
      <div className="mt-5 space-y-1.5">
        <AnimatePresence>
          {phase !== 'typing' && STEPS.map((s, i) => i <= step && (
            <motion.div key={s} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3 }}
              className="font-mono text-[12px] text-muted">{s}</motion.div>
          ))}
        </AnimatePresence>

        <AnimatePresence>
          {phase === 'done' && (
            <motion.a href="https://github.com/shipiit/forge" target="_blank" rel="noopener noreferrer"
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
              className="mt-2 flex items-center gap-2 rounded-lg border border-emerald-400/25 bg-emerald-400/5 px-3 py-2 text-[13px] text-emerald-200 hover:bg-emerald-400/10">
              🚀 Opened <b className="text-emerald-100">PR #129</b> — Fix: search excludes node_modules
            </motion.a>
          )}
        </AnimatePresence>
      </div>
      <p className="mt-4 text-center text-xs text-muted">⌘/Ctrl+Enter · no account needed to try</p>
    </div>
  );
}
