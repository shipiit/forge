import { AnimatePresence, motion } from 'framer-motion';
import { DIFF, DIFF_FIXED, FINDING_LINE, PR } from '../lib/preview-script';

interface DiffViewProps {
  /** Highlight the line the finding is about. */
  flagged: boolean;
  /** Show the file after the suggestion was committed. */
  fixed: boolean;
}

const SIGN = { ctx: ' ', add: '+', del: '-' } as const;
const TONE = {
  ctx: 'text-white/70',
  add: 'bg-emerald-400/[0.07] text-emerald-100/90',
  del: 'bg-rose-400/[0.07] text-rose-100/80',
} as const;

export function DiffView({ flagged, fixed }: DiffViewProps) {
  const lines = fixed ? DIFF_FIXED : DIFF;
  return (
    <div className="border-b border-white/[0.08]">
      <div className="flex items-center justify-between px-4 py-2 font-mono text-[11.5px] text-white/60">
        <span>{PR.file}</span>
        <span>
          <span className="text-emerald-300/80">{fixed ? '+1' : '+2'}</span> <span className="text-rose-300/80">{fixed ? '−0' : '−1'}</span>
        </span>
      </div>
      <pre className="overflow-x-auto font-mono text-[12px] leading-[22px]" aria-label={`Diff of ${PR.file}`}>
        <AnimatePresence initial={false}>
        {lines.map((l) => {
          const hit = flagged && !fixed && l.n === FINDING_LINE;
          const repaired = fixed && l.n === FINDING_LINE - 1;
          return (
            <motion.div
              key={`${l.kind}-${l.n ?? 'x'}-${l.text}`}
              layout
              initial={{ opacity: 0, height: 0 }}
              exit={{ opacity: 0, height: 0 }}
              className={`relative flex ${TONE[l.kind]}`}
              animate={{
                opacity: 1,
                height: 22,
                backgroundColor: hit ? 'rgba(251,146,60,0.14)' : repaired ? ['rgba(52,211,153,0.28)', 'rgba(52,211,153,0)'] : 'rgba(0,0,0,0)',
              }}
              transition={{ duration: repaired ? 1.6 : 0.4 }}
            >
              {hit && <span className="absolute inset-y-0 left-0 w-0.5 bg-accentWarm" aria-hidden />}
              <span className="w-10 shrink-0 select-none pr-2 text-right text-white/25">{l.n ?? ''}</span>
              <span className="w-4 shrink-0 select-none text-white/40">{SIGN[l.kind]}</span>
              <span className="pr-4">{l.text}</span>
            </motion.div>
          );
        })}
        </AnimatePresence>
      </pre>
    </div>
  );
}
