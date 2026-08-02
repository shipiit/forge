import { Building2 } from 'lucide-react';
import { Code } from '../../components/Code';
import { Tabs } from '../../components/Tabs';
import { Section, Walkthrough } from '../../components/GuideBits';

export function OrgSection() {
  return (
    <Section
      id="org"
      Icon={Building2}
      eyebrow="For organizations"
      title="Roll it out across every repository"
      lead="Two paths. The GitHub App installs once and covers every repository in the organization. The Action is per-repository but needs no server — start with one repo, then template it."
    >
      <Tabs
        ariaLabel="Organization rollout"
        tabs={[
          {
            id: 'app',
            label: 'GitHub App — org-wide',
            hint: 'Install once, cover everything. You host the webhook server.',
            content: (
              <div className="grid gap-6 lg:grid-cols-2">
                <Walkthrough
                  steps={[
                    ['Create the App', 'Contents, Issues, Pull requests, and Checks — all read & write.'],
                    ['Install org-wide', 'Choose "All repositories" so new repos are covered automatically.'],
                    ['Deploy the server', 'Render, Cloud Run, or any Docker host with a public HTTPS URL.'],
                    ['Set org defaults', 'Environment variables become the default for every repository.'],
                  ]}
                />
                <Code
                  label="org-wide defaults — environment"
                  lang="bash"
                  code={`FORGE_AUTO_REVIEW=always
FORGE_REVIEW_BEHAVIOR=every_push
FORGE_MAX_NITS=5
FORGE_HISTORY=1
FORGE_MAX_OUTPUT_TOKENS=16384
FORGE_FALLBACK_PROVIDERS=bedrock,openai
FORGE_DISPLAY_HANDLE=@our-bot

# Each repo can still override any of these
# in its own .github/agent.yml`}
                />
              </div>
            ),
          },
          {
            id: 'action',
            label: 'GitHub Action — per repo',
            hint: 'No server at all. Put the key in an organization secret and the same file drops into every repo unchanged.',
            content: (
              <div className="grid gap-6 lg:grid-cols-2">
                <Code
                  label="Settings → Secrets → Organization secrets"
                  lang="bash"
                  code={`# One secret, available to every repository:
ANTHROPIC_API_KEY

# Then ship the same workflow from your .github
# template repository, or commit it per repo.`}
                />
                <Code
                  label=".github/workflows/forge.yml"
                  lang="yaml"
                  code={`name: ShipIT Forge
on:
  issues: { types: [opened, labeled] }
  issue_comment: { types: [created] }
  pull_request: { types: [opened, synchronize, closed] }

permissions:
  contents: write
  pull-requests: write
  issues: write

jobs:
  forge:
    runs-on: ubuntu-latest
    steps:
      - uses: shipiit/forge@v1
        with:
          anthropic-api-key: \${{ secrets.ANTHROPIC_API_KEY }}`}
                />
              </div>
            ),
          },
          {
            id: 'standards',
            label: 'Enforce standards',
            hint: 'Two files let a repository shape how the agent behaves in it.',
            content: (
              <div className="grid gap-6 lg:grid-cols-2">
                <Code
                  label="FORGE.md — project context"
                  lang="markdown"
                  code={`# Engineering standards

- Every database query is scoped to the caller's tenant.
- Never log email addresses, user ids, or request bodies.
- New API routes require an integration test.

Used by every flow. A change that newly violates one of
these is reported as a **nit** — worth fixing, not blocking.`}
                />
                <Code
                  label="REVIEW.md — review only, highest priority"
                  lang="markdown"
                  code={`# Review instructions

## What Important means here
Reserve Important for findings that would break behaviour,
leak data, or block a rollback. Style is Nit at most.

## Do not report
- Anything CI already enforces: lint, formatting, types
- Generated files under src/gen/ and any *.lock file

## Cap the nits
Report at most five. Summarize the rest as a count.`}
                />
              </div>
            ),
          },
        ]}
      />
    </Section>
  );
}
