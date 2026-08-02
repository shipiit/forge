import { MessageSquare } from 'lucide-react';
import { Section, Triggers, CommentPreview } from '../../components/GuideBits';

export function MentionsSection() {
  return (
    <Section
      id="mentions"
      Icon={MessageSquare}
      eyebrow="Conversation"
      title="Ask it anything, anywhere"
      lead="Mention Forge in any issue, pull request, or inline review thread. On an issue it explains and diagnoses; on a pull request it can push a follow-up commit to that branch."
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
        <div>
          <Triggers
            rows={[
              ['@shipit-forge why does this fail?', 'Reads the code and answers, grounded in the actual repository.'],
              ['@shipit-forge fix this', 'On a PR: applies the change, runs tests, pushes to the PR branch.'],
              ['/code-review · /triage · /document', 'Runs a named skill instead of a free-form answer.'],
              ['/run <routine>', 'Starts a saved routine on demand.'],
            ]}
          />
          <p className="mt-6 text-sm leading-relaxed text-muted">
            The handle is per-repository — set{' '}
            <code className="text-[rgb(var(--syn-keyword))]">trigger_phrase: "@our-bot"</code> in{' '}
            <code className="text-white/80">.github/agent.yml</code> to use your own bot name.
          </p>
        </div>
        <CommentPreview verdict="follow-up commit" tone="good">
          <p className="text-muted">
            <span className="text-text">@you</span> — @shipit-forge fix the SSRF finding
          </p>
          <div className="row-line pt-3 font-semibold">
            🔧 Pushed a follow-up commit to <code className="text-[rgb(var(--syn-fn))]">feat/proxy</code>
          </div>
          <p className="text-muted">
            Added an allowlist validator, wired it into the proxy handler, and added a test that asserts internal
            addresses are rejected. Suite is green.
          </p>
        </CommentPreview>
      </div>
    </Section>
  );
}
