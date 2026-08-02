import { CalendarClock } from 'lucide-react';
import { Code } from '../../components/Code';
import { Section, Triggers } from '../../components/GuideBits';

export function RoutinesSection() {
  return (
    <Section
      id="routines"
      Icon={CalendarClock}
      eyebrow="Automation"
      title="Routines: scheduled, on-demand, or event-driven"
      lead="A routine is a saved configuration — a skill, extra instructions, a tool allowlist — plus the triggers that start it. One routine can carry all three trigger types at once."
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <Code
          label=".github/agent.yml"
          lang="yaml"
          code={`routines:
  - name: nightly-digest
    skill: commit-summary
    prompt: Summarize what merged yesterday and post it here.
    schedule: "0 9 * * *"      # every morning
    manual: true               # also: /run nightly-digest
    events: [pull_request.closed]
    filters:
      - { field: base_branch, operator: equals, value: main }

  - name: docs-drift
    skill: document
    prompt: Find docs that no longer match the code and update them.
    schedule: "0 3 * * 1"      # Mondays
    write: true                # may edit files — ships as a PR`}
        />
        <div>
          <Triggers
            rows={[
              ['schedule: "0 9 * * *"', 'Runs on a cron via your own workflow — no external scheduler to trust.'],
              ['/run nightly-digest', 'Starts it on demand from any issue or PR thread.'],
              ['events: [pull_request.closed]', 'Runs on repository events, narrowed by filters.'],
              ['write: true', 'Lets it change files. The result always arrives as a pull request.'],
            ]}
          />
          <p className="mt-5 text-sm leading-relaxed text-muted">
            Scheduling runs on GitHub's own scheduler inside your CI, on your credentials — there is no
            Forge-operated service holding a token for your repository.
          </p>
          <Code
            label=".github/workflows/forge-routines.yml"
            lang="yaml"
            code={`on:
  schedule: [{ cron: '0 9 * * *' }]
  workflow_dispatch:            # "Run workflow" button

jobs:
  routines:
    runs-on: ubuntu-latest
    steps:
      - uses: shipiit/forge@v1
        with:
          skill: commit-summary
          anthropic-api-key: \${{ secrets.ANTHROPIC_API_KEY }}`}
          />
        </div>
      </div>
    </Section>
  );
}
