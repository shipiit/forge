import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { COMPARISON, PRODUCTS, type Cell } from './lib/comparison';
import { rise } from './motion';

function CellView({ cell }: { cell: Cell }) {
  if (cell.kind === 'unknown') return <span className="text-white/35">Not documented</span>;
  if (cell.kind === 'text') return <span className="text-white/75">{cell.text}</span>;
  return (
    <span className="inline-flex items-start gap-2">
      <Check size={15} className="mt-0.5 shrink-0 text-ok" aria-label="Yes" />
      {cell.text && <span className="text-white/85">{cell.text}</span>}
    </span>
  );
}

export function Comparison() {
  return (
    <section id="compare" className="border-t border-white/[0.07] px-7 py-24">
      <div className="mx-auto max-w-7xl">
        <motion.div {...rise}>
          <span className="eyebrow eyebrow-ember">Compared</span>
          <h2 className="display mt-6 text-[clamp(34px,5vw,60px)]">
            The managed reviewers&rsquo; shape.
            <br />
            <span className="dim">On your own key.</span>
          </h2>
          <p className="mt-5 max-w-2xl text-muted">
            Claude Code Review and Cursor Bugbot set the bar: find, verify, then post. Forge does the same, adds
            deterministic scanning and supply-chain checks, and runs wherever you run it.
          </p>
        </motion.div>

        <motion.div {...rise} className="mt-12 overflow-x-auto border border-white/[0.08]">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/[0.08]">
                <th scope="col" className="w-[26%] px-5 py-4 font-medium text-muted">Feature</th>
                {PRODUCTS.map((p) => (
                  <th
                    key={p.key}
                    scope="col"
                    className={`px-5 py-4 font-semibold ${p.key === 'forge' ? 'bg-accentWarm/[0.07] text-accentWarm' : 'text-text'}`}
                  >
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((row, i) => (
                <motion.tr
                  key={row.feature}
                  initial={{ opacity: 0, y: 8 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-40px' }}
                  transition={{ duration: 0.4, delay: Math.min(i, 8) * 0.03 }}
                  className="border-b border-white/[0.06] last:border-b-0"
                >
                  <th scope="row" className="px-5 py-3.5 align-top font-medium text-white/90">{row.feature}</th>
                  <td className="bg-accentWarm/[0.04] px-5 py-3.5 align-top"><CellView cell={row.forge} /></td>
                  <td className="px-5 py-3.5 align-top"><CellView cell={row.claude} /></td>
                  <td className="px-5 py-3.5 align-top"><CellView cell={row.bugbot} /></td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </motion.div>
        <p className="mt-4 text-xs text-muted">
          From each product&rsquo;s public documentation, November 2026. &ldquo;Not documented&rdquo; means the docs do not
          say — not that the feature is absent.
        </p>
      </div>
    </section>
  );
}
