import { Blocks } from 'lucide-react';
import { Code } from '../../components/Code';
import { Tabs } from '../../components/Tabs';
import { Section } from '../../components/GuideBits';

const BUILT_INS: [string, string][] = [
  ['/code-review', 'Correctness, regressions, security — scoped to the change.'],
  ['/fix-issue', 'Investigate, fix, add tests, verify.'],
  ['/pr-description', 'A reviewer-focused description from the diff.'],
  ['/commit-summary', 'Summarize one commit for the change history.'],
  ['/document', 'Write or update docs for code that changed.'],
  ['/security-audit', 'Source-to-sink vulnerability hunt with CWEs.'],
  ['/triage', 'Diagnose without touching any code.'],
  ['+ your own', 'Commit a file, or define one inline in the workflow.'],
];

export function SkillsSection() {
  return (
    <Section
      id="skills"
      Icon={Blocks}
      eyebrow="Skills"
      title="Named prompt packs your team controls"
      lead="A skill bundles instructions with a tool allowlist, so a request behaves the same way every time. Forge ships seven; your repository can override any of them, or add its own."
    >
      <div className="grid gap-px overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.06] sm:grid-cols-2 lg:grid-cols-4">
        {BUILT_INS.map(([name, d]) => (
          <div key={name} className="bg-[rgb(11_11_14)] p-6">
            <code className="text-[13px] font-semibold text-[rgb(var(--syn-keyword))]">{name}</code>
            <p className="mt-2 text-sm leading-relaxed text-muted">{d}</p>
          </div>
        ))}
      </div>

      <h3 className="mt-10 text-lg font-semibold">Add your own — three ways</h3>
      <p className="mb-4 mt-2 max-w-3xl text-sm leading-relaxed text-muted">
        Most specific wins: a skill defined in the workflow beats a committed file, which beats the built-in. A
        read-only skill's tool allowlist is <span className="text-text">enforced</span> — the write tools are
        simply never offered to the model.
      </p>
      <Tabs
        ariaLabel="Defining a skill"
        tabs={[
          {
            id: 'file',
            label: 'Commit a file',
            hint: 'Checked in with the repository, so the whole team gets it.',
            content: (
              <Code
                label=".forge/skills/house-review.md"
                lang="markdown"
                code={`---
name: house-review
description: Our review standards
tools: read_file, search, glob
---
Reserve Important for anything that would break behaviour, leak
data, or block a rollback. Style and naming are Nit at most.

Always check that new API routes have an integration test.
Never report anything CI already enforces (lint, formatting, types).`}
              />
            ),
          },
          {
            id: 'inline',
            label: 'Define in the workflow',
            hint: 'No committed file needed — useful for org-wide standards pushed from a template.',
            content: (
              <Code
                label=".github/workflows/forge.yml"
                lang="yaml"
                code={`- uses: shipiit/forge@v2
  with:
    anthropic-api-key: \${{ secrets.ANTHROPIC_API_KEY }}
    skill-name: house-review
    skill-tools: read_file search glob
    skill-prompt: |
      Reserve Important for anything that would break behaviour.
      Always check that new API routes have an integration test.`}
              />
            ),
          },
          {
            id: 'select',
            label: 'Select a built-in',
            hint: 'Run one specific skill for this workflow, and nothing else.',
            content: (
              <Code
                label=".github/workflows/forge.yml"
                lang="yaml"
                code={`- uses: shipiit/forge@v2
  with:
    skill: code-review
    allowed-tools: read_file search glob   # fewer tools, fewer tokens
    max-turns: "12"
    anthropic-api-key: \${{ secrets.ANTHROPIC_API_KEY }}`}
              />
            ),
          },
          {
            id: 'cli',
            label: 'Run locally',
            hint: 'The same skills work from the CLI, against any checkout.',
            content: (
              <Code
                label="bash"
                lang="bash"
                code={`forge skills                     # list what is available
forge run --repo . --skill code-review --task "check the auth path"
forge run --repo . --skill document --write`}
              />
            ),
          },
        ]}
      />
    </Section>
  );
}
