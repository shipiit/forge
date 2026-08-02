import { Code } from './Code';
import { Tabs } from './Tabs';

/**
 * The complete GitHub Action input surface, grouped by what it controls.
 *
 * Every input is optional. With none of them set the behaviour is the default,
 * so adding any of this can never change how an existing workflow runs.
 */

type Input = { name: string; value: string; desc: string; def?: string };

const GROUPS: { id: string; label: string; hint: string; inputs: Input[] }[] = [
  {
    id: 'model',
    label: 'Model',
    hint: 'Which provider answers, and how hard it thinks. Credentials go in the last tab.',
    inputs: [
      { name: 'provider', value: 'anthropic | openai | gemini | vertex | bedrock | groq | together | ollama | openai-compatible', desc: 'Which provider this run uses.', def: 'anthropic' },
      { name: 'model', value: 'string', desc: 'Model id for that provider. Falls back to the provider default.' },
      { name: 'fallback-providers', value: 'bedrock,openai', desc: 'Comma-separated chain tried when the primary fails hard. Per call, not sticky — a brief outage never pins the run to a weaker model.' },
      { name: 'prompt-cache', value: '0 | 1', desc: 'Prompt caching. Leave it on unless you are debugging — it is the single biggest cost lever.', def: '1' },
      { name: 'thinking-budget', value: 'number', desc: 'Extended-thinking tokens (Anthropic, Gemini). max_tokens is raised automatically to fit.', def: '0' },
    ],
  },
  {
    id: 'behaviour',
    label: 'Behaviour',
    hint: 'What this particular run does. A workflow can be as specific as you like.',
    inputs: [
      { name: 'prompt', value: 'multiline string', desc: 'Extra instructions appended to the system prompt. Labelled as taking precedence over the built-in guidance, so it overrides rather than blends.' },
      { name: 'trigger-phrase', value: '@our-bot', desc: 'The mention handle that addresses the agent.', def: '@shipit-forge' },
      { name: 'max-nits', value: 'number', desc: 'Cap low-severity inline review comments. The rest are summarized as a count. -1 disables the cap.', def: '5' },
    ],
  },
  {
    id: 'skills',
    label: 'Skills',
    hint: 'Select a built-in, point at committed files, or define a skill inline — no file needed. Most specific wins.',
    inputs: [
      { name: 'skill', value: 'code-review | fix-issue | …', desc: 'Run a named skill for this workflow. A repo skill with the same name overrides the built-in.' },
      { name: 'skill-name', value: 'string', desc: 'Name for the skill defined inline below.', def: 'workflow-skill' },
      { name: 'skill-description', value: 'string', desc: 'One-line description for the inline skill.' },
      { name: 'skill-prompt', value: 'multiline string', desc: 'Define a skill directly in the workflow. Takes precedence over both committed files and built-ins.' },
      { name: 'skill-tools', value: 'read_file search glob', desc: 'Tool allowlist for the inline skill. Enforced, not suggested.' },
      { name: 'skills-path', value: 'path', desc: 'Extra directory to load committed skills from.', def: '.forge/skills' },
    ],
  },
  {
    id: 'limits',
    label: 'Limits & tools',
    hint: 'The cost controls. Every tool schema is resent on every turn, so a tight allowlist is the cheapest optimization available.',
    inputs: [
      { name: 'allowed-tools', value: 'read_file search glob', desc: 'Only these tools are offered. Comma or space separated. Empty means all tools for the flow.' },
      { name: 'disallowed-tools', value: 'run_bash', desc: 'Remove specific tools. Applied after the allowlist.' },
      { name: 'max-turns', value: 'number', desc: 'Cap the agent loop for this run.', def: '25' },
      { name: 'max-output-tokens', value: 'number', desc: 'Output budget per model turn. Clamped automatically to what the model actually accepts.', def: '16384' },
    ],
  },
  {
    id: 'creds',
    label: 'Credentials',
    hint: 'All from GitHub Secrets — never hardcoded. Every log path runs through a redactor that strips keys, PEM blocks, and tokens embedded in clone URLs.',
    inputs: [
      { name: 'github-token', value: '${{ github.token }}', desc: 'Used for API calls and cloning.', def: 'the workflow token' },
      { name: 'anthropic-api-key', value: '${{ secrets.… }}', desc: 'Anthropic API key.' },
      { name: 'openai-api-key', value: '${{ secrets.… }}', desc: 'OpenAI API key.' },
      { name: 'gemini-api-key', value: '${{ secrets.… }}', desc: 'Gemini API key.' },
      { name: 'vertex-credentials-json', value: '${{ secrets.… }}', desc: 'Vertex service-account JSON, written to a 0600 file at runtime.' },
      { name: 'app-id · private-key', value: '${{ secrets.… }}', desc: 'Act as your own GitHub App: a branded bot identity, and its commits retrigger CI (the default workflow token’s do not).' },
    ],
  },
];

