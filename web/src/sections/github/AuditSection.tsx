import { ScanSearch } from 'lucide-react';
import { Section, Triggers, CommentPreview } from '../../components/GuideBits';

export function AuditSection() {
  return (
    <Section
      id="audit"
      Icon={ScanSearch}
      eyebrow="Whole repository"
      title="Audit the entire codebase"
      lead="Not a diff review. Forge maps your entry points — HTTP routes, CLI, webhooks, queue consumers — follows untrusted input to dangerous sinks, and posts one grouped report sorted by severity."
    >
      <Triggers rows={[['/audit', 'Full-repository security audit, posted as a single grouped comment.']]} />
      <div className="mt-6 max-w-2xl">
        <CommentPreview verdict="8 findings" tone="danger">
          <div className="font-semibold">🛡️ Security audit</div>
          <p className="text-muted">
            Found <span className="text-text">8</span> issues. 🔴 Critical: 1 · 🟠 High: 2 · 🟡 Medium: 5
          </p>
          <p className="text-muted">
            Includes live Dependabot alerts — CVE-2021-23337 in lodash, fixed in 4.17.21.
          </p>
        </CommentPreview>
      </div>
    </Section>
  );
}
