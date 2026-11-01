import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowUpRight, Play } from 'lucide-react';
import { PrPreview } from './pr-preview/PrPreview';
import { HeroBackdrop } from './HeroBackdrop';
import { GITHUB } from './motion';

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden px-7 pb-20 pt-20">
      <HeroBackdrop />
      <div className="mx-auto grid max-w-7xl items-center gap-16 lg:grid-cols-[1fr_1fr]">
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
          <span className="eyebrow eyebrow-ember">ShipIT Forge / AI code review &amp; security</span>
          <h1 className="display mt-7 text-[clamp(36px,4.3vw,60px)]">
            {['Every pull request,', 'verified before', 'it reaches you.'].map((line, i) => (
              <motion.span
                key={line}
                className={`block ${i === 2 ? 'dim' : ''}`}
                initial={{ opacity: 0, y: 18, filter: 'blur(6px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                transition={{ duration: 0.7, delay: 0.1 + i * 0.12, ease: [0.22, 1, 0.36, 1] }}
              >
                {i === 1 ? (
                  <>
                    <span className="ember">verified</span> before
                  </>
                ) : (
                  line
                )}
              </motion.span>
            ))}
          </h1>
          <p className="mt-6 max-w-md text-[16px] leading-relaxed text-muted">
            Scanners first, then reviewers that read your code, then a second agent that checks every finding against
            it. What reaches the pull request is what the code bears out — with the fix attached.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link to="/github" className="btn btn-ember">
              Install on GitHub <ArrowUpRight size={15} aria-hidden />
            </Link>
            <a href="#review" className="btn btn-line !rounded-none uppercase tracking-[0.14em]">
              <Play size={13} aria-hidden /> See a review
            </a>
          </div>
          <p className="mt-6 flex items-center gap-2 text-sm text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-accentWarm" aria-hidden />
            Self-hosted · your own key · nine providers ·{' '}
            <a href={GITHUB} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:text-text hover:underline">
              open source
            </a>
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.12 }}
          className="frame-offset relative"
        >
          <span className="absolute -top-3 left-6 z-10 bg-accentWarm px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-black">
            A Forge review
          </span>
          <PrPreview />
          <span className="paper-tag -bottom-5 left-2 -rotate-3" aria-hidden>
            Scan. Find. Verify. Post.
          </span>
        </motion.div>
      </div>
    </section>
  );
}
