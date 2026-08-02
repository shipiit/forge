import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Wrench, Search, ShieldAlert, ScanSearch, RefreshCw, MessageSquare,
  History, CalendarClock, Blocks, Building2, Server, Gauge, Cpu,
} from 'lucide-react';
import { Header, Footer } from '../components/Layout';
import { ScrollProgress } from '../components/ScrollProgress';
import { Code } from '../components/Code';
import { Tabs } from '../components/Tabs';
import { ProviderTabs } from '../components/ProviderTabs';
import { Section, Triggers, Cards, Walkthrough, CommentPreview, DiffPair, rise } from '../components/GuideBits';

const TOC: [string, string][] = [
  ['providers', 'Providers'],
  ['fix', 'Fix an issue'],
  ['review', 'Review a PR'],
  ['security', 'Security'],
  ['audit', 'Whole-repo audit'],
  ['history', 'Change history'],
  ['routines', 'Routines'],
  ['ci', 'Auto-fix CI'],
  ['mentions', '@mentions'],
  ['skills', 'Skills'],
  ['org', 'Whole-org setup'],
  ['ghes', 'Enterprise Server'],
  ['cost', 'Cost control'],
];

const BASE_WORKFLOW = `# .github/workflows/forge.yml
name: ShipIT Forge
on:
  issues: { types: [opened, labeled] }
  issue_comment: { types: [created] }
  pull_request: { types: [opened, synchronize, closed] }
  pull_request_review_comment: { types: [created] }

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
          provider: anthropic
          anthropic-api-key: \${{ secrets.ANTHROPIC_API_KEY }}`;

