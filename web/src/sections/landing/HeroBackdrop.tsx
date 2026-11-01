import { motion, useReducedMotion } from 'framer-motion';

/**
 * Behind the hero: a fading grid, two slow ember glows, and a scan line
 * passing over it — the page doing, quietly, what the product does.
 * Decorative only; nothing here is read by assistive technology.
 */
export function HeroBackdrop() {
  const reduce = useReducedMotion();
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div
        className="absolute inset-0 bg-grid [background-size:56px_56px]"
        style={{ maskImage: 'radial-gradient(ellipse 75% 65% at 60% 40%, black 30%, transparent 75%)', WebkitMaskImage: 'radial-gradient(ellipse 75% 65% at 60% 40%, black 30%, transparent 75%)' }}
      />
      <motion.div
        className="absolute -right-40 -top-32 h-[560px] w-[560px] rounded-full bg-[radial-gradient(circle,rgba(251,146,60,0.22),transparent_62%)] blur-3xl"
        animate={reduce ? undefined : { x: [0, -60, 0], y: [0, 40, 0], scale: [1, 1.08, 1] }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute -bottom-48 left-[-10%] h-[480px] w-[480px] rounded-full bg-[radial-gradient(circle,rgba(245,158,11,0.10),transparent_62%)] blur-3xl"
        animate={reduce ? undefined : { x: [0, 80, 0], y: [0, -30, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
      />
      {!reduce && (
        <motion.div
          className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-accentWarm/60 to-transparent"
          initial={{ top: '-5%' }}
          animate={{ top: ['-5%', '105%'] }}
          transition={{ duration: 7, repeat: Infinity, ease: 'linear', repeatDelay: 2 }}
        >
          <div className="absolute inset-x-0 -top-16 h-16 bg-gradient-to-b from-transparent to-accentWarm/[0.05]" />
        </motion.div>
      )}
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-[rgb(var(--canvas))]" />
    </div>
  );
}
