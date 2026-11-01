import { motion } from 'framer-motion';
import { RingDot } from '../../components/ScrollProgress';
import { rise } from './motion';

export function Principle() {
  return (
    <section className="relative overflow-hidden border-t border-white/[0.07] px-7 py-32">
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 -z-10 -translate-x-1/2 -translate-y-1/2">
        {[260, 420, 600, 800, 1000].map((s) => (
          <div key={s} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/[0.05]" style={{ width: s, height: s }} />
        ))}
      </div>
      <motion.div {...rise} className="mx-auto max-w-3xl text-center">
        <span className="eyebrow eyebrow-ember justify-center">The ShipIT Forge principle</span>
        <p className="mt-8 text-[clamp(22px,3vw,34px)] font-medium leading-snug">
          <span className="dim">No single model ships great code. </span>
          <em className="not-italic text-text">Great code comes from good decisions</em>
          <span className="dim"> — about what to change and why. Forge proposes; </span>
          <em className="not-italic text-text">the merge stays yours.</em>
        </p>
        <div className="mt-8 flex justify-center"><RingDot /></div>
        <p className="mt-8 text-sm text-muted">Every change is a pull request. Nothing merges without your approval.</p>
      </motion.div>
    </section>
  );
}
