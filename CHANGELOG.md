# Changelog

## Unreleased

### Security
- **Only collaborators with write access can start a run from a comment, `@mention` or issue.** Everyone
  else is ignored before any model call. Community-opened issues are no longer analysed automatically, and
  triage-only users can no longer start `agent-fix` by label.
- **Fork pull requests are read by number** (`refs/pull/N/head`), never by a same-named branch of the base
  repository. Forge never pushes a follow-up or a CI fix to a fork.
- **`REVIEW.md`, `FORGE.md`, `AGENTS.md`, security guidance and skills come from the base branch**, so a pull
  request cannot rewrite the rules it is reviewed by.
- **`/secrets` on a pull request scans the pull request's code.** It used to scan the default branch and
  post a passing check on the pull request's head.

### Review
- **Every finding is verified** by a second agent that re-reads the code before it is posted.
  `review_depth` (previously accepted and ignored) now means: `light` one pass, `standard` (default) find
  then verify, `deep` three focused reviewers then verify. Standard reviews cost more than before; set
  `review_depth: light` for the old behaviour. The run's spend cap is shared across the passes.
- Dependabot alerts on a review are limited to manifests the pull request touches, and never block it.

### Scanning
- **New dependency scanner** (`dep_scan`, on by default): changed lockfiles are checked against OSV.dev for
  known CVEs and malicious releases, plus new install scripts, off-registry sources and missing integrity
  hashes. It sends package names and versions to `api.osv.dev`.

### Audit
- **`/audit` is a specialist team**: up to eight static slices (adapted from shipiit/pentest-skills) run in
  parallel within the run's spend cap, then one verifier with known false-positive shapes. Slices with
  nothing to look at (no frontend, no model SDK) are skipped. The report adds a coverage map.
- **Third-party scanners** (`external_scanners`, on by default): semgrep, gitleaks, trivy, osv-scanner, bandit
  and checkov run when installed — and the Action image now bundles them, pinned and checksum-verified. They
  run with no GitHub token or model key in their environment. Pull-request reviews do not run them.
- **`audit_skills: owner/repo@<sha>`** replaces the built-in slices with a repository's own, pinned to a commit.

### Evals
- `forge eval --model-review --cases evals/review-cases` scores the model review against planted bugs and
  their safe look-alikes.

## 2.0.0

The agent grows past reviewing pull requests: it now runs on a schedule, documents
every change it sees, and does all of it behind nine providers with prompt caching
on by default. The GitHub Action reached parity with the hosted App, the docs
became one searchable guide, and there is a generator that writes your workflow
file for you.

**Tests: 115 → 401.**

### ⚠️ Breaking

- **`CLAUDE.md` is no longer read.** Project context comes from `FORGE.md`,
  `.github/FORGE.md`, or `AGENTS.md`. Rename the file to keep your conventions
  applied. `REVIEW.md` is unchanged.
- **Skills and security patterns moved to `.forge/`.** `.claude/skills/` and
  `.claude/security-patterns.json` are no longer read; use `.forge/skills/` and
  `.forge/security-patterns.json`.
- **The output-token budget is 16384 everywhere**, up from a per-flow 4096–8192.
  Runs produce longer output and cost more per turn. Set `FORGE_MAX_OUTPUT_TOKENS`
  to restore the old ceiling. Budgets are clamped per model, so this cannot
  exceed what a model actually accepts.
- **Pin `@v2`.** `@v1` stays on 1.x and ignores every input added here.

### Models

- **Nine providers** — added Gemini (direct API key), Groq, Together, Ollama, and
  any OpenAI-compatible endpoint, alongside Anthropic, OpenAI, Vertex, and Bedrock.
- **Prompt caching**, on by default. The system prompt, every tool schema, and the
  growing transcript are cached — Anthropic `cache_control`, Bedrock `cachePoint` —
  so repeated context bills at roughly a tenth of the input rate. OpenAI and Gemini
  automatic caching is reported too.
