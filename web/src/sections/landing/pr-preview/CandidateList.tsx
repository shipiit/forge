import { AnimatePresence, motion } from 'framer-motion';
import { Check, X } from 'lucide-react';
import { CANDIDATES } from '../lib/preview-script';

interface CandidateListProps {
  shown: number;
  verdicts: number;
}

export function CandidateList({ shown, verdicts }: CandidateListProps) {
  return (
    <div className="space-y-2 px-4 py-4">
      <div className="text-[11px] uppercase tracking-[0.16em] text-white/45">Candidate findings</div>
      <ul className="space-y-2" aria-live="polite">
        <AnimatePresence initial={false}>
          {CANDIDATES.slice(0, shown).map((c) => {
            const judged = c.id < verdicts;
            const rejected = judged && c.verdict === 'rejected';
            return (
              <motion.li
                key={c.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: rejected ? 0.55 : 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.35 }}
                className="border border-white/[0.08] px-3 py-2.5 text-[13px]"
              >
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] uppercase tracking-[0.14em] ${c.severity === 'high' ? 'text-orange-300' : 'text-yellow-200/80'}`}>
                    {c.severity}
                  </span>
                  <span className={rejected ? 'text-white/60 line-through decoration-white/40' : 'text-text'}>{c.title}</span>
                  <span className="ml-auto font-mono text-[11px] text-white/40">{c.where}</span>
                </div>
                <AnimatePresence>
                  {judged && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      transition={{ duration: 0.3 }}
                      className="mt-1.5 flex items-start gap-1.5 text-[12px]"
                    >
                      {c.verdict === 'confirmed' ? (
                        <Check size={13} className="mt-0.5 shrink-0 text-ok" aria-hidden />
                      ) : (
                        <X size={13} className="mt-0.5 shrink-0 text-white/50" aria-hidden />
                      )}
                      <span className="text-muted">
                        <span className={c.verdict === 'confirmed' ? 'text-ok' : 'text-white/70'}>
                          {c.verdict === 'confirmed' ? 'Confirmed' : 'Dropped'}
                        </span>{' '}
                        — {c.reason}
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </div>
  );
}
