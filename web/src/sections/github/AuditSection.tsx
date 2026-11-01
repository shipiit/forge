import { ScanSearch } from 'lucide-react';
import { Code } from '../../components/Code';
import { Section, Triggers, CommentPreview } from '../../components/GuideBits';

const SPECIALISTS: Array<[string, string]> = [
  ['Authentication & sessions', 'Every way a principal logs in: tokens, OTP, API keys, webhooks, reset, OAuth state.'],
  ['Authorization & IDOR', 'Every route and the permission it really enforces; ids from the request not scoped to the caller; mass assignment.'],
  ['Injection, SSRF, files & crypto', 'Request data to SQL, shell, templates, fetch, file paths; weak tokens and hashing.'],
  ['Configuration & CI/CD', 'Settings per environment, containers, workflow pins and permissions, lockfiles, tracked secrets.'],
  ['Business logic & money', 'Each flow as a state machine: who may move it, races, client-side prices, approvals.'],
  ['Personal data & logging', 'A PII inventory: what is plaintext, what reaches logs, exports and prompts.'],
  ['Frontend & client', 'Token storage, XSS sinks, route guards versus the API. Only when the repo has a frontend.'],
  ['LLM & agent surface', 'Every tool a model can call and what untrusted text can steer it. Only with a model SDK.'],
];

const SCANNERS: Array<[string, string]> = [
  ['semgrep', 'OWASP Top 10, secrets and default rules'],
  ['gitleaks', 'committed credentials'],
  ['trivy', 'misconfigurations and secrets'],
  ['osv-scanner', 'advisories for every ecosystem (Go, Maven, Ruby…)'],
  ['bandit', 'Python security'],
  ['checkov', 'Dockerfile, workflows, Terraform, Kubernetes, Helm'],
];

export function AuditSection() {
  return (
    <Section
      id="audit"
      Icon={ScanSearch}
      eyebrow="Whole repository"
      title="Audit the entire codebase — with a team"
      lead="A pull-request review reads one change. /audit reads everything: six bundled scanners first, then up to eight specialist agents in parallel, each asking one attacker's question of the whole codebase, then a verifier that re-checks every finding. The report says what was tested as well as what was found."
    >
      <Triggers rows={[['/audit', 'Full-repository audit, posted as one grouped comment with a coverage map.']]} />

      <h3 className="mt-10 text-lg font-semibold">The specialists</h3>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
        Adapted from the <code className="text-white/75">shipiit/pentest-skills</code> deep audit for a static run: no
        live target, no logins, read-only tools. Specialists with nothing to look at are skipped, so a backend with no
        frontend never pays for a frontend review. The run&rsquo;s spend cap covers all of them together.
      </p>
      <div className="mt-5 grid gap-px overflow-hidden border border-white/[0.08] bg-white/[0.06] sm:grid-cols-2">
        {SPECIALISTS.map(([t, d]) => (
          <div key={t} className="bg-[rgb(11_11_14)] p-5">
            <div className="text-[14px] font-semibold">{t}</div>
            <p className="mt-1 text-sm leading-relaxed text-muted">{d}</p>
          </div>
        ))}
      </div>

      <h3 className="mt-10 text-lg font-semibold">The scanners</h3>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
        Bundled in the Action image, pinned and checksum-verified; on a self-hosted server Forge runs whichever are
        installed and says which were missing. They run with no GitHub token and no model key in their environment.
        Their findings merge with Forge&rsquo;s own, so one secret reported by three tools is one comment. Pull-request
        reviews do not run them.
      </p>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {SCANNERS.map(([t, d]) => (
          <li key={t} className="border border-white/[0.08] px-4 py-3 text-sm">
            <code className="font-semibold text-[rgb(var(--syn-keyword))]">{t}</code>
            <span className="text-muted"> — {d}</span>
          </li>
        ))}
      </ul>

      <h3 className="mt-10 text-lg font-semibold">Bring your own slices</h3>
      <p className="mb-4 mt-2 max-w-3xl text-sm leading-relaxed text-muted">
        Point <code className="text-white/75">audit_skills</code> at a repository that holds{' '}
        <code className="text-white/75">deep-security-audit/references/slices.md</code> (the pentest-skills layout) or{' '}
        <code className="text-white/75">audit/slices.md</code> — one <code className="text-white/75">## N. Title</code>{' '}
        section per specialist. It must be pinned to a full commit SHA: these prompts steer an agent that reads your
        whole codebase, and a branch name would let whoever pushes there decide what every audit looks for. If the
        repository cannot be read, the built-in slices run instead.
      </p>
      <Code
        label=".github/agent.yml"
        lang="yaml"
        code={`audit_skills: shipiit/pentest-skills@<full 40-character commit SHA>
external_scanners: true   # default; false skips the six scanners
spend_cap_per_run_usd: 5  # shared by every specialist and the verifier`}
      />

      <div className="mt-8 max-w-2xl">
        <CommentPreview verdict="8 findings" tone="danger">
          <div className="font-semibold">🛡️ Security audit</div>
          <p className="text-muted">
            Found <span className="text-text">8</span> issues. 🔴 Critical: 1 · 🟠 High: 2 · 🟡 Medium: 5
          </p>
          <p className="text-muted">
            <span className="text-text">Coverage map</span> — 3 fail · 2 warning · 9 pass · 3 not tested
          </p>
          <p className="text-muted">
            <span className="text-text">Scanners</span> — 6 of 6 ran · 🔎 every finding re-checked; 4 dropped
          </p>
        </CommentPreview>
      </div>
    </Section>
  );
}
