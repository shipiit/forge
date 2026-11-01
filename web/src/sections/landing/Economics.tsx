import { motion } from 'framer-motion';
import { Check, Search, RefreshCw, Blocks, Gauge, Server } from 'lucide-react';
import { rise } from './motion';

export function Economics() {
  return (
    <section id="cost" className="border-t border-white/[0.07] px-7 py-24">
      <div className="mx-auto max-w-7xl">
        <motion.div {...rise}>
          <span className="eyebrow eyebrow-ember">Economics</span>
          <h2 className="display mt-6 text-[clamp(34px,5vw,60px)]">Your key.<br /><span className="dim">No markup.</span></h2>
          <p className="mt-5 max-w-2xl text-muted">
            Forge tracks its own spend to the token — tokens used, how many came from cache, and
            the estimated cost. And it works hard to keep that number small.
          </p>
        </motion.div>

        <div className="mt-12 grid gap-px overflow-hidden border border-white/[0.08] bg-white/[0.06] sm:grid-cols-2 lg:grid-cols-3">
          {[
            { I: Gauge, t: 'Prompt caching', d: 'System prompt, tool schemas, and the growing transcript are all cached — repeated context bills at roughly a tenth of the input rate.' },
            { I: Blocks, t: 'Only the tools it needs', d: 'Unused tool schemas are resent every single turn. An allowlist removes them from the bill entirely.' },
            { I: Search, t: 'Scoped to the change', d: 'Reviewing only the files a PR touched costs a fraction of reading a whole repository.' },
            { I: RefreshCw, t: 'Bounded loops', d: 'Iterations are capped and CI auto-fix stops after two attempts. Nothing runs away overnight.' },
            { I: Server, t: 'Nine providers', d: 'Anthropic, OpenAI, Gemini, Vertex, Bedrock, Groq, Together, Ollama, or any OpenAI-compatible endpoint — with a fallback chain.' },
            { I: Check, t: 'Reported, every time', d: 'A cost footer on every PR and comment. The month-end bill is never a surprise.' },
          ].map((e, i) => (
            <motion.div key={e.t} {...rise} transition={{ ...rise.transition, delay: (i % 3) * 0.07 }} className="bg-[rgb(11_11_14)] p-7">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5"><e.I size={18} /></span>
              <h3 className="mt-5 text-lg font-semibold">{e.t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{e.d}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
