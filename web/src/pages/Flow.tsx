import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { Header, Footer } from '../components/Layout';
import { ScrollProgress } from '../components/ScrollProgress';
import { StepPlayer, type Step } from '../components/StepPlayer';

type Flow = { eyebrow: string; title: [string, string]; intro: string; steps: Step[]; next: { label: string; to: string } };

const FLOWS: Record<string, Flow> = {
  fix: {
    eyebrow: 'For maintainers',
    title: ['The fix flow', '— issue to PR.'],
    intro: 'Label an issue agent-fix or comment /fix. Forge investigates, edits, writes tests, verifies, and opens a pull request that closes the issue. You review and merge.',
    steps: [
      { label: 'Triggered', detail: 'A labeled issue or a /fix comment wakes Forge.', lines: ['event: issues.labeled (agent-fix)', 'issue #128 · "search scans node_modules"', 'acquiring run lock · forge/issue-128'] },
      { label: 'Analyze', detail: 'Clones the repo into a sandbox and finds the root cause.', lines: ['git clone --depth 50 …', 'read src/agent/tools/search.ts', 'root cause: rg/grep run over "." with no excludes'] },
      { label: 'Fix + write tests', detail: 'Edits the code, adds a regression test, installs deps, runs the suite.', lines: ['edit_file search.ts (+ --glob !node_modules)', 'npm ci', 'npm test … 116 passing ✓'] },
      { label: 'Self-review', detail: 'A security + code review of its own diff before the PR.', lines: ['🛡️ security lens … no issues', '🔧 code lens … no issues'] },
      { label: 'Open the PR', detail: 'A clean PR (or a draft if tests fail) that closes the issue.', lines: ['git push origin forge/issue-128', '🚀 opened PR #129 — Closes #128', '💬 commented summary on the issue'] },
    ],
    next: { label: 'See the review flow', to: '/flow/review' },
  },
  review: {
    eyebrow: 'For security',
    title: ['The review flow', '— every PR, scanned.'],
    intro: 'Every PR is reviewed automatically (or on /review and /security). Forge analyzes the diff with a security + code lens, ingests live Dependabot CVEs, and posts inline comments with suggested fixes. It never auto-approves.',
    steps: [
      { label: 'Triggered', detail: 'A new PR, a new commit, /review, or @mention.', lines: ['event: pull_request.opened (#42)', 'fetching diff + cloning head ref'] },
      { label: 'Security lens', detail: 'CWE/OWASP coverage across the diff with repo context.', lines: ['scan: SSRF, injection, authz, secrets, deser…', '🔴 CWE-918 SSRF · fetcher.js:8'] },
      { label: 'Live CVEs', detail: 'Merges GitHub Dependabot alerts so findings are current.', lines: ['GET /repos/…/dependabot/alerts', '🟠 CVE-2021-23337 · lodash < 4.17.21'] },
      { label: 'Post review', detail: 'Inline comments + suggested fixes, clamped to diff lines.', lines: ['POST /pulls/42/reviews', 'event: REQUEST_CHANGES · 2 findings', '```suggestion request(validateUrl(target))```'] },
    ],
    next: { label: 'See the audit flow', to: '/flow/audit' },
  },
  audit: {
    eyebrow: 'Whole repository',
    title: ['The audit flow', '— scan everything.'],
    intro: 'Comment /audit anywhere and Forge scans the entire repository (not just a diff) for vulnerabilities, merges live Dependabot data, and posts one grouped, severity-sorted report.',
    steps: [
      { label: 'Triggered', detail: 'A /audit comment on any issue or PR.', lines: ['comment: /audit', '🛡️ ShipIT Forge is auditing this repository…'] },
      { label: 'Map + trace', detail: 'Maps entry points and follows untrusted input to sinks.', lines: ['map routes · CLI · webhooks', 'trace req.url → execSync sink'] },
      { label: 'Dependencies', detail: 'Cross-checks manifests and lockfiles against advisories.', lines: ['read package-lock.json', '🟠 1 high · 🔵 2 low (Dependabot)'] },
      { label: 'Report', detail: 'One grouped report, sorted by severity, with suggestions.', lines: ['🔴 0 critical · 🟠 1 high · 🔵 2 low', 'updated comment with full report'] },
    ],
    next: { label: 'See the CI auto-fix flow', to: '/flow/ci' },
  },
  ci: {
    eyebrow: 'Self-healing',
    title: ['The CI auto-fix flow', '— red to green.'],
    intro: "When a Forge-authored PR's checks fail, it reads the failing logs, fixes the code, re-runs the suite, and pushes a commit — bounded to 2 attempts so it never loops or burns tokens.",
    steps: [
      { label: 'Triggered', detail: 'check_suite / workflow_run completes as failure on a forge/* branch.', lines: ['event: check_suite.completed (failure)', 'branch: forge/issue-128 · attempt 1/2'] },
      { label: 'Read failures', detail: 'Pulls the failing check names, summaries, and annotations.', lines: ['GET /commits/{sha}/check-runs', '✗ CI / test · tsc error in search.ts'] },
      { label: 'Fix + verify', detail: 'Edits the code and re-runs the suite to confirm green.', lines: ['edit_file search.ts', 'npm test … ✓ pass'] },
      { label: 'Push', detail: 'Pushes a ci-fix commit; comments the result. Stops at 2 tries.', lines: ['git push origin forge/issue-128', '🔁 pushed ci-fix (1/2) · green'] },
    ],
    next: { label: 'See the fix flow', to: '/flow/fix' },
  },
};

const rise = { initial: { opacity: 0, y: 24 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const } };

export function Flow() {
  const { slug = 'fix' } = useParams();
  const flow = FLOWS[slug] ?? FLOWS.fix;
  return (
    <>
      <ScrollProgress />
      <Header />
      <section className="mx-auto max-w-7xl px-7 py-20">
        <motion.div {...rise}>
          <span className="eyebrow">{flow.eyebrow}</span>
          <h1 className="display mt-6 text-[clamp(40px,6vw,72px)]">{flow.title[0]}<br /><span className="dim">{flow.title[1]}</span></h1>
          <p className="mt-6 max-w-2xl text-muted">{flow.intro}</p>
        </motion.div>
        <motion.div {...rise} transition={{ ...rise.transition, delay: 0.1 }} className="mt-14">
          <StepPlayer steps={flow.steps} />
        </motion.div>
        <div className="mt-10 flex flex-wrap items-center gap-6">
          <Link to="/docs" className="btn btn-white !rounded-none !uppercase !tracking-[0.14em]">Read the docs <ArrowRight size={15} /></Link>
          <Link to={flow.next.to} className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted hover:text-text">
            {flow.next.label} <ArrowRight size={14} />
          </Link>
        </div>
      </section>
      <Footer />
    </>
  );
}
