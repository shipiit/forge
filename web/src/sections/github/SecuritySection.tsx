import { ShieldAlert } from 'lucide-react';
import { Code } from '../../components/Code';
import { Section, Triggers, CommentPreview, DiffPair } from '../../components/GuideBits';

export function SecuritySection() {
  return (
    <Section
      id="security"
      Icon={ShieldAlert}
      eyebrow="Security"
      title="A security lens on every diff"
      lead="Alongside the quality review, Forge hunts for exploitable vulnerabilities: injection, SSRF, broken authorization, hardcoded secrets, unsafe deserialization, path traversal, weak crypto. Each finding carries a CWE, a severity, and a suggested fix."
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
        <div>
          <Triggers
            rows={[
              ['/security', 'Security-only review of the current PR.'],
              ['automatic', 'Runs as part of every standard review.'],
              ['Dependabot + SARIF', 'Live CVEs and CodeQL/Semgrep output merged into the same report.'],
            ]}
          />
          <p className="mt-6 text-sm leading-relaxed text-muted">
            A second, deterministic layer runs on <span className="text-text">every edit the agent makes</span> — a
            pattern scan with no model call and no token cost. Add your own rules:
          </p>
          <Code
            label=".forge/security-patterns.json"
            lang="json"
            code={`{
  "patterns": [
    {
      "rule_name": "tenant_unfiltered_query",
      "regex": "\\\\.objects\\\\.all\\\\(\\\\)",
      "paths": ["**/src/tenants/**"],
      "reminder": "Multi-tenant code must filter by org_id."
    }
  ]
}`}
          />
        </div>
        <CommentPreview verdict="requested changes" tone="danger">
          <div className="flex items-center gap-2 rounded-lg border border-rose-400/20 bg-rose-400/5 px-3 py-2">
            <ShieldAlert size={15} className="text-rose-300" />
            <span>
              🔴 Critical · CWE-918 SSRF · <code className="text-white/70">fetcher.js:8</code>
            </span>
          </div>
          <DiffPair
            before="request(target, (r) => r.pipe(res))"
            after="request(validateUrl(target), (r) => r.pipe(res))"
          />
          <p className="text-muted">
            The URL was fully attacker-controlled — an internal metadata endpoint is reachable. Suggested an
            allowlist validator plus a regression test.
          </p>
        </CommentPreview>
      </div>
    </Section>
  );
}
