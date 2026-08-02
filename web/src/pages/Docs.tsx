import { Link } from "react-router-dom";
import { Header, Footer } from "../components/Layout";
import { Tabs } from "../components/Tabs";
import { useActiveSection } from "../components/useActiveSection";
import { ScrollProgress } from "../components/ScrollProgress";
import { Code } from "../components/Code";
import { ProviderSetup } from "../components/ProviderSetup";

const GH = "https://github.com/shipiit/forge/blob/main";
const ext = { target: "_blank", rel: "noopener noreferrer" } as const;

const COMMANDS: [string, string][] = [
  [
    "label agent-fix / open issue",
    "Posts a detailed analysis (root cause + proposed fix)",
  ],
  ["/fix", "Implements the fix, writes tests, opens a PR"],
  ["open a PR (automatic)", "Code + security review with inline suggestions"],
  ["/review · /security", "On-demand full or security-only review"],
  ["/audit", "Full-repository security scan + Dependabot CVEs"],
  ["@shipit-forge …", "Answer, or push a follow-up commit on a PR"],
];

const TOC: [string, string][] = [
  ["quickstart", "Quick start"],
  ["provider", "Configure a model"],
  ["action", "GitHub Action"],
  ["schedule", "Schedules & routines"],
  ["skills", "Skills"],
  ["config", "Configuration"],
  ["deploy", "Deploy 24/7"],
  ["commands", "Commands"],
  ["install", "Action vs App"],
  ["faq", "FAQ"],
];

const TOC_IDS = TOC.map(([id]) => id);

function H({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="display mt-16 scroll-mt-24 text-3xl first:mt-0">
      {children}
    </h2>
  );
}

