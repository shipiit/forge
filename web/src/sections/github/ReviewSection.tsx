import { Search } from 'lucide-react';
import { Code } from '../../components/Code';
import { Tabs } from '../../components/Tabs';
import { Section, Triggers, Cards } from '../../components/GuideBits';

export function ReviewSection() {
  return (
    <Section
      id="review"
      Icon={Search}
      eyebrow="Pull requests"
      title="Review only what changed"
      lead="Every review is scoped to the current pull request. Forge reads the surrounding code freely to judge whether an issue is real, but a finding about a file your PR never touched is discarded before it is ever posted."
    >
      <Tabs
        ariaLabel="Review configuration"
        tabs={[
          {
            id: 'triggers',
            label: 'Triggers',
            hint: 'Commands work regardless of the repository’s configured cadence.',
            content: (
              <Triggers
                rows={[
                  ['pull_request opened / synchronize', 'Automatic review, per your review_behavior setting.'],
                  ['/review', 'One review now, without subscribing to future pushes.'],
                  ['/review always', 'Reviews now and on every later push — stored as a PR label.'],
                  ['review_requested', 'Reviews when Forge is added as a reviewer — drafts included.'],
                ]}
              />
            ),
          },
          {
            id: 'config',
            label: 'Configure',
            hint: 'Per-repository settings live in .github/agent.yml.',
            content: (
              <Code
                label=".github/agent.yml"
                lang="yaml"
                code={`auto_review: always
review_behavior: every_push   # opened | every_push | manual
max_nits: 5                   # cap minor comments; -1 disables
trigger_phrase: "@our-bot"

filters:                      # only review what matters
  - { field: base_branch, operator: equals, value: main }
  - { field: is_draft,    operator: equals, value: false }
  - { field: labels, operator: is_not_one_of, value: [skip-review] }`}
              />
            ),
          },
          {
            id: 'severity',
            label: 'Severity',
            hint: 'Only Important findings can request changes.',
            content: (
              <Cards
                items={[
                  { t: '🔴 Important', d: 'A bug that should be fixed before merging. Only these request changes.' },
                  { t: '🟡 Nit', d: 'Minor and worth fixing, never blocking. Capped so a review stays actionable.' },
                  { t: '🟣 Pre-existing', d: 'A bug the PR did not introduce. Reported for awareness — never blocks the author.' },
                ]}
              />
            ),
          },
          {
            id: 'gate',
            label: 'Gate your CI',
            hint: 'The check run always completes as neutral, so it can never block a merge. Read its footer if you want your own gate.',
            content: (
              <Code
                label="bash"
                lang="bash"
                code={`gh api repos/$OWNER/$REPO/check-runs/$ID \\
  --jq '.output.text | split("forge-severity: ")[1] | split(" -->")[0] | fromjson'

# → {"blocking":2,"nit":1,"pre_existing":0}
# Fail your job when .blocking > 0 — on your terms, not ours.`}
              />
            ),
          },
        ]}
      />
    </Section>
  );
}
