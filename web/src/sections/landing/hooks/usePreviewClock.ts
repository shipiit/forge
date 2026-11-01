import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import { FINAL_FRAME, frameAt, LOOP_MS, type Frame } from '../lib/preview-script';

/**
 * Drives the hero preview. Ticks a few times a second rather than every
 * animation frame: the script changes in steps, and framer handles the
 * in-between. With reduced motion it holds on the finished review.
 */
export function usePreviewClock(tickMs = 100): { frame: Frame; replay: () => void; paused: boolean; toggle: () => void } {
  const reduce = useReducedMotion();
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const last = useRef<number | null>(null);

  useEffect(() => {
    if (reduce || paused) {
      last.current = null;
      return;
    }
    const id = window.setInterval(() => {
      const now = performance.now();
      const step = last.current === null ? 0 : now - last.current;
      last.current = now;
      setElapsed((e) => (e + step) % LOOP_MS);
    }, tickMs);
    return () => window.clearInterval(id);
  }, [reduce, paused, tickMs]);

  const replay = useCallback(() => {
    last.current = null;
    setElapsed(0);
    setPaused(false);
  }, []);
  const toggle = useCallback(() => setPaused((p) => !p), []);

  return { frame: reduce ? FINAL_FRAME : frameAt(elapsed), replay, paused: Boolean(reduce) || paused, toggle };
}
