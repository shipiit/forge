import { useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

/**
 * How many of `total` items are showing: one more every `stepMs` while
 * `active`, then a pause of `holdMs` on the full set, then again from the
 * start. `resetKey` restarts it, for when the content behind it changes.
 * With reduced motion, everything shows at once and nothing moves.
 */
export function useReveal(total: number, opts: { stepMs?: number; holdMs?: number; active?: boolean; resetKey?: string } = {}): number {
  const { stepMs = 650, holdMs = 2600, active = true, resetKey = '' } = opts;
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(0);

  useEffect(() => setShown(0), [resetKey]);

  useEffect(() => {
    if (reduce || !active || total <= 0) return;
    const wait = shown >= total ? holdMs : stepMs;
    const id = window.setTimeout(() => setShown((n) => (n >= total ? 0 : n + 1)), wait);
    return () => window.clearTimeout(id);
  }, [shown, total, stepMs, holdMs, active, reduce]);

  return reduce ? total : Math.min(shown, total);
}
