import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowUpRight, GitPullRequest, ShieldAlert, RefreshCw, Search, MessageSquare } from 'lucide-react';
import { Header, Footer } from '../components/Layout';
import { ScrollProgress } from '../components/ScrollProgress';

const ext = { target: '_blank', rel: 'noopener noreferrer' } as const;
const rise = { initial: { opacity: 0, y: 22 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: '-60px' }, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const } };

type Ex = { I: typeof GitPullRequest; tag: string; verdict: string; title: string; body: string; diff?: [string, string]; href: string; cta: string };

const EXAMPLES: Ex[] = [
  {
    I: ShieldAlert, tag: 'Security review', verdict: 'requested changes',
    title: 'Caught SSRF + command injection in a PR',
    body: 'On a PR adding a URL proxy, Forge auto-reviewed the diff and flagged two Critical issues (CWE-918 SSRF, CWE-78 command injection) with inline comments and suggested fixes.',
    diff: ['- request(target, (r) => r.pipe(res))', '+ request(validateUrl(target), (r) => r.pipe(res))'],
    href: 'https://github.com/shipiit/forge-demo/pull/3', cta: 'View the review on GitHub',
  },
  {
    I: Search, tag: 'Issue → fix → PR', verdict: 'merged',
    title: 'Fixed: search tool scanned node_modules',
    body: 'From a plain issue, Forge found the root cause in search.ts, added the exclude globs for both ripgrep and grep, ran the tests, and opened a PR that was merged.',
    diff: ["- ['rg', [..., pattern, '.']]", "+ ['rg', ['--glob','!node_modules', ..., pattern, '.']]"],
    href: 'https://github.com/shipiit/forge/pull/3', cta: 'View the fix PR',
  },
  {
    I: ShieldAlert, tag: 'Analysis', verdict: 'commented',
    title: 'Traced a transitive CVE in dependencies',
    body: 'On an OpenTelemetry baggage issue, Forge traced the vulnerable @opentelemetry/core through Probot in package-lock.json, cited CVE-2024-38691, and proposed an npm override.',
    href: 'https://github.com/shipiit/forge/issues/4', cta: 'Read the analysis',
  },
  {
    I: GitPullRequest, tag: 'Self-improvement', verdict: 'open',
    title: 'Reviewed its own pull request',
    body: 'Forge reviewed a PR that added a credentials temp-file write and flagged a real CWE-377 (insecure temp file / TOCTOU) on its own code — which was then fixed.',
    href: 'https://github.com/shipiit/forge/pulls?q=is%3Apr', cta: 'Browse the PRs',
  },
  {
    I: RefreshCw, tag: 'CI auto-fix', verdict: 'green',
    title: 'Pushed a fix when CI went red',
    body: 'When a Forge PR’s checks failed, it read the failing logs, corrected the code, re-ran the suite, and pushed a ci-fix commit — bounded to two attempts.',
    href: 'https://github.com/shipiit/forge/actions', cta: 'See the CI runs',
  },
  {
    I: MessageSquare, tag: '@mention', verdict: 'follow-up commit',
    title: 'Fixed a finding from a comment',
    body: 'Comment “@shipit-forge fix the security finding” on a PR and it clones the branch, applies the fix, runs tests, and pushes a follow-up commit to the same PR.',
    href: 'https://github.com/shipiit/forge', cta: 'Open the repo',
  },
];

export function Examples() {
  return (
    <>
      <ScrollProgress />
      <Header />
      <section className="mx-auto max-w-7xl px-7 py-20">
        <motion.div {...rise}>
          <span className="eyebrow">Live examples</span>
          <h1 className="display mt-6 text-[clamp(40px,6vw,72px)]">Real work,<br /><span className="dim">on real repositories.</span></h1>
          <p className="mt-6 max-w-2xl text-muted">Every card links to the actual issue, PR, or review on GitHub — produced end-to-end by ShipIT Forge. Click through and verify.</p>
        </motion.div>

        <div className="mt-14 grid gap-6 md:grid-cols-2">
          {EXAMPLES.map((e, i) => (
            <motion.a key={e.title} href={e.href} {...ext} {...rise} transition={{ ...rise.transition, delay: (i % 2) * 0.08 }}
              className="group panel block p-6 transition hover:border-white/20">
              <div className="flex items-center gap-2 text-sm">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/5"><e.I size={15} /></span>
                <span className="text-xs uppercase tracking-[0.16em] text-muted">{e.tag}</span>
                <span className="ml-auto rounded-full border border-white/15 px-2 py-0.5 text-[11px] text-muted">{e.verdict}</span>
              </div>
              <h3 className="mt-4 text-xl font-semibold">{e.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{e.body}</p>
              {e.diff && (
                <div className="mt-4 overflow-hidden rounded-lg border border-white/10 font-mono text-[12px]">
                  <div className="bg-rose-400/10 px-3 py-1.5 text-rose-200">{e.diff[0]}</div>
                  <div className="bg-emerald-400/10 px-3 py-1.5 text-emerald-200">{e.diff[1]}</div>
                </div>
              )}
              <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-white/90 group-hover:text-white">
                {e.cta} <ArrowUpRight size={15} className="transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </span>
            </motion.a>
          ))}
        </div>

        <div className="mt-12 flex flex-wrap gap-4">
          <Link to="/flow/fix" className="btn btn-line !rounded-none !uppercase !tracking-[0.14em]">Watch the fix flow</Link>
          <Link to="/docs" className="btn btn-white !rounded-none !uppercase !tracking-[0.14em]">Read the docs</Link>
        </div>
      </section>
      <Footer />
    </>
  );
}