export function GitHubGuide() {
  return (
    <>
      <ScrollProgress />
      <Header />

      <div className="mx-auto grid max-w-[1500px] grid-cols-1 gap-14 px-7 pt-14 lg:grid-cols-[200px_minmax(0,1fr)]">
        <aside className="sticky top-24 hidden self-start border-l border-white/[0.08] pl-4 lg:block">
          {TOC.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="block py-1.5 text-sm text-muted transition-colors hover:text-text">
              {label}
            </a>
          ))}
        </aside>

        <main className="min-w-0 space-y-16 pb-20">
          <motion.div {...rise}>
            <span className="eyebrow">Using Forge on GitHub</span>
            <h1 className="display mt-6 text-[clamp(40px,6vw,68px)]">
              Every trigger,<br /><span className="dim">explained.</span>
            </h1>
            <p className="mt-6 max-w-3xl text-[15px] leading-relaxed text-muted">
              Forge reacts to real GitHub activity. Below is exactly what starts each capability, what it produces,
              and how to configure it — with a worked example for every one. This single workflow file enables all
              of it.
            </p>
            <Code label=".github/workflows/forge.yml" code={BASE_WORKFLOW} lang="yaml" />
          </motion.div>

          <Section
            id="providers" Icon={Cpu} eyebrow="Bring your own model"
            title="Nine providers, one contract"
            lead="Pick a provider and paste one key. The agent behaves identically behind all of them — the adapters normalize messages, tools, images, and token accounting so nothing else in the system knows which model is answering."
          >
            <ProviderTabs />
          </Section>

          <Section
            id="fix" Icon={Wrench} eyebrow="Issues"
            title="Turn an issue into a merged PR"
            lead="Forge investigates the repository, finds the root cause, edits the code, adds a regression test, runs your suite, and opens a pull request that closes the issue. It never pushes to your default branch."
          >
            <Triggers rows={[
              ['label: agent-fix', 'Posts a root-cause analysis comment — no code change yet.'],
              ['/fix', 'Implements the fix, adds tests, runs them, opens a PR.'],
              ['@shipit-forge fix this', 'Same as /fix, from natural language in a comment.'],
            ]} />
            <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_400px]">
              <Walkthrough steps={[
                ['Investigate', 'Reads the issue, its comments, and any screenshots, then searches the codebase to confirm the cause before changing anything.'],
                ['Edit and test', 'Makes the smallest change that fixes the cause, then adds a test that fails without it.'],
                ['Verify independently', 'Forge re-runs your suite itself and reports the real exit code — it does not take the model’s word for it.'],
                ['Self-review, then open the PR', 'A second read-only pass critiques the diff. A high-severity finding or a failing test opens the PR as a draft.'],
              ]} />
              <CommentPreview verdict="fix ready" tone="good">
                <div className="font-semibold">🔧 Fix ready in #128</div>
                <p className="text-muted">
                  <span className="text-text">Root cause:</span> <code className="text-[rgb(var(--syn-fn))]">add()</code>{' '}
                  subtracted instead of adding.
                </p>
                <DiffPair before="return a - b;" after="return a + b;" />
                <p className="text-muted">✅ Project tests pass after the change. Added a regression test.</p>
                <div className="text-[11px] text-muted">🧮 12,480 in + 1,902 out · 9,600 cached (saved ~$0.03)</div>
              </CommentPreview>
            </div>
          </Section>

          <Section
            id="review" Icon={Search} eyebrow="Pull requests"
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
                    <Triggers rows={[
                      ['pull_request opened / synchronize', 'Automatic review, per your review_behavior setting.'],
                      ['/review', 'One review now, without subscribing to future pushes.'],
                      ['/review always', 'Reviews now and on every later push — stored as a PR label.'],
                      ['review_requested', 'Reviews when Forge is added as a reviewer — drafts included.'],
                    ]} />
                  ),
                },
                {
                  id: 'config',
                  label: 'Configure',
                  hint: 'Per-repository settings live in .github/agent.yml.',
                  content: (
                    <Code label=".github/agent.yml" lang="yaml" code={`auto_review: always
review_behavior: every_push   # opened | every_push | manual
max_nits: 5                   # cap minor comments; -1 disables
trigger_phrase: "@our-bot"

filters:                      # only review what matters
  - { field: base_branch, operator: equals, value: main }
  - { field: is_draft,    operator: equals, value: false }
  - { field: labels, operator: is_not_one_of, value: [skip-review] }`} />
                  ),
                },
                {
                  id: 'severity',
                  label: 'Severity',
                  hint: 'Only Important findings can request changes.',
                  content: (
                    <Cards items={[
                      { t: '🔴 Important', d: 'A bug that should be fixed before merging. Only these request changes.' },
                      { t: '🟡 Nit', d: 'Minor and worth fixing, never blocking. Capped so a review stays actionable.' },
                      { t: '🟣 Pre-existing', d: 'A bug the PR did not introduce. Reported for awareness — never blocks the author.' },
                    ]} />
                  ),
                },
                {
                  id: 'gate',
                  label: 'Gate your CI',
                  hint: 'The check run always completes as neutral, so it can never block a merge. Read its footer if you want your own gate.',
                  content: (
                    <Code label="bash" lang="bash" code={`gh api repos/$OWNER/$REPO/check-runs/$ID \\
  --jq '.output.text | split("forge-severity: ")[1] | split(" -->")[0] | fromjson'

# → {"blocking":2,"nit":1,"pre_existing":0}
# Fail your job when .blocking > 0 — on your terms, not ours.`} />
                  ),
                },
              ]}
            />
          </Section>

          <Section
            id="security" Icon={ShieldAlert} eyebrow="Security"
            title="A security lens on every diff"
            lead="Alongside the quality review, Forge hunts for exploitable vulnerabilities: injection, SSRF, broken authorization, hardcoded secrets, unsafe deserialization, path traversal, weak crypto. Each finding carries a CWE, a severity, and a suggested fix."
          >
            <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
              <div>
                <Triggers rows={[
                  ['/security', 'Security-only review of the current PR.'],
                  ['automatic', 'Runs as part of every standard review.'],
                  ['Dependabot + SARIF', 'Live CVEs and CodeQL/Semgrep output merged into the same report.'],
                ]} />
                <p className="mt-6 text-sm leading-relaxed text-muted">
                  A second, deterministic layer runs on <span className="text-text">every edit the agent makes</span> —
                  a pattern scan with no model call and no token cost. Add your own rules:
                </p>
                <Code label=".claude/security-patterns.json" lang="json" code={`{
  "patterns": [
    {
      "rule_name": "tenant_unfiltered_query",
      "regex": "\\\\.objects\\\\.all\\\\(\\\\)",
      "paths": ["**/src/tenants/**"],
      "reminder": "Multi-tenant code must filter by org_id."
    }
  ]
}`} />
              </div>
              <CommentPreview verdict="requested changes" tone="danger">
                <div className="flex items-center gap-2 rounded-lg border border-rose-400/20 bg-rose-400/5 px-3 py-2">
                  <ShieldAlert size={15} className="text-rose-300" />
                  <span>🔴 Critical · CWE-918 SSRF · <code className="text-white/70">fetcher.js:8</code></span>
                </div>
                <DiffPair
                  before="request(target, (r) => r.pipe(res))"
                  after="request(validateUrl(target), (r) => r.pipe(res))"
                />
                <p className="text-muted">The URL was fully attacker-controlled — an internal metadata endpoint is reachable. Suggested an allowlist validator plus a regression test.</p>
              </CommentPreview>
            </div>
          </Section>

          <Section
            id="audit" Icon={ScanSearch} eyebrow="Whole repository"
            title="Audit the entire codebase"
            lead="Not a diff review. Forge maps your entry points — HTTP routes, CLI, webhooks, queue consumers — follows untrusted input to dangerous sinks, and posts one grouped report sorted by severity."
          >
            <Triggers rows={[['/audit', 'Full-repository security audit, posted as a single grouped comment.']]} />
            <div className="mt-6 max-w-2xl">
              <CommentPreview verdict="8 findings" tone="danger">
                <div className="font-semibold">🛡️ Security audit</div>
                <p className="text-muted">Found <span className="text-text">8</span> issues. 🔴 Critical: 1 · 🟠 High: 2 · 🟡 Medium: 5</p>
                <p className="text-muted">Includes live Dependabot alerts — CVE-2021-23337 in lodash, fixed in 4.17.21.</p>
              </CommentPreview>
            </div>
          </Section>

          <Section
            id="history" Icon={History} eyebrow="Documentation"
            title="A documented history of every change"
            lead="When a PR merges or a commit lands on your default branch, Forge writes one entry describing what changed and why — from that change's diff alone, never a summary of the whole repository. The entry arrives as a pull request you approve."
          >
            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <Code label=".github/agent.yml" lang="yaml" code={`history: true
history_path: docs/CHANGE-HISTORY.md`} />
                <div className="mt-4">
                  <Cards cols={2} items={[
                    { t: 'Scoped to one change', d: 'The agent gets that diff and is told to describe only it — entries stay specific and stay true.' },
                    { t: 'Never a direct push', d: 'Opens as a PR on a forge/history-* branch. Your default branch stays protected.' },
                    { t: 'Risk and impact', d: 'Records the areas touched, a risk level, and any behaviour a consumer would notice.' },
                    { t: 'Idempotent', d: 'A redelivered webhook is a no-op — an already-recorded change is detected and skipped.' },
                  ]} />
                </div>
              </div>
              <Code label="docs/CHANGE-HISTORY.md" lang="markdown" code={`# Change history

## 2026-08-02 — Add response caching (#128)

**Author:** octocat · **Risk:** 🟡 medium · **Areas:** \`src/cache\`

Responses from the pricing endpoint are now cached for 60s,
cutting p99 latency roughly in half under load. The cache is
keyed on tenant, so no cross-tenant reads are possible.

**Notable behaviour changes**
- Default TTL is 60s; set CACHE_TTL=0 to disable.
- Stale reads are possible for up to one TTL after a write.

## 2026-08-01 — Fix add() sign error (#127)

**Author:** dependabot · **Risk:** 🟢 low · **Areas:** \`src/math\``} />
            </div>
          </Section>

          <Section
            id="routines" Icon={CalendarClock} eyebrow="Automation"
            title="Routines: scheduled, on-demand, or event-driven"
            lead="A routine is a saved configuration — a skill, extra instructions, a tool allowlist — plus the triggers that start it. One routine can carry all three trigger types at once."
          >
            <div className="grid gap-6 lg:grid-cols-2">
              <Code label=".github/agent.yml" lang="yaml" code={`routines:
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
    write: true                # may edit files — ships as a PR`} />
              <div>
                <Triggers rows={[
                  ['schedule: "0 9 * * *"', 'Runs on a cron via your own workflow — no external scheduler to trust.'],
                  ['/run nightly-digest', 'Starts it on demand from any issue or PR thread.'],
                  ['events: [pull_request.closed]', 'Runs on repository events, narrowed by filters.'],
                  ['write: true', 'Lets it change files. The result always arrives as a pull request.'],
                ]} />
                <p className="mt-5 text-sm leading-relaxed text-muted">
                  Scheduling runs on GitHub's own scheduler inside your CI, on your credentials — there is no
                  Forge-operated service holding a token for your repository.
                </p>
                <Code label=".github/workflows/forge-routines.yml" lang="yaml" code={`on:
  schedule: [{ cron: '0 9 * * *' }]
  workflow_dispatch:            # "Run workflow" button

jobs:
  routines:
    runs-on: ubuntu-latest
    steps:
      - uses: shipiit/forge@v1
        with:
          skill: commit-summary
          anthropic-api-key: \${{ secrets.ANTHROPIC_API_KEY }}`} />
              </div>
            </div>
          </Section>

          <Section
            id="ci" Icon={RefreshCw} eyebrow="Continuous integration"
            title="Fix its own red builds"
            lead="When CI fails on a branch Forge opened, it reads the failing checks and logs, corrects the code, re-runs the suite, and pushes a ci-fix commit."
          >
            <Triggers rows={[
              ['check_suite / workflow_run failed', 'Only on forge/* branches, and only twice — then it stops for a human.'],
            ]} />
            <p className="mt-6 max-w-3xl text-sm leading-relaxed text-muted">
              The two-attempt bound is deliberate: an unbounded self-correcting loop is exactly how an agent
              quietly spends a fortune overnight. It also only ever touches branches it opened itself, so it can
              never rewrite someone else's work.
            </p>
          </Section>

          <Section
            id="mentions" Icon={MessageSquare} eyebrow="Conversation"
            title="Ask it anything, anywhere"
            lead="Mention Forge in any issue, pull request, or inline review thread. On an issue it explains and diagnoses; on a pull request it can push a follow-up commit to that branch."
          >
            <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
              <div>
                <Triggers rows={[
                  ['@shipit-forge why does this fail?', 'Reads the code and answers, grounded in the actual repository.'],
                  ['@shipit-forge fix this', 'On a PR: applies the change, runs tests, pushes to the PR branch.'],
                  ['/code-review · /triage · /document', 'Runs a named skill instead of a free-form answer.'],
                  ['/run <routine>', 'Starts a saved routine on demand.'],
                ]} />
                <p className="mt-6 text-sm leading-relaxed text-muted">
                  The handle is per-repository — set{' '}
                  <code className="text-[rgb(var(--syn-keyword))]">trigger_phrase: "@our-bot"</code> in{' '}
                  <code className="text-white/80">.github/agent.yml</code> to use your own bot name.
                </p>
              </div>
              <CommentPreview verdict="follow-up commit" tone="good">
                <p className="text-muted"><span className="text-text">@you</span> — @shipit-forge fix the SSRF finding</p>
                <div className="row-line pt-3 font-semibold">🔧 Pushed a follow-up commit to <code className="text-[rgb(var(--syn-fn))]">feat/proxy</code></div>
                <p className="text-muted">Added an allowlist validator, wired it into the proxy handler, and added a test that asserts internal addresses are rejected. Suite is green.</p>
              </CommentPreview>
            </div>
          </Section>

          <Section
            id="skills" Icon={Blocks} eyebrow="Skills"
            title="Named prompt packs your team controls"
            lead="A skill bundles instructions with a tool allowlist, so a request behaves the same way every time. Forge ships seven; your repository can override any of them, or add its own."
          >
            <div className="grid gap-px overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.06] sm:grid-cols-2 lg:grid-cols-4">
              {[
                ['/code-review', 'Correctness, regressions, security — scoped to the change.'],
                ['/fix-issue', 'Investigate, fix, add tests, verify.'],
                ['/pr-description', 'A reviewer-focused description from the diff.'],
                ['/commit-summary', 'Summarize one commit for the change history.'],
                ['/document', 'Write or update docs for code that changed.'],
                ['/security-audit', 'Source-to-sink vulnerability hunt with CWEs.'],
                ['/triage', 'Diagnose without touching any code.'],
                ['+ your own', 'Commit a file, or define one inline in the workflow.'],
              ].map(([name, d]) => (
                <div key={name} className="bg-[rgb(11_11_14)] p-6">
                  <code className="text-[13px] font-semibold text-[rgb(var(--syn-keyword))]">{name}</code>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{d}</p>
                </div>
              ))}
            </div>

            <h3 className="mt-10 text-lg font-semibold">Add your own — three ways</h3>
            <p className="mb-4 mt-2 max-w-3xl text-sm leading-relaxed text-muted">
              Most specific wins: a skill defined in the workflow beats a committed file, which beats the built-in.
              A read-only skill's tool allowlist is <span className="text-text">enforced</span> — the write tools are
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
                    <Code label=".forge/skills/house-review.md" lang="markdown" code={`---
name: house-review
description: Our review standards
tools: read_file, search, glob
---
Reserve Important for anything that would break behaviour, leak
data, or block a rollback. Style and naming are Nit at most.

Always check that new API routes have an integration test.
Never report anything CI already enforces (lint, formatting, types).`} />
                  ),
                },
                {
                  id: 'inline',
                  label: 'Define in the workflow',
                  hint: 'No committed file needed — useful for org-wide standards pushed from a template.',
                  content: (
                    <Code label=".github/workflows/forge.yml" lang="yaml" code={`- uses: shipiit/forge@v1
  with:
    anthropic-api-key: \${{ secrets.ANTHROPIC_API_KEY }}
    skill-name: house-review
    skill-tools: read_file search glob
    skill-prompt: |
      Reserve Important for anything that would break behaviour.
      Always check that new API routes have an integration test.`} />
                  ),
                },
                {
                  id: 'select',
                  label: 'Select a built-in',
                  hint: 'Run one specific skill for this workflow, and nothing else.',
                  content: (
                    <Code label=".github/workflows/forge.yml" lang="yaml" code={`- uses: shipiit/forge@v1
  with:
    skill: code-review
    allowed-tools: read_file search glob   # fewer tools, fewer tokens
    max-turns: "12"
    anthropic-api-key: \${{ secrets.ANTHROPIC_API_KEY }}`} />
                  ),
                },
                {
                  id: 'cli',
                  label: 'Run locally',
                  hint: 'The same skills work from the CLI, against any checkout.',
                  content: (
                    <Code label="bash" lang="bash" code={`forge skills                     # list what is available
forge run --repo . --skill code-review --task "check the auth path"
forge run --repo . --skill document --write`} />
                  ),
                },
              ]}
            />
          </Section>

          <Section
            id="org" Icon={Building2} eyebrow="For organizations"
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
                      <Walkthrough steps={[
                        ['Create the App', 'Contents, Issues, Pull requests, and Checks — all read & write.'],
                        ['Install org-wide', 'Choose "All repositories" so new repos are covered automatically.'],
                        ['Deploy the server', 'Render, Cloud Run, or any Docker host with a public HTTPS URL.'],
                        ['Set org defaults', 'Environment variables become the default for every repository.'],
                      ]} />
                      <Code label="org-wide defaults — environment" lang="bash" code={`FORGE_AUTO_REVIEW=always
FORGE_REVIEW_BEHAVIOR=every_push
FORGE_MAX_NITS=5
FORGE_HISTORY=1
FORGE_MAX_OUTPUT_TOKENS=16384
FORGE_FALLBACK_PROVIDERS=bedrock,openai
FORGE_DISPLAY_HANDLE=@our-bot

# Each repo can still override any of these
# in its own .github/agent.yml`} />
                    </div>
                  ),
                },
                {
                  id: 'action',
                  label: 'GitHub Action — per repo',
                  hint: 'No server at all. Put the key in an organization secret and the same file drops into every repo unchanged.',
                  content: (
                    <div className="grid gap-6 lg:grid-cols-2">
                      <Code label="Settings → Secrets → Organization secrets" lang="bash" code={`# One secret, available to every repository:
ANTHROPIC_API_KEY

# Then ship the same workflow from your .github
# template repository, or commit it per repo.`} />
                      <Code label=".github/workflows/forge.yml" lang="yaml" code={`name: ShipIT Forge
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
          anthropic-api-key: \${{ secrets.ANTHROPIC_API_KEY }}`} />
                    </div>
                  ),
                },
                {
                  id: 'standards',
                  label: 'Enforce standards',
                  hint: 'Two files let a repository shape how the agent behaves in it.',
                  content: (
                    <div className="grid gap-6 lg:grid-cols-2">
                      <Code label="CLAUDE.md — project context" lang="markdown" code={`# Engineering standards

- Every database query is scoped to the caller's tenant.
- Never log email addresses, user ids, or request bodies.
- New API routes require an integration test.

Used by every flow. A change that newly violates one of
these is reported as a **nit** — worth fixing, not blocking.`} />
                      <Code label="REVIEW.md — review only, highest priority" lang="markdown" code={`# Review instructions

## What Important means here
Reserve Important for findings that would break behaviour,
leak data, or block a rollback. Style is Nit at most.

## Do not report
- Anything CI already enforces: lint, formatting, types
- Generated files under src/gen/ and any *.lock file

## Cap the nits
Report at most five. Summarize the rest as a count.`} />
                    </div>
                  ),
                },
              ]}
            />
          </Section>

          <Section
            id="ghes" Icon={Server} eyebrow="Self-hosted"
            title="GitHub Enterprise Server"
            lead="Everything works against a self-managed GitHub instance. Only two things differ — the API base URL and the clone host — and both are resolved from the environment, so no other configuration changes."
          >
            <Code label="environment" lang="bash" code={`GHES_HOSTNAME=github.example.com

# On GHES Actions runners this is set for you, and takes precedence:
GITHUB_API_URL=https://github.example.com/api/v3`} />
          </Section>

          <Section
            id="cost" Icon={Gauge} eyebrow="Economics"
            title="What a run actually costs"
            lead="Forge reports its own spend on every comment and pull request it writes, and works hard to keep that number small."
          >
            <Cards items={[
              { t: 'Prompt caching', d: 'The system prompt, every tool schema, and the growing transcript are cached — repeated context bills at roughly a tenth of the input rate.' },
              { t: 'Only the tools it needs', d: 'Unused tool schemas are resent on every single turn. An allowlist removes them from the bill entirely.' },
              { t: 'Context compaction', d: 'Stale tool output is elided once a transcript grows large — tuned not to invalidate the cache on every turn.' },
              { t: 'Scoped reviews', d: 'Reviewing only the changed files costs a fraction of reading a whole repository.' },
              { t: 'Bounded loops', d: 'Iterations are capped and CI auto-fix stops after two attempts. Nothing runs away overnight.' },
              { t: 'Your own key', d: 'You bring the provider credentials and pay list price. No markup, because there is no middleman.' },
            ]} />
            <div className="mt-6 max-w-2xl">
              <Code label="the footer on every comment Forge writes" lang="text" code={`🧮 128,400 in + 6,210 out tokens · 96,000 cached (saved ~$0.29) · ~$0.41 · model claude-sonnet-4-5`} />
            </div>
            <Code label="tune it per workflow" lang="yaml" code={`- uses: shipiit/forge@v1
  with:
    allowed-tools: read_file search glob   # smallest useful toolset
    max-turns: "10"                        # bound the loop
    max-output-tokens: "8192"              # smaller budget per turn
    max-nits: "3"                          # shorter reviews
    prompt-cache: "1"                      # on by default
    anthropic-api-key: \${{ secrets.ANTHROPIC_API_KEY }}`} />
          </Section>

          <motion.div {...rise} className="flex flex-wrap gap-4 border-t border-white/[0.07] pt-12">
            <Link to="/docs" className="btn btn-white !rounded-none !uppercase !tracking-[0.14em]">Read the docs</Link>
            <Link to="/examples" className="btn btn-line !rounded-none !uppercase !tracking-[0.14em]">See real examples</Link>
          </motion.div>
        </main>
      </div>

      <Footer />
    </>
  );
}
