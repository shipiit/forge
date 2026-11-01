import { AnimatePresence, motion } from 'framer-motion';
import { BadgeCheck, CircleCheck, GitCommitHorizontal } from 'lucide-react';
import { CANDIDATES, FINDING_LINE, FIX_COMMIT, SUGGESTION } from '../lib/preview-script';

interface ReviewCommentProps {
  checkShown: boolean;
  fixApplied: boolean;
  resolved: boolean;
}

export function ReviewComment({ checkShown, fixApplied, resolved }: ReviewCommentProps) {
  const finding = CANDIDATES.find((c) => c.verdict === 'confirmed');
  if (!finding) return null;
  return (
    <div className="space-y-3 px-4 py-4">
      <motion.article
        layout
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: resolved ? 0.75 : 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className={`border ${resolved ? 'border-ok/30' : 'border-white/[0.1]'} bg-white/[0.02]`}
        aria-label="Inline review comment"
      >
        <header className="flex items-center gap-2 border-b border-white/[0.08] px-3 py-2 text-[12px]">
          <span className="font-semibold">shipit-forge</span>
          <span className="border border-white/15 px-1 text-[10px] text-white/50">bot</span>
          <span className="text-white/45">on line {FINDING_LINE}</span>
          <AnimatePresence mode="wait" initial={false}>
            {resolved ? (
              <motion.span key="resolved" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="ml-auto inline-flex items-center gap-1 border border-ok/40 px-1.5 text-[11px] text-ok">
                <CircleCheck size={12} aria-hidden /> Resolved
              </motion.span>
            ) : (
              <motion.span key="verified" exit={{ opacity: 0 }} className="ml-auto inline-flex items-center gap-1 text-[11px] text-ok">
                <BadgeCheck size={13} aria-hidden /> Verified
              </motion.span>
            )}
          </AnimatePresence>
        </header>

        <motion.div layout className="space-y-2 px-3 py-3 text-[13px]">
          <div className="font-semibold">
            {finding.title} <span className="font-normal text-white/50">· High · CWE-918</span>
          </div>
          {!resolved && (
            <p className="text-muted">Anyone can make the server fetch internal addresses, including cloud metadata. Restore the allowlist:</p>
          )}
          <div className="border border-white/[0.08] font-mono text-[12px]">
            <div className="flex items-center justify-between border-b border-white/[0.08] px-2 py-1 text-[10px] uppercase tracking-[0.14em] text-white/45">
              <span>Suggested change</span>
              <motion.span
                animate={{ opacity: 1 }}
                className={`border px-1.5 py-0.5 normal-case tracking-normal ${fixApplied ? 'border-ok/40 text-ok' : 'border-white/15 text-white/70'}`}
              >
                {fixApplied ? `Committed in ${FIX_COMMIT}` : 'Commit suggestion'}
              </motion.span>
            </div>
            <div className="bg-rose-400/[0.07] px-2 py-1 text-rose-100/80">-   const url = req.body.url;</div>
            <div className="bg-emerald-400/[0.07] px-2 py-1 text-emerald-100/90">+ {SUGGESTION}</div>
          </div>
        </motion.div>
      </motion.article>

      <AnimatePresence initial={false}>
        {fixApplied && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-2 font-mono text-[11.5px] text-white/60"
          >
            <GitCommitHorizontal size={14} aria-hidden /> {FIX_COMMIT} Apply suggestion from shipit-forge
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        initial={false}
        animate={{ opacity: checkShown ? 1 : 0, y: checkShown ? 0 : 6 }}
        transition={{ duration: 0.35 }}
        className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-white/[0.08] pt-3 text-[12px] text-muted"
        aria-hidden={!checkShown}
      >
        <CircleCheck size={14} className="text-ok" aria-hidden />
        {resolved ? (
          <>
            <span className="text-text">Re-review of {FIX_COMMIT}</span>
            <span>no new findings · thread resolved by Forge</span>
          </>
        ) : (
          <>
            <span className="text-text">Security scan</span>
            <span>4 scanners · no findings</span>
            <span className="text-white/25">|</span>
            <span>Review: kept 1 of 2, dropped 1 the code did not bear out</span>
          </>
        )}
      </motion.div>
    </div>
  );
}
