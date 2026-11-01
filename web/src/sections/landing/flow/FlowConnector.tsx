import { motion, useReducedMotion } from 'framer-motion';

interface FlowConnectorProps {
  active: boolean;
}

/** A line between two stages, with work travelling along it while that hand-off is happening. */
export function FlowConnector({ active }: FlowConnectorProps) {
  const reduce = useReducedMotion();
  return (
    <div className="relative hidden h-px min-w-[28px] flex-1 lg:block" aria-hidden>
      <div className={`absolute inset-0 transition-colors duration-500 ${active ? 'bg-accentWarm/60' : 'bg-white/[0.12]'}`} />
      {active && !reduce && (
        <motion.span
          className="absolute top-1/2 h-[3px] w-5 -translate-y-1/2 rounded-full bg-accentWarm shadow-[0_0_12px_rgba(251,146,60,0.9)]"
          initial={{ left: '0%', opacity: 0 }}
          animate={{ left: ['0%', '85%'], opacity: [0, 1, 1, 0] }}
          transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
    </div>
  );
}
