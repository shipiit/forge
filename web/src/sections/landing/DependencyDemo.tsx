import { useRef } from 'react';
import { AnimatePresence, motion, useInView } from 'framer-motion';
import { useReveal } from './hooks/useReveal';
import { ADVISORIES, BEATS, PACKAGES, findingsShown, packageState, type Verdict } from './lib/supply-chain';
import { rise } from './motion';

const VERDICT: Record<Verdict, { dot: string; text: string; word: string }> = {
  malicious: { dot: 'bg-rose-400', text: 'text-rose-300', word: 'Critical' },
  vulnerable: { dot: 'bg-orange-400', text: 'text-orange-300', word: 'High' },
  clean: { dot: 'bg-ok', text: 'text-ok', word: 'Clean' },
};

export function DependencyDemo() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: '-120px' });
  const beat = useReveal(BEATS, { stepMs: 800, holdMs: 4500, active: inView });
  const posted = findingsShown(beat);

  return (
    <section id="supply-chain" className="border-t border-white/[0.07] px-7 py-24">
      <div className="mx-auto grid max-w-7xl gap-14 lg:grid-cols-[0.85fr_1.15fr]">
        <motion.div {...rise}>
          <span className="eyebrow eyebrow-ember">Supply chain</span>
          <h2 className="display mt-6 text-[clamp(34px,5vw,60px)]">
            The worm arrives
            <br />
            <span className="dim">in a lockfile.</span>
          </h2>
          <p className="mt-5 max-w-md text-muted">
            The 2025 <code className="text-white/70">chalk</code>/<code className="text-white/70">debug</code> hijack and the
            Shai-Hulud worm shipped as patch releases with a new install script. Forge reads the lockfile a pull request
            changes and asks OSV.dev about every package it adds or moves — before anyone runs{' '}
            <code className="text-white/70">npm install</code>.
          </p>
          <ul className="mt-8 space-y-3 text-sm">
            {[
              'npm, pnpm, Yarn, pip, Poetry, uv, Pipenv, Cargo',
              'Malicious releases, known CVEs, new install scripts, git and HTTP sources',
              'Only package names and versions leave your runner',
              'If OSV is unreachable, the report says “not checked” — never “clean”',
            ].map((t) => (
              <li key={t} className="flex gap-3">
                <span className="text-accentWarm" aria-hidden>→</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </motion.div>

        <motion.div {...rise} ref={ref}>
          <figure className="border border-white/[0.08] bg-[rgb(11_11_14)]" aria-label="A lockfile change checked against OSV.dev">
            <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-3 font-mono text-[12px]">
              <span className="text-white/70">package-lock.json</span>
              <span className="text-white/40">+3 packages</span>
            </div>
            <ul className="divide-y divide-white/[0.05] font-mono text-[12.5px]">
              {PACKAGES.map((p, i) => {
                const state = packageState(beat, i);
                const v = VERDICT[p.verdict];
                return (
                  <motion.li
                    key={p.name}
                    initial={false}
                    animate={{ opacity: state === 'hidden' ? 0.25 : 1 }}
                    className="flex items-center gap-3 px-5 py-2.5"
                  >
                    <span className="w-6 text-right text-white/25">{p.line}</span>
                    <span className="text-emerald-300/80">+</span>
                    <span className="text-white/85">
                      {p.name}@{p.version}
                    </span>
                    <span className="ml-auto flex items-center gap-2 text-[11.5px]">
                      {state === 'checking' && (
                        <>
                          <motion.span
                            className="h-3 w-3 rounded-full border border-white/30 border-t-accentWarm"
                            animate={{ rotate: 360 }}
                            transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
                            aria-hidden
                          />
                          <span className="text-white/50">asking OSV…</span>
                        </>
                      )}
                      {state === 'done' && (
                        <motion.span initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} className={`flex items-center gap-2 ${v.text}`}>
                          <span className={`h-2 w-2 ${v.dot}`} aria-hidden />
                          <span className="font-sans font-semibold">{v.word}</span>
                          <span className="text-white/55">{p.label}</span>
                        </motion.span>
                      )}
                    </span>
                  </motion.li>
                );
              })}
            </ul>

            <div className="min-h-[300px] space-y-3 border-t border-white/[0.08] p-5 text-sm">
              <AnimatePresence>
                {posted >= 1 && (
                  <motion.article key="mal" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="border border-rose-400/25 bg-rose-400/[0.04] p-4">
                    <div className="font-semibold">Malicious package: debug@4.4.2</div>
                    <div className="mt-0.5 text-xs text-muted">Critical · CWE-506 · line 7</div>
                    <p className="mt-2 text-muted">
                      Published to do harm, not a bug to patch later. If it was installed anywhere, rotate every credential that
                      machine could read.
                    </p>
                  </motion.article>
                )}
                {posted >= 2 && (
                  <motion.article key="vuln" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="border border-orange-400/25 bg-orange-400/[0.03] p-4">
                    <div className="font-semibold">Vulnerable dependency: lodash@4.17.15</div>
                    <div className="mt-0.5 text-xs text-muted">High · CWE-1395 · line 8 · 3 of 6 advisories shown</div>
                    <table className="mt-3 w-full text-left font-mono text-[11.5px]">
                      <thead className="text-white/40">
                        <tr>
                          {['Advisory', 'CVE', 'Severity', 'Fixed in'].map((h) => (
                            <th key={h} scope="col" className="pb-1.5 pr-3 font-normal">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {ADVISORIES.map(([id, cve, sev, fixed]) => (
                          <tr key={id} className="border-t border-white/[0.06]">
                            <td className="py-1 pr-3 text-[rgb(var(--syn-fn))]">{id}</td>
                            <td className="py-1 pr-3">{cve}</td>
                            <td className="py-1 pr-3">{sev}</td>
                            <td className="py-1">{fixed}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="mt-3">
                      <span className="font-semibold">Fix:</span>{' '}
                      <code className="bg-white/5 px-1.5 py-0.5 font-mono text-[12px]">npm install lodash@4.18.0</code>
                    </p>
                  </motion.article>
                )}
              </AnimatePresence>
            </div>
          </figure>
          <figcaption className="mt-4 text-xs text-muted">
            Real results from the dependency scanner against live OSV.dev data, replayed. Unchanged packages are never re-reported.
          </figcaption>
        </motion.div>
      </div>
    </section>
  );
}
