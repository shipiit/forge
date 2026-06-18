# ShipIT Forge 🔨

> An autonomous GitHub coding agent — like a teammate that fixes issues, opens PRs, and reviews
> pull requests (including a GitHub Advanced Security–style security review). Multi-provider:
> **Vertex AI Gemini, AWS Bedrock, OpenAI, or Anthropic**. Reads screenshots in issues/PRs (vision).

ShipIT Forge installs into your organization as a GitHub App. When an issue is opened it
investigates the repository like a developer, makes a fix on a branch, runs the tests, and opens a
pull request. When a PR is opened — or Forge is invited as a reviewer — it posts inline review
comments with severity and suggested fixes.

## Status

Early, actively built. The **agent engine + local CLI** are working and tested today (no
credentials required, via a built-in fake provider). All four real provider adapters are
implemented. GitHub App / webhook wiring is the next slice.

| Capability | State |
|---|---|
| Agent loop (read/search/edit/bash/tests tools, sandboxed) | ✅ working, tested |
| Multi-provider (Anthropic, Vertex Gemini, OpenAI, Bedrock) | ✅ adapters + tests |
| Vision (images in issues/PRs, `read_image`) | ✅ in engine |
| Local CLI `forge fix` | ✅ working |
| GitHub App: issue→PR, PR review, @mentions | ✅ implemented |
| Security-review lens (severity + suggested fix) | ✅ implemented |
| Advanced tools (multi_edit, glob, git_history) | ✅ implemented |

## Quick start (no credentials)

```bash
npm install
npm test                 # 40 tests
npm run build

# Run the agent against a local repo using the credential-free demo provider:
node dist/cli.js fix --repo /path/to/repo --task "fix the failing login test" --provider fake
```

## Use a real model

Set the provider and its credentials, then drop `--provider fake`:

```bash
# Vertex AI Gemini (recommended)
export LLM_PROVIDER=vertex
export VERTEX_PROJECT=my-gcp-project
export VERTEX_LOCATION=us-central1
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
node dist/cli.js fix --repo /path/to/repo --task "..." --provider vertex
```

See [`.env.example`](./.env.example) for every provider's variables (Anthropic, OpenAI, Bedrock).

## Deploy as a GitHub App (use it on any issue/PR in your org)

Forge runs as a small always-on webhook server. You deploy it once, register it as a GitHub App,
and install that App on your org — then it works on every repo automatically.

### 1. Deploy the server

```bash
docker build -t shipit-forge .
docker run -p 3000:3000 --env-file .env shipit-forge
# or any host: Cloud Run, Fly.io, Render, Railway, a VM. It just needs a public HTTPS URL.
```

### 2. Register the GitHub App (one click)

With the server running, open its public URL in a browser. Probot serves a registration page that
uses [`app.yml`](./app.yml) to create the App with the right permissions and events. Follow the
flow; GitHub writes `APP_ID`, `PRIVATE_KEY`, and `WEBHOOK_SECRET` back for you. Put those (plus your
LLM provider vars from [`.env.example`](./.env.example)) into the server's environment and restart.

### 3. Install it on your organization

On the App's page → **Install App** → choose your org → **All repositories** (or pick some).
That's the "invite to the whole organization" step — from now on Forge sees issues and PRs in those
repos automatically.

### 4. Use it

| You do | Forge does |
|---|---|
| Add the label **`agent-fix`** to an issue (or comment **`/fix`**) | Investigates, fixes on a branch, runs tests, opens a PR that closes the issue |
| Open a PR | Auto-reviews it (quality + security), posts inline comments with severity + suggested fixes |
| **Request `@shipit-forge` as a reviewer** on any PR | Reviews it on demand — this is the "invite on any PR" flow |
| Comment **`/review`** or **`/security`** on a PR | Full review, or security-only review |
| Comment **`@shipit-forge <question>`** anywhere | Answers in context using the repo |

### Automation knobs (env vars)

| Var | Default | Effect |
|---|---|---|
| `FORGE_AUTO_FIX` | `label` | `label` = fix on `agent-fix` label · `opened` = fix **every** new issue automatically · `off` |
| `FORGE_AUTO_REVIEW` | `always` | `always` = review every PR · `requested` = only when invited/`/review` · `off` |
| `FORGE_TRIGGER_LABEL` | `agent-fix` | The label that triggers a fix |
| `LLM_PROVIDER` | `anthropic` | `vertex` · `bedrock` · `openai` · `anthropic` |

Set `FORGE_AUTO_FIX=opened` if you want Forge to attempt a PR on **every** issue the moment it's
created — the fully-automatic mode.

## How it works

```
issue/PR event → agent loop (LLM + tools over a cloned repo) → verify (tests) → PR / review
```

- **Provider abstraction** (`src/providers`) normalizes chat + tool-calling + images so the loop is
  provider-agnostic. Adapters: `anthropic.ts`, `vertex.ts`, `openai.ts`, `bedrock.ts`.
- **Tools** (`src/agent/tools`) — `read_file`, `write_file`, `edit_file`, `multi_edit` (atomic
  multi-replace), `list_dir`, `glob`, `read_image`, `search`, `git_history` (log/blame),
  `run_bash` (sandboxed: allow/deny, timeout, no network), `run_tests` (auto-detected).
- **GitHub layer** (`src/github`) — vision image extraction, workspace clone/branch/commit/push,
  PR composer, security-aware review composer; wired to webhooks via Probot (`src/app.ts`).
- **Agent loop** (`src/agent/loop.ts`) drives chat → tool calls → results → repeat, with iteration
  and token limits.

## License

MIT © Rahul Raj
