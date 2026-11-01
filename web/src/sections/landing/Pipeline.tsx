import { motion } from 'framer-motion';
import { Steps } from './Steps';
import { rise } from './motion';

export function Pipeline() {
  return (
    <section id="how" className="border-t border-white/[0.07] px-7 py-24">
      <div className="mx-auto max-w-7xl">
        <motion.div {...rise}>
          <span className="eyebrow eyebrow-ember">The pipeline</span>
          <h2 className="display mt-6 text-[clamp(34px,5vw,60px)]">From first issue<br /><span className="dim">to merged PR.</span></h2>
          <p className="mt-5 max-w-lg text-muted">One connected loop. Forge investigates, fixes, verifies, and reviews — you stay in control of every merge.</p>
        </motion.div>
        <motion.div {...rise} className="mt-14 grid gap-px overflow-hidden border border-white/[0.08] bg-white/[0.06] md:grid-cols-2">
          <div className="bg-[rgb(11_11_14)] p-8">
            <h3 className="text-xl font-semibold">For maintainers</h3>
            <p className="mt-2 text-sm text-muted">Label an issue or comment <code className="text-white/70">/fix</code> — Forge opens a verified PR. You review and merge.</p>
            <Steps items={[['01', 'Analyze the issue', 'A detailed root-cause comment with the proposed fix and affected files.'], ['02', 'Fix + write tests', 'Edits the code, adds tests, installs deps, and runs the suite.'], ['03', 'Open the PR', 'A draft if tests fail; otherwise a clean PR that closes the issue.']]} link="See the fix flow" to="/flow/fix" />
          </div>
          <div className="bg-[rgb(11_11_14)] p-8">
            <h3 className="text-xl font-semibold">For security</h3>
            <p className="mt-2 text-sm text-muted">Every PR is reviewed automatically; <code className="text-white/70">/audit</code> scans the whole repo.</p>
            <Steps items={[['01', 'Scan the diff', 'CWE/OWASP coverage — SSRF, injection, authz, secrets, deserialization.'], ['02', 'Check every new package', 'Lockfile changes against OSV.dev: known CVEs, malicious releases, new install scripts.'], ['03', 'Verify, then comment', 'A second agent confirms each finding in the code; what survives gets severity and a fix. Never auto-approves.']]} link="See the review flow" to="/flow/review" />
          </div>
        </motion.div>
      </div>
    </section>
  );
}
