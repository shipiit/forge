import { Wrench } from 'lucide-react';
import { Section, Triggers, Walkthrough, CommentPreview, DiffPair } from '../../components/GuideBits';

export function FixSection() {
  return (
    <Section
      id="fix"
      Icon={Wrench}
      eyebrow="Issues"
      title="Turn an issue into a merged PR"
      lead="Forge investigates the repository, finds the root cause, edits the code, adds a regression test, runs your suite, and opens a pull request that closes the issue. It never pushes to your default branch."
    >
      <Triggers
        rows={[
          ['label: agent-fix', 'Posts a root-cause analysis comment — no code change yet.'],
          ['/fix', 'Implements the fix, adds tests, runs them, opens a PR.'],
          ['@shipit-forge fix this', 'Same as /fix, from natural language in a comment.'],
        ]}
      />
      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_400px]">
        <Walkthrough
          steps={[
            ['Investigate', 'Reads the issue, its comments, and any screenshots, then searches the codebase to confirm the cause before changing anything.'],
            ['Edit and test', 'Makes the smallest change that fixes the cause, then adds a test that fails without it.'],
            ['Verify independently', 'Forge re-runs your suite itself and reports the real exit code — it does not take the model’s word for it.'],
            ['Self-review, then open the PR', 'A second read-only pass critiques the diff. A high-severity finding or a failing test opens the PR as a draft.'],
          ]}
        />
        <CommentPreview verdict="fix ready" tone="good">
          <div className="font-semibold">🔧 Fix ready in #128</div>
          <p className="text-muted">
            <span className="text-text">Root cause:</span>{' '}
            <code className="text-[rgb(var(--syn-fn))]">add()</code> subtracted instead of adding.
          </p>
          <DiffPair before="return a - b;" after="return a + b;" />
          <p className="text-muted">✅ Project tests pass after the change. Added a regression test.</p>
          <div className="text-[11px] text-muted">🧮 12,480 in + 1,902 out · 9,600 cached (saved ~$0.03)</div>
        </CommentPreview>
      </div>
    </Section>
  );
}
