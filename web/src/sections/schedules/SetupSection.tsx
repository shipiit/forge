import { Wrench } from 'lucide-react';
import { Code } from '../../components/Code';
import { Tabs } from '../../components/Tabs';
import { Section, CommentPreview } from '../../components/GuideBits';

const FIELDS: [string, string][] = [
  ['name', 'Required. Lowercase, used by /run.'],
  ['skill', 'Which prompt pack to run. Built-in or committed.'],
  ['prompt', 'Extra instructions for this routine.'],
  ['schedule', 'Cron expression. Fired by your workflow.'],
  ['manual', 'Allow /run. Defaults to true.'],
  ['events', 'Repository events that start it.'],
  ['filters', 'Conditions the event must satisfy.'],
  ['tools', 'Tool allowlist — fewer tools, fewer tokens.'],
  ['write', 'Allow file edits. Defaults to false.'],
];

function FieldTable() {
  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.08]">
      {FIELDS.map(([k, d], i) => (
        <div
          key={k}
          className={`grid grid-cols-1 gap-1 px-5 py-3 sm:grid-cols-[130px_1fr] ${i ? 'border-t border-white/[0.08]' : ''}`}
        >
          <code className="text-[13px] text-[rgb(var(--syn-keyword))]">{k}</code>
          <span className="text-sm text-muted">{d}</span>
        </div>
      ))}
    </div>
  );
}

export function SetupSection() {
  return (
    <Section
      id="setup"
      Icon={Wrench}
      eyebrow="Setup"
      title="Three steps to a running routine"
      lead="Define it in your repository, point a workflow schedule at it, and it runs. Everything is version-controlled and reviewed like any other change."
    >
      <Tabs
        ariaLabel="Routine setup"
        tabs={[
          {
            id: 'define',
            label: '1 · Define it',
            hint: 'Routines live in .github/agent.yml, so a change to one goes through review like code.',
            content: (
              <div className="grid gap-6 lg:grid-cols-2">
                <Code
                  label=".github/agent.yml"
                  lang="yaml"
                  code={`routines:
  - name: nightly-digest
    description: What merged yesterday
    skill: commit-summary          # a built-in or your own
    prompt: |
      Summarize every PR merged in the last 24 hours.
      Group by area; call out behaviour changes.
    schedule: "0 9 * * *"          # 09:00 daily
    manual: true                   # /run nightly-digest
    events: [pull_request.closed]  # and on each merge
    tools: [read_file, search, glob]
    filters:
      - { field: base_branch, operator: equals, value: main }`}
                />
                <FieldTable />
              </div>
            ),
          },
          {
            id: 'workflow',
            label: '2 · Add the schedule',
            hint: 'One workflow can drive every scheduled routine. workflow_dispatch adds a "Run workflow" button for firing it by hand.',
            content: (
              <Code
                label=".github/workflows/forge-routines.yml"
                lang="yaml"
                code={`name: Forge routines

on:
  schedule:
    - cron: '0 9 * * *'       # nightly digest
    - cron: '0 3 * * 1'       # Monday docs sweep
  workflow_dispatch:           # manual "Run workflow" button

permissions:
  contents: write
  pull-requests: write
  issues: write

jobs:
  routines:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: shipiit/forge@v2
        with:
          skill: commit-summary
          allowed-tools: read_file search glob   # fewer tokens
          max-turns: "10"
          anthropic-api-key: \${{ secrets.ANTHROPIC_API_KEY }}`}
              />
            ),
          },
          {
            id: 'run',
            label: '3 · Run it',
            hint: 'The same routine, started three different ways.',
            content: (
              <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
                <div>
                  <Code
                    label="from a GitHub comment"
                    lang="bash"
                    code={`/run nightly-digest

# with an extra instruction just for this run:
/run docs-drift only the API reference`}
                  />
                  <Code
                    label="from your machine"
                    lang="bash"
                    code={`forge skills                    # see what is available
forge run --repo . --skill commit-summary --task "summarize this week"
forge run --repo . --skill document --write`}
                  />
                </div>
                <CommentPreview verdict="routine complete" tone="good">
                  <div className="font-semibold">
                    🤖 routine <code className="text-[rgb(var(--syn-fn))]">nightly-digest</code>
                  </div>
                  <p className="text-muted">
                    <span className="text-text">7 pull requests merged.</span>
                  </p>
                  <p className="text-muted">
                    <span className="text-text">API</span> — response caching (#128), tenant scoping on the pricing
                    query (#131).
                    <br />
                    <span className="text-text">Docs</span> — provider setup rewritten (#129).
                  </p>
                  <p className="text-muted">⚠️ #131 changes a default: queries are now tenant-scoped by default.</p>
                  <div className="text-[11px] text-muted">🧮 41,200 in + 980 out · 33,000 cached (saved ~$0.09)</div>
                </CommentPreview>
              </div>
            ),
          },
        ]}
      />
    </Section>
  );
}
