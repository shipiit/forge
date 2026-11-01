import { useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

/**
 * An index that steps through `count` items every `ms`, for diagrams that
 * highlight one thing at a time. Holds still when motion is reduced or the
 * caller pauses it (for example while the user is hovering).
 */
export function useCycle(count: number, ms: number, paused = false): number {
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (reduce || paused || count <= 1) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % count), ms);
    return () => window.clearInterval(id);
  }, [count, ms, paused, reduce]);

  return count > 0 ? index % count : 0;
}
