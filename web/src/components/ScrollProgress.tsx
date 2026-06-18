import { motion, useScroll, useSpring } from 'framer-motion';

/** Thin gradient progress bar pinned to the very top, fills as you scroll. */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const x = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.3 });
  return (
    <motion.div
      aria-hidden
      style={{ scaleX: x }}
      className="fixed inset-x-0 top-0 z-[100] h-[3px] origin-left"
    >
      <div className="h-full w-full bg-gradient-to-r from-[rgb(167_139_250)] via-[rgb(236_72_153)] to-[rgb(167_139_250)]" />
    </motion.div>
  );
}

/** Small concentric-ring section indicator (decorative), like autophocus. */
export function RingDot({ className = '' }: { className?: string }) {
  return (
    <span aria-hidden className={`relative inline-flex h-5 w-5 items-center justify-center ${className}`}>
      <span className="absolute inset-0 rounded-full border border-white/20" />
      <span className="absolute inset-0 rounded-full border border-white/30" style={{ animation: 'ringpulse 2.6s ease-out infinite' }} />
      <span className="h-1.5 w-1.5 rounded-full bg-white" />
    </span>
  );
}
