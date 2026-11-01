import { motion } from 'framer-motion';
import { ShieldAlert, GitPullRequest, Check } from 'lucide-react';
import { rise } from './motion';

export function Shipped() {
  return (
    <section id="examples" className="border-t border-white/[0.07] px-7 py-24">
      <div className="mx-auto max-w-7xl">
        <motion.div {...rise}>
          <h2 className="display text-[clamp(34px,5vw,60px)]">Shipped by <span className="dim">ShipIT Forge.</span></h2>
          <p className="mt-4 max-w-xl text-muted">Real comments, reviews, and PRs produced end-to-end on live repositories — fixes, security findings, and verified tests.</p>
        </motion.div>

        <div className="mt-12 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
          <motion.div {...rise} className="panel overflow-hidden !rounded-none">
            <div className="flex items-center gap-2 border-b border-white/[0.08] px-5 py-3 text-sm">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/5">🔨</span>
              <span className="font-semibold">shipit-forge</span><span className="rounded-full border border-white/15 px-1.5 text-[10px] text-muted">bot</span>
              <span className="ml-auto text-xs text-rose-300/90">requested changes</span>
            </div>
            <div className="space-y-4 p-6">
              <div className="text-xs uppercase tracking-[0.18em] text-muted">Security review</div>
              <div className="flex items-center gap-2 rounded-lg border border-rose-400/20 bg-rose-400/5 px-3 py-2 text-sm"><ShieldAlert size={15} className="text-rose-300" /> 🔴 Critical · CWE-918 SSRF · <code className="text-white/70">fetcher.js:8</code></div>
              <div className="overflow-hidden rounded-lg border border-white/10 font-mono text-[12.5px]">
                <div className="bg-rose-400/10 px-3 py-1.5 text-rose-200">- request(target, (r) =&gt; r.pipe(res))</div>
                <div className="bg-emerald-400/10 px-3 py-1.5 text-emerald-200">+ request(validateUrl(target), (r) =&gt; r.pipe(res))</div>
              </div>
              <p className="text-sm text-muted">URL was fully attacker-controlled. Suggested an all-listed validator + a regression test.</p>
            </div>
          </motion.div>

          <div className="grid gap-6">
            {[
              { I: GitPullRequest, t: '🔧 Fix ready in #128', d: 'add() subtracted instead of adding — patched + added a regression test. ✅ tests pass.' },
              { I: Check, t: '🔁 CI failed → fixed (1/2)', d: 'Read the failing type-check, corrected the signature, re-ran the suite → green. Bounded to 2 tries.' },
              { I: ShieldAlert, t: '🛡️ Full-repo audit', d: 'Whole-repo scan + live Dependabot. Flagged CVE-2021-23337 in lodash, fixed in 4.17.21.' },
            ].map((e, i) => (
              <motion.div key={e.t} {...rise} transition={{ ...rise.transition, delay: i * 0.08 }} className="panel p-5 !rounded-none">
                <h4 className="text-[15px] font-semibold">{e.t}</h4>
                <p className="mt-1.5 text-sm text-muted">{e.d}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