function InputTable({ inputs }: { inputs: Input[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.08]">
      <div className="hidden grid-cols-[210px_1fr] gap-4 border-b border-white/[0.08] bg-white/[0.02] px-5 py-3 text-[11px] uppercase tracking-[0.16em] text-muted sm:grid">
        <span>Input</span>
        <span>What it does</span>
      </div>
      {inputs.map((inp, i) => (
        <div
          key={inp.name}
          className={`grid grid-cols-1 gap-2 px-5 py-4 transition-colors hover:bg-white/[0.02] sm:grid-cols-[210px_1fr] sm:gap-4 ${
            i ? 'border-t border-white/[0.08]' : ''
          }`}
        >
          <div className="min-w-0">
            <code className="block break-words text-[13px] font-semibold text-[rgb(var(--syn-keyword))]">{inp.name}</code>
            {inp.def && <span className="mt-1 block text-[11px] text-muted">default: {inp.def}</span>}
          </div>
          <div className="min-w-0">
            <code className="block break-words text-[12px] text-[rgb(var(--syn-string))]">{inp.value}</code>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{inp.desc}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ActionReference() {
  return (
    <Tabs
      ariaLabel="GitHub Action inputs"
      tabs={[
        ...GROUPS.map((g) => ({
          id: g.id,
          label: g.label,
          hint: g.hint,
          content: <InputTable inputs={g.inputs} />,
        })),
        {
          id: 'recipes',
          label: 'Recipes',
          hint: 'Complete workflows you can copy directly. Each one is a different shape of the same Action.',
          content: (
            <div className="grid gap-4 lg:grid-cols-2">
              <Code label="Review only — cheapest useful setup" lang="yaml" code={`on:
  pull_request: { types: [opened, synchronize] }

permissions:
  contents: read
  pull-requests: write
  checks: write

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: shipiit/forge@v2
        with:
          skill: code-review
          allowed-tools: read_file search glob
          max-turns: "10"
          max-nits: "3"
          anthropic-api-key: \${{ secrets.ANTHROPIC_API_KEY }}`} />

              <Code label="Security gate on protected branches" lang="yaml" code={`on:
  pull_request: { branches: [main] }

jobs:
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: shipiit/forge@v2
        with:
          skill: security-audit
          prompt: |
            Report only findings with a concrete exploit path:
            name the source, the sink, and the path between.
            Anything you cannot demonstrate is not a finding.
          anthropic-api-key: \${{ secrets.ANTHROPIC_API_KEY }}`} />

              <Code label="Team standards, no committed file" lang="yaml" code={`- uses: shipiit/forge@v2
  with:
    skill-name: house-review
    skill-description: Our review standards
    skill-tools: read_file search glob
    skill-prompt: |
      Reserve Important for anything that would break
      behaviour, leak data, or block a rollback.
      Style and naming are Nit at most.
      Always check new API routes have an integration test.
    anthropic-api-key: \${{ secrets.ANTHROPIC_API_KEY }}`} />

              <Code label="Branded bot, so its commits retrigger CI" lang="yaml" code={`- uses: shipiit/forge@v2
  with:
    app-id: \${{ secrets.APP_ID }}
    private-key: \${{ secrets.APP_PRIVATE_KEY }}
    trigger-phrase: "@acme-bot"
    anthropic-api-key: \${{ secrets.ANTHROPIC_API_KEY }}

# Commits made with the default workflow token do NOT
# trigger other workflows. Commit as an App if you want
# your CI to run on a fix Forge pushes.`} />

              <Code label="Nightly digest" lang="yaml" code={`on:
  schedule: [{ cron: '0 9 * * *' }]
  workflow_dispatch:

jobs:
  digest:
    runs-on: ubuntu-latest
    steps:
      - uses: shipiit/forge@v2
        with:
          skill: commit-summary
          prompt: Summarize every PR merged in the last 24 hours.
          allowed-tools: read_file search glob
          anthropic-api-key: \${{ secrets.ANTHROPIC_API_KEY }}`} />

              <Code label="Enterprise: Bedrock via OIDC, no static keys" lang="yaml" code={`permissions:
  id-token: write        # required for OIDC
  contents: write
  pull-requests: write

steps:
  - uses: aws-actions/configure-aws-credentials@v4
    with:
      role-to-assume: \${{ secrets.AWS_ROLE_TO_ASSUME }}
      aws-region: us-east-1

  - uses: shipiit/forge@v2
    with:
      provider: bedrock
      fallback-providers: anthropic`} />
            </div>
          ),
        },
      ]}
    />
  );
}
