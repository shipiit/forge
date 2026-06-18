import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, ShieldAlert, Check, GitPullRequest } from 'lucide-react';
import { Header, Footer } from '../components/Layout';
import { ScrollProgress, RingDot } from '../components/ScrollProgress';
import { HeroDemo } from '../components/HeroDemo';

const GITHUB = 'https://github.com/shipiit/forge';
const rise = { initial: { opacity: 0, y: 26 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: '-80px' }, transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] as const } };

function Steps({ items, link, to }: { items: [string, string, string][]; link: string; to: string }) {
  return (
    <div>
      {items.map(([n, t, d], i) => (
        <div key={n} className={`py-6 ${i ? 'row-line' : ''}`}>
          <div className="flex items-baseline gap-4">
            <span className="text-xs tabular-nums text-muted">({n})</span>
            <div>
              <h4 className="text-lg font-semibold">{t}</h4>
              <p className="mt-1 max-w-md text-sm leading-relaxed text-muted">{d}</p>
            </div>
          </div>
        </div>
      ))}
      <Link to={to} className="mt-6 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted hover:text-text">
        {link} <ArrowRight size={14} />
      </Link>
    </div>
  );
}

export function Landing() {
  return (
    <>
      <ScrollProgress />
      <Header onLanding />

      {/* HERO */}
      <section className="relative overflow-hidden px-7 pb-28 pt-24">
        <div className="mx-auto grid max-w-7xl items-center gap-16 lg:grid-cols-[1fr_1fr]">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }}>
            <span className="eyebrow">AI Coding Agent</span>
            <h1 className="display mt-7 text-balance text-[clamp(48px,7vw,92px)]">
              Your all-in-one<br /><span className="dim">coding agent.</span>
            </h1>
            <p className="mt-7 max-w-md text-[17px] leading-relaxed text-muted">
              Fix issues, review PRs, audit security, auto-fix CI — from first issue to merged PR, all in one place. Try it with your own repo, no account needed.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-6">
              <Link to="/docs" className="btn btn-white !rounded-none !uppercase !tracking-[0.14em]">Get started <ArrowRight size={15} /></Link>
              <a href={GITHUB} target="_blank" rel="noopener noreferrer" className="text-sm text-muted underline-offset-4 hover:text-text hover:underline">Working at a team? Star on GitHub</a>
            </div>
          </motion.div>

          {/* live interactive demo */}
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.12 }} className="relative">
            <div className="absolute -right-2 -top-9 hidden lg:block"><RingDot /></div>
            <HeroDemo />
          </motion.div>
        </div>
      </section>

      {/* MADE ON / EXAMPLES */}
      <section id="examples" className="border-t border-white/[0.07] px-7 py-24">
        <div className="mx-auto max-w-7xl">
          <motion.div {...rise}>
            <h2 className="display text-[clamp(34px,5vw,60px)]">Shipped by <span className="dim">ShipIT Forge.</span></h2>
            <p className="mt-4 max-w-xl text-muted">Real comments, reviews, and PRs produced end-to-end on live repositories — fixes, security findings, and verified tests.</p>
          </motion.div>

          <div className="mt-12 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
            <motion.div {...rise} className="panel overflow-hidden">
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
                <motion.div key={e.t} {...rise} transition={{ ...rise.transition, delay: i * 0.08 }} className="panel p-5">
                  <h4 className="text-[15px] font-semibold">{e.t}</h4>
                  <p className="mt-1.5 text-sm text-muted">{e.d}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* PIPELINE */}
      <section id="how" className="border-t border-white/[0.07] px-7 py-24">
        <div className="mx-auto max-w-7xl">
          <motion.div {...rise}>
            <span className="eyebrow">The pipeline</span>
            <h2 className="display mt-6 text-[clamp(34px,5vw,60px)]">From first issue<br /><span className="dim">to merged PR.</span></h2>
            <p className="mt-5 max-w-lg text-muted">One connected loop. Forge investigates, fixes, verifies, and reviews — you stay in control of every merge.</p>
          </motion.div>
          <motion.div {...rise} className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.06] md:grid-cols-2">
            <div className="bg-[rgb(11_11_14)] p-8">
              <h3 className="text-xl font-semibold">For maintainers</h3>
              <p className="mt-2 text-sm text-muted">Label an issue or comment <code className="text-white/70">/fix</code> — Forge opens a verified PR. You review and merge.</p>
              <Steps items={[['01', 'Analyze the issue', 'A detailed root-cause comment with the proposed fix and affected files.'], ['02', 'Fix + write tests', 'Edits the code, adds tests, installs deps, and runs the suite.'], ['03', 'Open the PR', 'A draft if tests fail; otherwise a clean PR that closes the issue.']]} link="See the fix flow" to="/flow/fix" />
            </div>
            <div className="bg-[rgb(11_11_14)] p-8">
              <h3 className="text-xl font-semibold">For security</h3>
              <p className="mt-2 text-sm text-muted">Every PR is reviewed automatically; <code className="text-white/70">/audit</code> scans the whole repo.</p>
              <Steps items={[['01', 'Scan the diff', 'CWE/OWASP coverage — SSRF, injection, authz, secrets, deserialization.'], ['02', 'Ingest live CVEs', 'Merges GitHub Dependabot alerts so findings are always current.'], ['03', 'Request changes', 'Inline comments with severity + suggested fixes. Never auto-approves.']]} link="See the review flow" to="/flow/review" />
            </div>
          </motion.div>
        </div>
      </section>

      {/* PRINCIPLE */}
      <section className="relative overflow-hidden border-t border-white/[0.07] px-7 py-32">
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 -z-10 -translate-x-1/2 -translate-y-1/2">
          {[260, 420, 600, 800, 1000].map((s) => (
            <div key={s} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/[0.05]" style={{ width: s, height: s }} />
          ))}
        </div>
        <motion.div {...rise} className="mx-auto max-w-3xl text-center">
          <span className="eyebrow justify-center">The ShipIT Forge principle</span>
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

      {/* CTA */}
      <section className="border-t border-white/[0.07] px-7 py-28 text-center">
        <motion.div {...rise} className="mx-auto max-w-3xl">
          <h2 className="display text-[clamp(36px,5.5vw,68px)]">Write the issue.<br /><span className="dim">Forge ships the fix.</span></h2>
          <div className="mt-9 flex flex-wrap justify-center gap-5">
            <Link to="/docs" className="btn btn-white !rounded-none !uppercase !tracking-[0.14em]">Read the docs <ArrowRight size={15} /></Link>
            <a href={GITHUB} target="_blank" rel="noopener noreferrer" className="btn btn-line !rounded-none !uppercase !tracking-[0.14em]">Get it on GitHub</a>
          </div>
        </motion.div>
      </section>

      <Footer />
    </>
  );
}
