import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useCycle } from '../hooks/useCycle';
import { FLOW_NODES, FLOW_STEPS, SPECIALISTS, type FlowNodeId } from '../lib/flow';
import { FlowConnector } from './FlowConnector';
import { FlowNodeCard } from './FlowNodeCard';
import { FlowSteps } from './FlowSteps';

const ORDER: FlowNodeId[][] = [['pr'], ['scanners'], SPECIALISTS, ['verifier'], ['posted']];

/** Which column a node sits in, to tell whether a step has already passed it. */
function columnOf(id: FlowNodeId): number {
  return ORDER.findIndex((col) => col.includes(id));
}

export function AgentFlow() {
  const [picked, setPicked] = useState<number | null>(null);
  const cycled = useCycle(FLOW_STEPS.length, 3200, picked !== null);
  const step = picked ?? cycled;
  const lights = FLOW_STEPS[step]!.lights;
  const frontier = Math.max(...lights.map(columnOf));
  const card = (id: FlowNodeId) => (
    <FlowNodeCard key={id} node={FLOW_NODES[id]} lit={lights.includes(id)} done={columnOf(id) < frontier} />
  );

  return (
    <div>
      <ul className="mb-8 flex flex-wrap gap-x-6 gap-y-2 font-mono text-[11.5px] text-muted" aria-label="Legend">
        <li className="flex items-center gap-2"><span className="h-0.5 w-5 bg-accentWarm" aria-hidden /> work moving between agents</li>
        <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 bg-ok" aria-hidden /> confirmed</li>
        <li className="flex items-center gap-2"><span className="w-5 border-t border-dashed border-white/50" aria-hidden /> dropped by the verifier</li>
      </ul>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-0">
        <div className="lg:w-[190px]">{card('pr')}</div>
        <FlowConnector active={lights.includes('scanners')} />
        <div className="lg:w-[220px]">{card('scanners')}</div>
        <FlowConnector active={lights.some((l) => SPECIALISTS.includes(l))} />
        <div className="relative border border-dashed border-white/15 p-3 lg:w-[250px]">
          <span className="absolute -top-2.5 left-3 bg-[rgb(9_9_12)] px-2 font-mono text-[10px] uppercase tracking-[0.18em] text-accentWarm">
            Reviewers · in parallel
          </span>
          <div className="flex flex-col gap-2 pt-1">{SPECIALISTS.map(card)}</div>
        </div>
        <FlowConnector active={lights.includes('verifier')} />
        <div className="relative lg:w-[215px]">
          {card('verifier')}
          <AnimatePresence>
            {lights.includes('verifier') && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-2 space-y-1 font-mono text-[11px] lg:absolute lg:inset-x-0 lg:top-full"
              >
                <div className="flex items-center gap-2 text-ok"><span className="h-2 w-2 bg-ok" aria-hidden /> SSRF · confirmed</div>
                <div className="flex items-center gap-2 text-white/50 line-through"><span className="w-3 border-t border-dashed border-white/50" aria-hidden /> null user · dropped</div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <FlowConnector active={lights.includes('posted')} />
        <div className="lg:w-[215px]">{card('posted')}</div>
      </div>

      <FlowSteps active={step} onPick={(i) => setPicked(i === picked ? null : i)} />
      <p className="mt-4 text-xs text-muted">
        {picked === null ? 'Steps play automatically. Choose one to hold it.' : 'Holding on the step you chose. Choose it again to resume.'}
      </p>
    </div>
  );
}
