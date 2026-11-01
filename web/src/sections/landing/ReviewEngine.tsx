import { motion } from 'framer-motion';
import { Check, Minus } from 'lucide-react';
import { DEPTHS } from './lib/checks';
import { AgentFlow } from './flow/AgentFlow';
import { rise } from './motion';

export function ReviewEngine() {
  return (
    <section id="review" className="border-t border-white/[0.07] px-7 py-24">
      <div className="mx-auto max-w-7xl">
        <motion.div {...rise}>
          <span className="eyebrow eyebrow-ember">How a review works</span>
          <h2 className="display mt-6 text-[clamp(34px,5vw,60px)]">
            Found by one agent.
            <br />
            <span className="ember">Checked</span> <span className="dim">by another.</span>
          </h2>
          <p className="mt-5 max-w-2xl text-muted">
            A reviewer that posts whatever it first suspects is one people learn to skim. Forge puts a separate
            verifier between &ldquo;this might be a bug&rdquo; and a comment on your pull request — the same shape as
            the managed reviewers, running on your own key.
          </p>
        </motion.div>

        <motion.div {...rise} className="mt-14">
          <AgentFlow />
        </motion.div>

        <motion.div {...rise} className="mt-16 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <caption className="pb-4 text-left text-sm text-muted">
              <code className="text-white/70">review_depth</code> in .github/agent.yml, or the{' '}
              <code className="text-white/70">review-depth</code> Action input
            </caption>
            <thead>
              <tr className="text-muted">
                <th scope="col" className="py-3 font-medium">Depth</th>
                <th scope="col" className="py-3 font-medium">Reviewers</th>
                <th scope="col" className="py-3 font-medium">Verified</th>
                <th scope="col" className="py-3 font-medium">Best for</th>
              </tr>
            </thead>
            <tbody>
              {DEPTHS.map((d) => (
                <tr key={d.depth} className="row-line">
                  <th scope="row" className="py-4 font-mono font-semibold">
                    {d.depth}
                    {d.depth === 'standard' && <span className="ml-2 text-[10px] uppercase tracking-[0.16em] text-accentWarm">default</span>}
                  </th>
                  <td className="py-4 tabular-nums">{d.finders}</td>
                  <td className="py-4">
                    {d.verified ? (
                      <span className="inline-flex items-center gap-1.5"><Check size={14} className="text-ok" aria-hidden /> Yes</span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-muted"><Minus size={14} aria-hidden /> No</span>
                    )}
                  </td>
                  <td className="py-4 text-muted">{d.bestFor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>
      </div>
    </section>
  );
}