export function Docs() {
  const active = useActiveSection(TOC_IDS);

  return (
    <>
      <ScrollProgress />
      <Header />
      <div className="mx-auto grid max-w-[1500px] grid-cols-1 gap-14 px-7 pt-14 lg:grid-cols-[200px_minmax(0,1fr)]">
        <aside className="sticky top-24 hidden self-start lg:block">
          <nav
            aria-label="On this page"
            className="relative border-l border-white/[0.08]"
          >
            {TOC.map(([id, label]) => {
              const isActive = id === active;
              return (
                <a
                  key={id}
                  href={`#${id}`}
                  aria-current={isActive ? "true" : undefined}
                  className={`relative block py-1.5 pl-4 text-sm transition-colors duration-200 motion-reduce:transition-none ${
                    isActive
                      ? "font-medium text-text"
                      : "text-muted hover:text-text"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`absolute -left-px top-0 h-full w-px transition-colors duration-200 ${
                      isActive
                        ? "bg-[rgb(var(--syn-keyword))]"
                        : "bg-transparent"
                    }`}
                  />
                  {label}
                </a>
              );
            })}
          </nav>
        </aside>

        <main className="min-w-0 pb-20">
          <span className="eyebrow">Documentation</span>
          <h1 className="display mt-6 text-[clamp(40px,6vw,64px)]">
            Up and running
            <br />
            <span className="dim">in minutes.</span>
          </h1>

          <H id="quickstart">Quick start</H>
          <p className="text-muted">
            The engine runs locally with a built-in fake provider — no API keys
            needed.
          </p>
          <Code
            label="bash"
            code={`git clone https://github.com/shipiit/forge.git && cd forge
npm install && npm run build && npm test
node dist/cli.js fix --repo /path/to/repo --task "fix the failing login test" --provider fake`}
          />

          <H id="provider">Configure a model</H>
          <p className="text-muted">
            Bring your own model — pick a provider, get its credentials, and the
            same env vars work everywhere (CLI, GitHub Action secrets, hosted
            App). The quickest path is the wizard:
          </p>
          <Code
            label="forge setup"
            code={`node dist/cli.js setup   # choose a provider, paste your key — writes a gitignored .env (chmod 600)`}
          />
          <p className="mt-4 text-muted">
            Or follow the detailed steps for your provider below 👇
          </p>
          <ProviderSetup />
          <p className="mt-5 text-sm text-muted">
            Per-repo override (no secret change) via{" "}
            <a href={`${GH}/deploy/PROVIDERS.md`} {...ext}>
              PROVIDERS.md
            </a>{" "}
            and <code className="text-white/80">.github/agent.yml</code>:{" "}
            <code className="text-white/80">model: gemini-2.5-pro</code>. All
            four default models are vision-capable, so Forge reads screenshots
            in issues &amp; PRs automatically.
          </p>

          <H id="action">Use it as a GitHub Action</H>
          <p className="text-muted">
            No server, no App registration — Forge runs inside your own CI on
            your own key. One workflow file enables every capability, and each
            input below lets a workflow decide exactly what this run does.
          </p>
          <Tabs
            ariaLabel="GitHub Action setup"
            tabs={[
              {
                id: "workflow",
                label: "The workflow",
                hint: "Drop this in, add one secret, and you are done. Every trigger Forge understands is wired here.",
                content: (
                  <Code
                    label=".github/workflows/forge.yml"
                    lang="yaml"
                    code={`name: ShipIT Forge

on:
  issues: { types: [opened, labeled] }
  issue_comment: { types: [created] }
  pull_request: { types: [opened, synchronize, closed] }
  pull_request_review_comment: { types: [created] }
  check_suite: { types: [completed] }
  release: { types: [published] }

permissions:
  contents: write        # clone, push fix branches
  pull-requests: write   # open PRs, post reviews
  issues: write          # comment on issues
  checks: write          # post the review check run

concurrency:             # one run per thread; cancel superseded ones
  group: forge-\${{ github.event.issue.number || github.event.pull_request.number || github.ref }}
  cancel-in-progress: false

jobs:
  forge:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: shipiit/forge@v1
        with:
          provider: anthropic
          anthropic-api-key: \${{ secrets.ANTHROPIC_API_KEY }}`}
                  />
                ),
              },
              {
                id: "inputs",
                label: "Every input",
                hint: "All optional. With none of them set, behaviour is the default — so adding this can never change how an existing workflow runs.",
                content: (
                  <div className="overflow-hidden rounded-xl border border-white/[0.08]">
                    {[
                      [
                        "provider · model",
                        "Which provider and model this run uses.",
                      ],
                      [
                        "prompt",
                        "Extra instructions appended to the system prompt, taking precedence over the defaults.",
                      ],
                      [
                        "skill",
                        "Run a named skill: code-review, fix-issue, document, triage, …",
                      ],
                      [
                        "skill-name · skill-prompt · skill-tools",
                        "Define a skill inline — no committed file needed.",
                      ],
                      [
                        "skills-path",
                        "Extra directory to load committed skills from.",
                      ],
                      [
                        "allowed-tools · disallowed-tools",
                        "Narrow the toolset. Fewer schemas means fewer tokens on every turn.",
                      ],
                      [
                        "max-turns",
                        "Cap the agent loop for this run (default 25).",
                      ],
                      [
                        "max-output-tokens",
                        "Output budget per model turn (default 16384).",
                      ],
                      [
                        "max-nits",
                        "Cap low-severity review comments; -1 disables the cap.",
                      ],
                      [
                        "trigger-phrase",
                        "The mention handle that addresses the agent.",
                      ],
                      [
                        "prompt-cache",
                        'Set "0" to disable prompt caching. On by default.',
                      ],
                      [
                        "thinking-budget",
                        "Extended-thinking token budget. 0 disables it.",
                      ],
                      [
                        "fallback-providers",
                        'Comma-separated fallback chain, e.g. "bedrock,openai".',
                      ],
                      [
                        "app-id · private-key",
                        "Act as your own GitHub App instead of the workflow token.",
                      ],
                    ].map(([k, d], i) => (
                      <div
                        key={k}
                        className={`grid grid-cols-1 gap-1.5 px-5 py-3.5 transition-colors hover:bg-white/[0.02] sm:grid-cols-[340px_1fr] ${i ? "border-t border-white/[0.08]" : ""}`}
                      >
                        <code className="text-[13px] text-[rgb(var(--syn-keyword))]">
                          {k}
                        </code>
                        <span className="text-sm leading-relaxed text-muted">
                          {d}
                        </span>
                      </div>
                    ))}
                  </div>
                ),
              },
              {
                id: "recipes",
                label: "Recipes",
                hint: "Common shapes you can copy directly.",
                content: (
                  <div className="grid gap-4 lg:grid-cols-2">
                    <Code
                      label="Review-only, cheapest possible"
                      lang="yaml"
                      code={`on:
  pull_request: { types: [opened, synchronize] }

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: shipiit/forge@v1
        with:
          skill: code-review
          allowed-tools: read_file search glob
          max-turns: "10"
          max-nits: "3"
          anthropic-api-key: \${{ secrets.ANTHROPIC_API_KEY }}`}
                    />
                    <Code
                      label="Security gate on protected branches"
                      lang="yaml"
                      code={`on:
  pull_request: { branches: [main] }

jobs:
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: shipiit/forge@v1
        with:
          skill: security-audit
          prompt: |
            Report only findings with a concrete exploit path.
            Anything you cannot demonstrate is not a finding.
          anthropic-api-key: \${{ secrets.ANTHROPIC_API_KEY }}`}
                    />
                    <Code
                      label="Nightly digest"
                      lang="yaml"
                      code={`on:
  schedule: [{ cron: '0 9 * * *' }]
  workflow_dispatch:

jobs:
  digest:
    runs-on: ubuntu-latest
    steps:
      - uses: shipiit/forge@v1
        with:
          skill: commit-summary
          prompt: Summarize what merged yesterday.
          anthropic-api-key: \${{ secrets.ANTHROPIC_API_KEY }}`}
                    />
                    <Code
                      label="Team standards, no committed file"
                      lang="yaml"
                      code={`- uses: shipiit/forge@v1
  with:
    skill-name: house-review
    skill-tools: read_file search glob
    skill-prompt: |
      Reserve Important for anything that would break
      behaviour, leak data, or block a rollback.
      Always check new API routes have an integration test.
    anthropic-api-key: \${{ secrets.ANTHROPIC_API_KEY }}`}
                    />
                  </div>
                ),
              },
              {
                id: "identity",
                label: "Bot identity",
                hint: "By default comments come from github-actions[bot]. Use your own App for a branded identity — and so its commits retrigger CI.",
                content: (
                  <div className="grid gap-4 lg:grid-cols-2">
                    <Code
                      label=".github/workflows/forge.yml"
                      lang="yaml"
                      code={`- uses: shipiit/forge@v1
  with:
    app-id: \${{ secrets.APP_ID }}
    private-key: \${{ secrets.APP_PRIVATE_KEY }}
    trigger-phrase: "@our-bot"
    anthropic-api-key: \${{ secrets.ANTHROPIC_API_KEY }}`}
                    />
                    <div className="panel p-6 text-sm leading-relaxed text-muted">
                      <p>
                        <span className="text-text">Why it matters:</span>{" "}
                        commits made with the default workflow token do{" "}
                        <em className="not-italic text-text">not</em> trigger
                        other workflows. If you want your CI to run on a fix
                        Forge pushes, it has to commit as an App.
                      </p>
                      <p className="mt-3">
                        The App needs Contents, Issues, and Pull requests — read
                        &amp; write. Add Checks if you want the review check run
                        too.
                      </p>
                    </div>
                  </div>
                ),
              },
            ]}
          />

          <H id="schedule">Schedules &amp; routines</H>
          <p className="text-muted">
            A <span className="text-text">routine</span> is a saved
            configuration — a skill, extra instructions, a tool allowlist — plus
            the triggers that start it. One routine can carry all three trigger
            types at once: a cron schedule, an on-demand{" "}
            <code className="text-white/80">/run</code>, and a reaction to
            repository events.
          </p>

          <div className="mt-6 grid gap-px overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.06] sm:grid-cols-3">
            {[
              [
                "⏰ Scheduled",
                "A cron on your own workflow. Nightly digests, weekly docs sweeps.",
              ],
              [
                "⚡ On demand",
                'Comment /run <name> in any thread, or hit "Run workflow".',
              ],
              [
                "🎯 Event-driven",
                "On merge, on release, on a labelled PR — narrowed by filters.",
              ],
            ].map(([t, d]) => (
              <div key={t} className="bg-[rgb(11_11_14)] p-6">
                <h3 className="text-[15px] font-semibold">{t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{d}</p>
              </div>
            ))}
          </div>

          <h3 className="mt-9 text-lg font-semibold">
            Step 1 — define the routine
          </h3>
          <p className="mt-1.5 text-sm text-muted">
            Routines live in your repository, so they are reviewed like any
            other change.
          </p>
          <Code
            label=".github/agent.yml"
            lang="yaml"
            code={`routines:
  - name: nightly-digest
    skill: commit-summary
    prompt: Summarize what merged yesterday and post it here.
    schedule: "0 9 * * *"          # 09:00 daily
    manual: true                   # also: /run nightly-digest
    events: [pull_request.closed]  # and on every merge
    filters:
      - { field: base_branch, operator: equals, value: main }

  - name: docs-drift
    skill: document
    prompt: Find docs that no longer match the code and update them.
    schedule: "0 3 * * 1"          # 03:00 Mondays
    write: true                    # may edit files — opens a PR`}
          />

          <h3 className="mt-9 text-lg font-semibold">
            Step 2 — add the schedule workflow
          </h3>
          <p className="mt-1.5 text-sm text-muted">
            Forge has no scheduler of its own by design. GitHub already has one,
            and using it keeps every run inside your CI, on your credentials —
            there is no Forge-operated service holding a token for your
            repository.
          </p>
          <Code
            label=".github/workflows/forge-routines.yml"
            lang="yaml"
            code={`name: Forge routines

on:
  schedule:
    - cron: '0 9 * * *'      # nightly digest
    - cron: '0 3 * * 1'      # Monday docs sweep
  workflow_dispatch:          # adds a "Run workflow" button

permissions:
  contents: write
  pull-requests: write
  issues: write

jobs:
  routines:
    runs-on: ubuntu-latest
    steps:
      - uses: shipiit/forge@v1
        with:
          skill: commit-summary
          allowed-tools: read_file search glob   # fewer tokens
          max-turns: "10"
          anthropic-api-key: \${{ secrets.ANTHROPIC_API_KEY }}`}
          />

          <h3 className="mt-9 text-lg font-semibold">
            Step 3 — trigger it any way you like
          </h3>
          <Code
            label="three ways to start the same routine"
            lang="bash"
            code={`# 1. On its schedule — nothing to do, the cron fires it.

# 2. On demand, from any issue or PR comment:
/run nightly-digest
/run docs-drift only the API reference

# 3. Locally, against a checkout:
forge run --repo . --skill commit-summary --task "summarize this week"`}
          />

          <p className="mt-5 text-sm text-muted">
            A routine with <code className="text-white/80">write: true</code>{" "}
            always ships its work as a{" "}
            <span className="text-text">pull request</span> on a{" "}
            <code className="text-white/80">forge/routine-*</code> branch —
            never a direct push to your default branch.
          </p>

          <H id="skills">Skills</H>
          <p className="text-muted">
            A skill bundles instructions with a tool allowlist, so a request
            behaves the same way every time. Seven ship built in. A read-only
            skill's allowlist is <span className="text-text">enforced</span> —
            the write tools are never offered to the model, so it cannot change
            files even if asked.
          </p>
          <Code
            label="list what is available"
            lang="bash"
            code={`forge skills

# 🧩 Skills available in .
#
# - /code-review     — Review a change for correctness bugs, regressions, and security issues.
# - /commit-summary  — Summarize a single commit or push for a change-history document.
# - /document        — Write or update documentation for code that changed.
# - /fix-issue       — Investigate an issue, implement the fix, add tests, and verify.
# - /pr-description  — Write a reviewer-focused pull request description from a diff.
# - /security-audit  — Hunt for exploitable vulnerabilities and report them with CWE and severity.
# - /triage          — Diagnose an issue without changing any code.`}
          />

          <h3 className="mt-9 text-lg font-semibold">Add your own</h3>
          <p className="mt-1.5 text-sm text-muted">
            Most specific wins: a skill defined in the workflow beats a
            committed file, which beats the built-in. Give a repo skill the same
            name as a built-in to replace it entirely.
          </p>
          <Code
            label=".forge/skills/house-review.md"
            lang="markdown"
            code={`---
name: house-review
description: Our review standards
tools: read_file, search, glob
---
Reserve Important for anything that would break behaviour, leak data,
or block a rollback. Style and naming are Nit at most.

Always check that new API routes have an integration test.
Never report anything CI already enforces (lint, formatting, types).`}
          />
          <p className="mt-4 text-sm text-muted">
            Or define one straight in the workflow, with no committed file:
          </p>
          <Code
            label=".github/workflows/forge.yml"
            lang="yaml"
            code={`- uses: shipiit/forge@v1
  with:
    anthropic-api-key: \${{ secrets.ANTHROPIC_API_KEY }}
    skill-name: house-review
    skill-tools: read_file search glob
    skill-prompt: |
      Reserve Important for anything that would break behaviour.
      Always check that new API routes have an integration test.`}
          />
          <p className="mt-4 text-sm text-muted">
            Then invoke it anywhere: comment{" "}
            <code className="text-white/80">/house-review</code> on a PR, name
            it in a routine, or run{" "}
            <code className="text-white/80">
              forge run --skill house-review
            </code>
            . Full reference on the{" "}
            <Link
              to="/github#skills"
              className="text-white/80 underline-offset-4 hover:underline"
            >
              GitHub guide
            </Link>
            .
          </p>

          <H id="config">Configuration</H>
          <p className="text-muted">
            Every setting has three layers, most specific winning:{" "}
            <span className="text-text">workflow input</span> →{" "}
            <span className="text-text">.github/agent.yml</span> →{" "}
            <span className="text-text">environment variable</span>. So an
            organization sets defaults once, and any repository can still
            override them without touching a secret.
          </p>
          <Tabs
            ariaLabel="Configuration reference"
            tabs={[
              {
                id: "agentyml",
                label: ".github/agent.yml",
                hint: "Per-repository configuration, reviewed like any other change. Anything malformed is ignored rather than breaking the run.",
                content: (
                  <Code
                    label=".github/agent.yml"
                    lang="yaml"
                    code={`# --- model -----------------------------------------------------
model: claude-sonnet-4-5

# --- when it acts ----------------------------------------------
auto_fix: label            # label | opened | off
auto_review: always        # always | requested | off
review_behavior: every_push  # opened | every_push | manual
trigger_label: agent-fix
trigger_phrase: "@our-bot"

# --- how it reviews --------------------------------------------
review_depth: standard     # light | standard | deep
max_nits: 5                # -1 disables the cap
max_iterations: 25
sarif_path: results.sarif  # ingest CodeQL / Semgrep output
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
                id: "env",
                label: "Environment",
                hint: "Organization-wide defaults. Set these on the server, or as env on the Action step.",
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
                id: "filters",
                label: "Trigger filters",
                hint: "All conditions must match before a run starts. Six operators, applied to any of eight fields.",
                content: (
                  <div>
                    <div className="overflow-hidden rounded-xl border border-white/[0.08]">
                      {[
                        ["author", "The PR author’s username"],
                        ["title · body", "PR title and description text"],
                        [
                          "base_branch · head_branch",
                          "Branch it targets, branch it comes from",
                        ],
                        ["labels", "Labels applied to the PR"],
                        ["is_draft · is_merged", "Draft and merged state"],
                      ].map(([k, d], i) => (
                        <div
                          key={k}
                          className={`grid grid-cols-1 gap-1.5 px-5 py-3.5 sm:grid-cols-[280px_1fr] ${i ? "border-t border-white/[0.08]" : ""}`}
                        >
                          <code className="text-[13px] text-[rgb(var(--syn-keyword))]">
                            {k}
                          </code>
                          <span className="text-sm text-muted">{d}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-5">
                      <p className="text-sm leading-relaxed text-muted">
                        <span className="font-semibold text-amber-200/90">
                          ⚠ matches_regex tests the whole field
                        </span>
                        , not a substring. A pattern of{" "}
                        <code className="text-white/80">hotfix</code> matches
                        only a title that is exactly{" "}
                        <code className="text-white/80">hotfix</code> — use{" "}
                        <code className="text-white/80">.*hotfix.*</code>, or
                        the <code className="text-white/80">contains</code>{" "}
                        operator, for substring matching. This is the single
                        most common mistake with filters.
                      </p>
                    </div>
                  </div>
                ),
              },
              {
                id: "instructions",
                label: "Instruction files",
                hint: "Two files let a repository shape how the agent behaves in it — with deliberately different weight.",
                content: (
                  <div className="grid gap-4 lg:grid-cols-2">
                    <Code
                      label="CLAUDE.md · AGENTS.md — project context"
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

          <H id="deploy">Deploy 24/7</H>
          <div className="mt-4 grid gap-px overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.06] md:grid-cols-3">
            {[
              [
                "Render",
                "Connect the repo → builds the Dockerfile. ",
                `${GH}/deploy/RENDER.md`,
              ],
              [
                "Cloud Run",
                "One command: ./deploy/cloudrun.sh. ",
                `${GH}/deploy/DEPLOY.md`,
              ],
              [
                "Any Docker host",
                "Railway, Fly.io, a VPS — public HTTPS URL.",
                GH,
              ],
            ].map(([t, d, href]) => (
              <div key={t} className="bg-[rgb(11_11_14)] p-6">
                <h3 className="text-lg font-semibold">{t}</h3>
                <p className="mt-1.5 text-sm text-muted">
                  {d}
                  <a href={href} {...ext}>
                    Guide ↗
                  </a>
                </p>
              </div>
            ))}
          </div>

          <H id="commands">Commands</H>
          <div className="overflow-hidden rounded-xl border border-white/[0.08]">
            {COMMANDS.map(([t, d], i) => (
              <div
                key={t}
                className={`grid grid-cols-1 gap-1 px-5 py-3.5 sm:grid-cols-[280px_1fr] ${i ? "border-t border-white/[0.08]" : ""}`}
              >
                <code className="text-white/85">{t}</code>
                <span className="text-sm text-muted">{d}</span>
              </div>
            ))}
          </div>

          <H id="install">Two ways to install</H>
          <div className="grid gap-px overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.06] md:grid-cols-2">
            <div className="bg-[rgb(11_11_14)] p-6">
              <h3 className="text-lg font-semibold">⚡ GitHub Action</h3>
              <p className="mt-1.5 text-sm text-muted">
                One workflow file + your key as a secret. No server, runs in
                your CI.{" "}
                <a href={`${GH}/deploy/GITHUB_ACTIONS.md`} {...ext}>
                  Setup ↗
                </a>
              </p>
            </div>
            <div className="bg-[rgb(11_11_14)] p-6">
              <h3 className="text-lg font-semibold">🤖 Hosted App</h3>
              <p className="mt-1.5 text-sm text-muted">
                Install org-wide with one click; you host the server.{" "}
                <a href={`${GH}/deploy/DEPLOY.md`} {...ext}>
                  Setup ↗
                </a>
              </p>
            </div>
          </div>

          <H id="faq">FAQ</H>
          {[
            [
              "Does it burn tokens 24/7?",
              "No. The server idles for free; the model only runs on a real event. Iterations are capped, and the CI auto-fix loop stops after 2 attempts — an unbounded self-correcting loop is exactly how an agent quietly spends a fortune overnight.",
            ],
            [
              "Does it auto-approve or merge PRs?",
              "Never. It only comments or requests changes, and it has no merge permission. The review check run always completes as neutral, so it cannot block a merge through branch protection either. Approval is always a human decision.",
            ],
            [
              "Where does my code go?",
              "Only to the LLM provider you configured — you hold that contract, not us. Repositories are cloned into ephemeral temp directories and deleted after each run; nothing persists between runs. With Ollama nothing leaves the machine at all.",
            ],
            [
              "What does a typical run cost?",
              "A PR review is usually a few cents. Every comment Forge writes carries a footer with the exact tokens used, how many were served from cache, and the estimated spend — so the month-end bill is never a surprise. Prompt caching typically cuts the input side by most of its value on longer runs.",
            ],
            [
              "How does it avoid reviewing my whole codebase?",
              "A review is scoped to the current change. The agent may read any file to judge whether an issue is real, but a finding about a file the PR never touched is discarded before it is posted — enforced in code, not just asked for in the prompt.",
            ],
            [
              "Can I control what it flags?",
              "Yes. Commit a REVIEW.md and it is injected as the highest-priority instruction block, overriding the defaults: redefine what counts as blocking, cap the nits, skip generated files, add repo-specific checks. CLAUDE.md sets broader project context used by every flow.",
            ],
            [
              "Can it change code without me noticing?",
              "No. Every change arrives as a pull request on its own branch. The only exception is a follow-up commit to a PR branch, which you asked for by name with an @mention. It never pushes to your default branch.",
            ],
            [
              "What if my provider has an outage?",
              "Set FORGE_FALLBACK_PROVIDERS to a comma-separated chain. Transient failures are retried with backoff; a hard failure moves to the next provider for that call only, so a brief outage never pins the whole run to a weaker model.",
            ],
            [
              "Does it work with self-hosted GitHub?",
              "Yes. Set GHES_HOSTNAME and everything else is identical — only the API base URL and the clone host differ between github.com and Enterprise Server.",
            ],
            [
              "Which model should I use?",
              "Anthropic models support prompt caching and extended thinking, which makes them the cheapest choice for long agent runs despite a higher list price. For review-only workflows a smaller model with a tight allowed-tools list is often enough. Run forge doctor to see what you already have configured.",
            ],
            [
              "Can I stop it reviewing certain PRs?",
              "Use filters in .github/agent.yml — by author, branch, label, or draft state. A common setup is to skip drafts and anything labelled skip-review, and to only review PRs targeting main.",
            ],
            [
              "Is my API key safe in the workflow?",
              "Keys live in GitHub Secrets and are never written to logs — every log path runs through a redactor that strips GitHub tokens, provider keys, PEM blocks, and tokens embedded in clone URLs. forge doctor prints variable names only, never values.",
            ],
          ].map(([q, a]) => (
            <details key={q} className="row-line py-1">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-4 font-semibold marker:hidden">
                {q}
                <span className="shrink-0 text-2xl font-light text-muted">
                  +
                </span>
              </summary>
              <p className="pb-4 leading-relaxed text-muted">{a}</p>
            </details>
          ))}
        </main>
      </div>
      <Footer />
    </>
  );
}
