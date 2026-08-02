import { SlidersHorizontal } from 'lucide-react';
import { Code } from '../../components/Code';
import { Tabs } from '../../components/Tabs';
import { Section } from '../../components/GuideBits';

const FILTER_FIELDS: [string, string][] = [
  ['author', 'The PR author’s username'],
  ['title · body', 'PR title and description text'],
  ['base_branch · head_branch', 'Branch it targets, branch it comes from'],
  ['labels', 'Labels applied to the PR'],
  ['is_draft · is_merged', 'Draft and merged state'],
];

export function ConfigSection() {
  return (
    <Section
      id="config"
      Icon={SlidersHorizontal}
      eyebrow="Configuration"
      title="Three layers, most specific wins"
      lead="Workflow input → .github/agent.yml → environment variable. An organization sets defaults once, and any repository can still override them without touching a secret. Anything malformed in repo config is ignored rather than breaking the run."
    >
      <Tabs
        ariaLabel="Configuration reference"
        tabs={[
          {
            id: 'agentyml',
            label: '.github/agent.yml',
            hint: 'Per-repository configuration, reviewed like any other change.',
            content: (
              <Code
                label=".github/agent.yml"
                lang="yaml"
                code={`# --- model -----------------------------------------------------
model: claude-sonnet-4-5

# --- when it acts ----------------------------------------------
auto_fix: label              # label | opened | off
auto_review: always          # always | requested | off
review_behavior: every_push  # opened | every_push | manual
trigger_label: agent-fix
trigger_phrase: "@our-bot"

# --- how it reviews --------------------------------------------
review_depth: standard       # light | standard | deep
max_nits: 5                  # -1 disables the cap
max_iterations: 25
sarif_path: results.sarif    # ingest CodeQL / Semgrep output
ignore_paths: [dist/, vendor/]

# --- only run on what matters ----------------------------------
filters:
  - { field: base_branch, operator: equals, value: main }
  - { field: is_draft, operator: equals, value: false }
  - { field: labels, operator: is_not_one_of, value: [skip-review] }

# --- change history --------------------------------------------
history: true
history_path: docs/CHANGE-HISTORY.md

# --- saved routines --------------------------------------------
routines:
  - name: nightly-digest
    skill: commit-summary
    schedule: "0 9 * * *"
    manual: true`}
              />
            ),
          },
          {
            id: 'env',
            label: 'Environment',
            hint: 'Organization-wide defaults. Set these on the server, or as env on the Action step.',
            content: (
              <div className="grid gap-4 lg:grid-cols-2">
                <Code
                  label="behaviour"
                  lang="bash"
                  code={`FORGE_AUTO_FIX=label
FORGE_AUTO_REVIEW=always
FORGE_REVIEW_BEHAVIOR=every_push
FORGE_REVIEW_DEPTH=standard
FORGE_TRIGGER_LABEL=agent-fix
FORGE_DISPLAY_HANDLE=@our-bot
FORGE_DISPLAY_NAME="Acme Bot"
FORGE_MAX_NITS=5
MAX_ITERATIONS=25
FORGE_HISTORY=1
FORGE_HISTORY_PATH=docs/CHANGE-HISTORY.md`}
                />
                <Code
                  label="model & cost"
                  lang="bash"
                  code={`LLM_PROVIDER=anthropic
FORGE_MODEL=claude-sonnet-4-5
FORGE_MAX_OUTPUT_TOKENS=16384
FORGE_PROMPT_CACHE=1          # 0 disables caching
FORGE_THINKING_BUDGET=0       # >0 enables extended thinking
FORGE_REASONING_EFFORT=medium # o-series / gpt-5
FORGE_FALLBACK_PROVIDERS=bedrock,openai

# self-hosted GitHub
GHES_HOSTNAME=github.example.com`}
                />
              </div>
            ),
          },
          {
            id: 'filters',
            label: 'Trigger filters',
            hint: 'All conditions must match before a run starts. Six operators, applied to any of eight fields.',
            content: (
              <div>
                <div className="overflow-hidden rounded-xl border border-white/[0.08]">
                  {FILTER_FIELDS.map(([k, d], i) => (
                    <div
                      key={k}
                      className={`grid grid-cols-1 gap-1.5 px-5 py-3.5 sm:grid-cols-[280px_1fr] ${
                        i ? 'border-t border-white/[0.08]' : ''
                      }`}
                    >
                      <code className="text-[13px] text-[rgb(var(--syn-keyword))]">{k}</code>
                      <span className="text-sm text-muted">{d}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-5">
                  <p className="text-sm leading-relaxed text-muted">
                    <span className="font-semibold text-amber-200/90">⚠ matches_regex tests the whole field</span>,
                    not a substring. A pattern of <code className="text-white/80">hotfix</code> matches only a
                    title that is exactly <code className="text-white/80">hotfix</code> — use{' '}
                    <code className="text-white/80">.*hotfix.*</code>, or the{' '}
                    <code className="text-white/80">contains</code> operator, for substring matching. This is the
                    single most common mistake with filters.
                  </p>
                </div>
              </div>
            ),
          },
          {
            id: 'instructions',
            label: 'Instruction files',
            hint: 'Two files let a repository shape how the agent behaves in it — with deliberately different weight.',
            content: (
              <div className="grid gap-4 lg:grid-cols-2">
                <Code
                  label="FORGE.md · AGENTS.md — project context"
                  lang="markdown"
                  code={`# Engineering standards

- Every database query is scoped to the caller's tenant.
- Never log email addresses, user ids, or request bodies.
- New API routes require an integration test.

Used by EVERY flow. A change that newly violates one of
these is reported as a nit — worth fixing, not blocking.`}
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

Injected as the highest-priority block, so it OVERRIDES
the default review guidance wherever the two disagree.`}
                />
              </div>
            ),
          },
        ]}
      />
    </Section>
  );
}