- **Extended thinking** via `FORGE_THINKING_BUDGET` (Anthropic, Gemini), and
  `reasoning_effort` set automatically for OpenAI's o-series and gpt-5, including
  the `max_completion_tokens` switch those models require.
- **Fallback chain** — `FORGE_FALLBACK_PROVIDERS=bedrock,openai` keeps a run alive
  when the primary fails hard. Per call, not sticky.
- **Per-model output caps**, so a shared budget can never 400 on a model with a
  lower ceiling.
- **Fixed:** `ANTHROPIC_MODEL` was written by `forge setup` and never read.

### Token discipline

- **Context compaction** elides stale tool output once a transcript grows large,
  tuned not to invalidate the cached prefix on every turn.
- **Tool allowlists** strip unused schemas, which were being resent every turn.
- **`read_file` windows** large files instead of dumping them into all later turns.
- **Cost reporting** on every comment and pull request: tokens used, how many came
  from cache, and the estimated spend.

### Review

- **Scoped to the change.** A finding about a file the pull request never touched
  is discarded before it is posted — enforced in code, not just asked for.
- **`FORGE.md` and `REVIEW.md`.** Project context is followed everywhere and its
  new violations are nits; `REVIEW.md` is injected as the highest-priority block
  and overrides the default guidance.
- **Severity model** — pre-existing findings are reported but never block, and
  low-severity comments are capped with a "plus N similar items" line.
- **Check run** with a severity table, per-line annotations, and a machine-readable
  footer CI can parse. Always `neutral`, so it can never block a merge.

### New capabilities

- **Skills** — seven built-ins (`/code-review`, `/fix-issue`, `/pr-description`,
  `/commit-summary`, `/document`, `/security-audit`, `/triage`) with enforced tool
  allowlists. Override from `.forge/skills/`, or define one inline in the workflow.
- **Routines** — a saved skill plus its triggers: cron, `/run <name>`, or any
  repository event, each narrowed by filters. A scheduled run with no thread to
  reply in opens an issue with its findings.
- **Change history** — one documented entry per merged change, written from that
  change's diff alone. `history_mode: single` appends to one document;
  `per_commit` writes a file named after each change. Always a pull request.
- **Release notes** generated from the commits in a release.
- **Trigger filters** — author, title, body, base and head branch, labels, draft,
  merged, with six operators. `matches_regex` tests the whole field, not a
  substring.
- **Per-repo trigger phrase**, and `review always` subscribing a PR to
  push-triggered review via a label.
- **GitHub Enterprise Server** — set `GHES_HOSTNAME`.

### Security

- **Deterministic per-edit scan** on every write, with no model call and no token
  cost: dynamic execution, unsafe deserialization, DOM injection, hardcoded
  credentials, weak crypto, and workflow edits. Custom rules in
  `.forge/security-patterns.json`, with a ReDoS guard on the patterns themselves.

### The GitHub Action

- **Now at parity with the App.** It reads `.github/agent.yml` (it never did
  before, so routines, filters, and history settings were silently ignored there),
  and handles every route — `/audit`, change history, release notes, and `/run`
  used to be dropped.
- **Dynamic inputs:** `prompt`, `skill`, inline `skill-prompt`, `allowed-tools`,
  `disallowed-tools`, `max-turns`, `max-output-tokens`, `max-nits`,
  `trigger-phrase`, `prompt-cache`, `thinking-budget`, `fallback-providers`.

### CLI

- `forge doctor` — what is configured and what is missing, variable names only.
- `forge skills` — list built-in and repository skills.
- `forge run --skill <name>` — the building block for scheduled routines.

### Site

- One consolidated guide with command-palette search (⌘K) and scrollspy sidebars.
- A **workflow generator** that writes `forge.yml` and `agent.yml` from a form,
  with a live editable preview, per-provider requirements, and download.
- Syntax highlighting from the project's own tokens rather than a stock theme.

---

## 1.1.0 and earlier

See the git history.
