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
                  ['Who may comment a command', 'Only collaborators with write access. Anyone else is ignored before any model call.'],
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
            id: 'depth',
            label: 'Depth & verification',
            hint: 'Every finding is re-checked against the code before it is posted, unless you choose light.',
            content: (
              <>
                <Cards
                  items={[
                    { t: 'light', d: 'One reviewer, posted as found. The cheapest review; for docs and routine changes.' },
                    { t: 'standard — default', d: 'One reviewer, then a verifier that re-opens every candidate at its line and drops what the code does not bear out.' },
                    { t: 'deep', d: 'Three reviewers in parallel — correctness, security, failure handling — then the verifier. Roughly three to four times standard.' },
                  ]}
                />
                <div className="mt-4">
                  <Code
                    label=".github/agent.yml"
                    lang="yaml"
                    code={`review_depth: standard        # light | standard | deep
spend_cap_per_run_usd: 2      # shared by every reviewer and the verifier`}
                  />
                </div>
                <p className="mt-3 text-sm text-muted">
                  The review summary says how many candidates were kept and dropped, or warns when verification did not
                  complete — an unverified review never passes for a verified one.
                </p>
              </>
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
