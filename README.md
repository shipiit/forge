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
| GitHub App: issue→PR, PR review, @mentions | 🚧 next slice |
| Security-review lens (severity + suggested fix) | 🚧 next slice |

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

## How it works

```
issue/PR event → agent loop (LLM + tools over a cloned repo) → verify (tests) → PR / review
```

- **Provider abstraction** (`src/providers`) normalizes chat + tool-calling + images so the loop is
  provider-agnostic. Adapters: `anthropic.ts`, `vertex.ts`, `openai.ts`, `bedrock.ts`.
- **Tools** (`src/agent/tools`) — `read_file`, `write_file`, `edit_file`, `list_dir`, `read_image`,
  `search`, `run_bash` (sandboxed: allow/deny, timeout, no network), `run_tests` (auto-detected).
- **Agent loop** (`src/agent/loop.ts`) drives chat → tool calls → results → repeat, with iteration
  and token limits.

## License

MIT © Rahul Raj
