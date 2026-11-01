import { AnimatePresence, motion } from 'framer-motion';
import { GitPullRequest, Pause, Play, RotateCcw } from 'lucide-react';
import { usePreviewClock } from '../hooks/usePreviewClock';
import { PR, SCANNERS } from '../lib/preview-script';
import { CandidateList } from './CandidateList';
import { DiffView } from './DiffView';
import { ReviewComment } from './ReviewComment';
import { StageRail } from './StageRail';

/** The hero: one pull request, reviewed the way Forge reviews it, on a loop. */
export function PrPreview() {
  const { frame, replay, paused, toggle } = usePreviewClock();
  const posting = frame.stage === 'post' || frame.stage === 'fixed';

  return (
    <figure className="panel relative overflow-hidden !rounded-none bg-[rgb(11_11_14)]" aria-label="Animated example of a Forge pull-request review">
      <header className="flex items-center gap-3 border-b border-white/[0.08] px-4 pb-3 pt-6">
        <GitPullRequest size={16} className="text-emerald-300" aria-hidden />
        <div className="min-w-0">
          <div className="truncate text-[14px] font-semibold">
            {PR.title} <span className="font-normal text-white/40">#{PR.number}</span>
          </div>
          <div className="font-mono text-[11px] text-white/40">{PR.branch} → main</div>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={toggle}
            className="flex h-7 w-7 items-center justify-center border border-white/10 text-white/60 hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/50"
            aria-label={paused ? 'Play the animation' : 'Pause the animation'}
          >
            {paused ? <Play size={13} aria-hidden /> : <Pause size={13} aria-hidden />}
          </button>
          <button
            type="button"
            onClick={replay}
            className="flex h-7 w-7 items-center justify-center border border-white/10 text-white/60 hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/50"
            aria-label="Replay from the start"
          >
            <RotateCcw size={13} aria-hidden />
          </button>
        </div>
      </header>

      <StageRail frame={frame} />
      <DiffView flagged={frame.verdictsShown > 0 || posting} fixed={frame.fixApplied} />

      <div className="min-h-[248px]">
        <AnimatePresence mode="wait">
          {frame.stage === 'scan' && (
            <motion.ul
              key="scan"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="grid grid-cols-2 gap-2 px-4 py-4 font-mono text-[12px]"
            >
              {SCANNERS.map((s, i) => (
                <li key={s} className="flex items-center justify-between border border-white/[0.08] px-3 py-2">
                  <span className="text-white/70">{s}</span>
                  <span className={i < frame.scannersDone ? 'text-ok' : 'text-white/30'}>
                    {i < frame.scannersDone ? 'clean' : 'scanning…'}
                  </span>
                </li>
              ))}
            </motion.ul>
          )}
          {(frame.stage === 'find' || frame.stage === 'verify') && (
            <motion.div key="judge" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <CandidateList shown={frame.candidatesShown} verdicts={frame.verdictsShown} />
            </motion.div>
          )}
          {posting && frame.commentShown && (
            <motion.div key="post" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <ReviewComment checkShown={frame.checkShown} fixApplied={frame.fixApplied} resolved={frame.resolved} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </figure>
  );
}
