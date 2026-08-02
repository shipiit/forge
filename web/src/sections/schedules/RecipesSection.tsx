import { Zap } from 'lucide-react';
import { Code } from '../../components/Code';
import { Tabs } from '../../components/Tabs';
import { Section } from '../../components/GuideBits';

const RECIPES = [
  {
    id: 'digest',
    label: 'Nightly digest',
    hint: 'Every weekday morning, a summary of what merged while you were asleep.',
    yaml: `routines:
  - name: nightly-digest
    skill: commit-summary
    prompt: |
      Summarize every pull request merged in the last 24 hours.
      Group by area. Call out anything that changes behaviour
      for a consumer of this code.
    schedule: "0 9 * * 1-5"   # 09:00, weekdays
    manual: true`,
  },
  {
    id: 'docs',
    label: 'Docs drift',
    hint: 'Weekly sweep for documentation that no longer matches the code. Opens a PR with the corrections.',
    yaml: `routines:
  - name: docs-drift
    skill: document
    prompt: |
      Find documentation that no longer matches the code and
      correct it. Verify each statement against the source
      before changing it — do not guess.
    schedule: "0 3 * * 1"     # 03:00 Mondays
    write: true               # may edit files → opens a PR
    tools: [read_file, search, glob, write_file, edit_file]`,
  },
  {
    id: 'security',
    label: 'Weekly security sweep',
    hint: 'A standing audit of the whole repository, independent of any PR.',
    yaml: `routines:
  - name: weekly-audit
    skill: security-audit
    prompt: |
      Audit the repository. Report only findings where you can
      name the source, the sink, and the path between them.
    schedule: "0 6 * * 1"     # 06:00 Mondays
    manual: true`,
  },
  {
    id: 'backlog',
    label: 'Backlog triage',
    hint: 'Diagnose newly opened issues on a schedule instead of one at a time.',
    yaml: `routines:
  - name: triage-backlog
    skill: triage
    prompt: |
      For each issue opened since the last run, identify the
      root cause and the files that would need to change.
    schedule: "0 8 * * *"
    events: [issues.opened]   # and immediately on each new issue`,
  },
];

export function RecipesSection() {
  return (
    <Section
      id="recipes"
      Icon={Zap}
      eyebrow="Recipes"
      title="Four routines worth having"
      lead="Each one is complete — copy it into .github/agent.yml, point a cron at it, and it runs."
    >
      <Tabs
        ariaLabel="Routine recipes"
        tabs={RECIPES.map((r) => ({
          id: r.id,
          label: r.label,
          hint: r.hint,
          content: <Code label=".github/agent.yml" lang="yaml" code={r.yaml} />,
        }))}
      />
    </Section>
  );
}
