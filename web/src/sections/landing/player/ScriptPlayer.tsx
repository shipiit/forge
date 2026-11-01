import { useRef } from 'react';
import { AnimatePresence, motion, useInView } from 'framer-motion';
import { useReveal } from '../hooks/useReveal';

export interface ScriptLine {
  kind: 'trigger' | 'step' | 'result' | 'note';
  text: string;
}

const TONE: Record<ScriptLine['kind'], string> = {
  trigger: 'text-text',
  step: 'text-white/65',
  result: 'text-ok',
  note: 'text-accentWarm',
};

const MARK: Record<ScriptLine['kind'], string> = { trigger: '›', step: '·', result: '✓', note: '!' };

interface ScriptPlayerProps {
  lines: ScriptLine[];
  /** Changing it restarts the playback from the first line. */
  playKey: string;
  stepMs?: number;
}

/** Lines of a run appearing one at a time, as they would in the job log. */
export function ScriptPlayer({ lines, playKey, stepMs = 700 }: ScriptPlayerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: '-80px' });
  const shown = useReveal(lines.length, { stepMs, active: inView, resetKey: playKey });

  return (
    <div ref={ref} className="font-mono text-[12.5px] leading-6" aria-live="off">
      <ol className="space-y-1">
        <AnimatePresence initial={false}>
          {lines.slice(0, shown).map((l, i) => (
            <motion.li
              key={`${playKey}-${i}`}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className={`flex gap-3 ${TONE[l.kind]}`}
            >
              <span className="w-3 shrink-0 select-none text-white/35" aria-hidden>{MARK[l.kind]}</span>
              <span className="min-w-0 break-words">{l.text}</span>
            </motion.li>
          ))}
        </AnimatePresence>
        {shown < lines.length && (
          <li className="flex gap-3 text-white/35" aria-hidden>
            <span className="w-3" />
            <motion.span animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 1, repeat: Infinity }}>▍</motion.span>
          </li>
        )}
      </ol>
      <ol className="sr-only">
        {lines.map((l, i) => (
          <li key={i}>{l.text}</li>
        ))}
      </ol>
    </div>
  );
}
