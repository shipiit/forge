<div align="center">

<img src="./assets/banner.svg" alt="ShipIT Forge" width="100%" />

<br/>

**An autonomous GitHub coding agent — like a teammate that fixes issues, opens PRs, and reviews pull requests (with a GitHub Advanced Security–style security pass).**

Multi-provider · Vision-aware · Self-hosted · Original open-source code.

<br/>

[![CI](https://github.com/shipiit/forge/actions/workflows/ci.yml/badge.svg)](https://github.com/shipiit/forge/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-22D3EE.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-339933.svg?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tests](https://img.shields.io/badge/tests-76%20passing-FF8A3D.svg)](#testing)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-7C5CFF.svg)](#contributing)

<br/>

**Providers:**
&nbsp;`Vertex AI Gemini`&nbsp;·&nbsp;`AWS Bedrock`&nbsp;·&nbsp;`OpenAI`&nbsp;·&nbsp;`Anthropic`

[Quick start](#-quick-start-no-credentials) · [Deploy](#-deploy-as-a-github-app) · [How it works](#-how-it-works) · [Config](#-configuration) · [Roadmap](#-roadmap)

</div>

---

## ✨ What it does

| | Capability | How you trigger it |
|---|---|---|
| 🛠️ | **Fix an issue → open a PR** — investigates the repo, writes the fix on a branch, runs the tests, opens a PR that closes the issue | Label `agent-fix`, or comment `/fix` |
| 🔍 | **Review a PR** — inline comments + summary verdict, quality **and** security lenses | Open a PR, or comment `/review` |
| 🛡️ | **Security review** — flags SSRF, injection, secrets, authz… with **severity** + a **suggested-fix** block | Auto on PRs, or comment `/security` |
| 👋 | **Invite as a reviewer** — request `@shipit-forge` on any PR and it reviews on demand | Add it as a PR reviewer |
| 💬 | **Answer @mentions** — explains code or proposes changes in context | Comment `@shipit-forge <ask>` |
| 🖼️ | **Reads screenshots** — pulls images out of issue/PR bodies and feeds them to vision models | Automatic |

---

## 🚀 Quick start (no credentials)

The agent engine runs locally with a built-in **fake provider** — no API keys needed.

```bash
git clone https://github.com/shipiit/forge.git && cd forge
npm install
npm test                 # 76 tests, all green
npm run build

# Run the agent against any local repo using the credential-free demo provider:
node dist/cli.js fix --repo /path/to/repo --task "fix the failing login test" --provider fake
```

### Configure a provider securely — `forge setup`

The easiest, safest way to add your credentials. It writes a **gitignored `.env` with `chmod 600`**
so secrets never get committed:

```bash
node dist/cli.js setup
```

```
🔧 ShipIT Forge — provider setup

Which provider?
  1) Vertex AI Gemini
  2) Anthropic
  3) OpenAI
  4) AWS Bedrock
> 1
GCP project id: <your-gcp-project-id>
Location [us-central1]:
Model [gemini-2.5-pro]:
Provide the service-account key. Either:
  • a path to the JSON file, or
  • paste the JSON, then a line with just END
path or paste> <paste your service-account JSON, or a file path>
✅ Wrote .env (chmod 600) and updated .gitignore. Your secrets are gitignored.
```

**Setting up Vertex AI credentials (step by step):**

1. In Google Cloud Console → **IAM & Admin → Service Accounts**, create a service account (or reuse one).
2. Give it the **Vertex AI User** role (`roles/aiplatform.user`).
3. **Keys → Add key → JSON** to download the key file. Keep it private — never commit it.
4. Run `forge setup`, choose **Vertex AI Gemini**, enter your project id, and either **paste the JSON**
   or give the **path** to the downloaded file.

When you paste, the JSON is validated and saved to `.forge/vertex-sa.json` (`chmod 600`, gitignored);
when you give a path, it's referenced in place. Either way nothing secret is ever committed.

### Or set env vars manually

```bash
export LLM_PROVIDER=vertex
export VERTEX_PROJECT=my-gcp-project
export VERTEX_LOCATION=us-central1
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
node dist/cli.js fix --repo /path/to/repo --task "…" --provider vertex
```

See [`.env.example`](./.env.example) for every provider's variables.

> **Verified live:** the agent has been run end-to-end against Vertex AI Gemini 2.5 Pro — it read a
> buggy file, fixed it, ran the tests, and confirmed they pass. ✅

---

## 🤖 Deploy as a GitHub App

> **Publishing the code ≠ running the agent.** GitHub stores your repo and the App *registration*,
> but the agent runs on **your** server. GitHub sends webhooks → your server clones the repo, calls
> the model, and opens the PR/review. Docker is just a portable way to run that server anywhere.

**1. Deploy the webhook server**

```bash
docker build -t shipit-forge .
docker run -p 3000:3000 --env-file .env shipit-forge
# any host works: Cloud Run, Fly.io, Render, Railway, a VM — it just needs a public HTTPS URL.
```

**2. Register the GitHub App (one click)** — open the server's public URL; Probot serves a
registration page driven by [`app.yml`](./app.yml). GitHub hands back `APP_ID`, `PRIVATE_KEY`, and
`WEBHOOK_SECRET` — put them (plus your provider vars) in the server env and restart.

**3. Install on your org** — App page → **Install App** → your org → **All repositories**. Done —
Forge now sees issues and PRs across the org automatically.

---

## 🧩 Configuration

Per-repo via `.github/agent.yml` (all optional), with env-var defaults:

```yaml
model: gemini-2.5-pro          # provider-specific model id
trigger_label: agent-fix
auto_fix: label                # label | opened | off
auto_review: always            # always | requested | off
test_command: "npm test"       # else auto-detected
review_depth: standard         # light | standard | deep
ignore_paths: ["dist/**", "*.lock"]
```

| Env var | Default | Effect |
|---|---|---|
| `LLM_PROVIDER` | `anthropic` | `vertex` · `bedrock` · `openai` · `anthropic` |
| `FORGE_AUTO_FIX` | `label` | `opened` = attempt a PR on **every** new issue (full auto) |
| `FORGE_AUTO_REVIEW` | `always` | `requested` = only when invited / `/review` |
| `MAX_ITERATIONS` | `25` | Max agent tool-loop steps per run |

---

## 🛠️ How it works

```
issue / PR event ─▶ Probot webhook ─▶ clone repo (sandbox)
                                          │
                       agent loop ◀───────┘   (LLM + tools, provider-agnostic)
                       read · search · edit · multi_edit · glob · git_history · run_bash · run_tests
                                          │
                       verify (tests) ────┘
                                          │
                 ┌────────────────────────┼────────────────────────┐
                 ▼                         ▼                        ▼
          open PR (Closes #n)      PR review (inline +        @mention reply
                                   security + suggestions)
```

- **Provider layer** (`src/providers`) — one `LLMClient` interface; adapters normalize chat +
  tool-calling + images for Anthropic, Vertex Gemini, OpenAI, Bedrock. Swap providers with one env var.
- **Tools** (`src/agent/tools`) — `read_file`, `write_file`, `edit_file`, `multi_edit`, `list_dir`,
  `glob`, `read_image`, `search`, `git_history`, `run_bash` (sandboxed: allow/deny, timeout, no
  network), `run_tests` (auto-detected).
- **Agent loop** (`src/agent/loop.ts`) — chat → tool calls → results → repeat, with retries,
  iteration + token limits, and a repo-map for fast orientation.
- **GitHub layer** (`src/github`) — vision image extraction, workspace clone/branch/commit/push,
  PR composer, diff-aware security review composer; wired to webhooks in `src/app.ts`.

---

## 🧪 Testing

```bash
npm test         # vitest — 76 unit tests
npm run typecheck
```

Everything is testable **without credentials**: a scripted fake provider drives the agent loop, and
each real adapter is verified via pure normalization functions + injected mock clients. CI runs
typecheck + tests + build on every push.

---

## 🗺️ Roadmap

- [x] Agent engine, 11 tools, sandbox, retries
- [x] 4 provider adapters + vision
- [x] GitHub App: issue→PR, PR review, security lens, @mentions
- [x] Review line-safety, `.github/agent.yml`, secret redaction, CI
- [ ] Live provider smoke run + recorded integration tests
- [ ] Follow-up commits when @mentioned on a PR
- [ ] CodeQL/SARIF ingestion · multi-pass self-review · sub-agents
- [ ] npm package + GitHub Marketplace listing

---

## 🔒 A note on provenance

ShipIT Forge is **original open-source code**. It does not copy or reuse any proprietary source. It
follows the same public, event-driven pattern as other GitHub coding bots, implemented from scratch.

## 🤝 Contributing

Issues and PRs welcome. Run `npm test` before pushing — and feel free to let Forge review your PR. 😄

## License

[MIT](./LICENSE) © Rahul Raj
