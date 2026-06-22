# Contributing to ShipIT Forge

Thanks for your interest in improving ShipIT Forge! 🔨 Contributions of every size are welcome — bug reports, docs fixes, new provider adapters, or whole features.

## Code of Conduct

Be kind and constructive. Assume good intent, keep feedback about the code, and help newcomers. Harassment of any kind is not tolerated.

## Ways to contribute

- 🐛 **Report a bug** — open an [issue](https://github.com/shipiit/forge/issues) with steps to reproduce, expected vs actual behavior, and your environment (Node version, OS, provider).
- 💡 **Suggest a feature** — open an issue describing the problem first, then the proposed solution.
- 📖 **Improve docs** — typos, clearer setup steps, new examples. Docs live in `README.md`, `deploy/`, and the site under `web/`.
- 🔌 **Add a provider** — see "Adding a provider" below.
- 🧪 **Add tests** — coverage for edge cases is always appreciated.

## Development setup

**Prerequisites:** [Node.js](https://nodejs.org) **≥ 20** (22 recommended), `git`, and optionally [`ripgrep`](https://github.com/BurntSushi/ripgrep) for faster search.

```bash
# 1. Fork, then clone your fork
git clone https://github.com/<your-username>/forge.git
cd forge

# 2. Install dependencies
npm install

# 3. Build (TypeScript -> dist/)
npm run build

# 4. Run the full test suite (no credentials needed)
npm test
```

Everything is testable **without API keys** — a built-in `fake` provider drives the agent loop, and each real adapter is verified with pure normalization functions + mocked clients.

```bash
node dist/cli.js fix --repo /path/to/any/repo --task "fix the failing test" --provider fake
```

## Project layout

| Path | What lives here |
|---|---|
| `src/providers/` | `LLMClient` interface + one adapter per provider (Anthropic, Vertex, OpenAI, Bedrock) |
| `src/agent/` | The agent loop (`loop.ts`) and tools (`tools/`: read, edit, search, run_bash, run_tests…) |
| `src/github/` | Webhook handlers, workspace clone/commit/push, PR + review composers, Dependabot ingestion |
| `src/app.ts` | Probot wiring — maps GitHub events to handlers |
| `deploy/` | Deployment + provider credential guides |
| `web/` | The marketing + docs site (Vite + React + TypeScript) |
| `tests/` | Vitest unit + integration tests |

## Workflow

1. **Branch** off `main`: `git checkout -b fix/short-description`.
2. **Write a test first** when fixing a bug or adding behavior (TDD encouraged).
3. **Make the change**, keeping files focused and matching the surrounding style.
4. **Verify locally** before pushing:
   ```bash
   npm run typecheck
   npm test
   npm run build
   ```
5. **Commit** with a clear message (we use Conventional Commits — e.g. `fix: clamp review comments to diff lines`).
6. **Open a PR** against `main`. Fill in what changed and why. CI (`test`) must pass.

> **Heads up:** `main` is a protected branch. All changes land through pull requests, every PR is reviewed automatically by ShipIT Forge itself (a security + code pass), and a maintainer gives the final approval. Resolve the bot's review threads before requesting merge. 🤖

## Adding a provider

1. Create `src/providers/<name>.ts` implementing the `LLMClient` interface (`chat()` with tool-calling + image parts).
2. Normalize messages/tools/images to and from the provider's wire format in **pure functions** so they can be unit-tested without network.
3. Register it in the provider factory and add its env vars to `.env.example`.
4. Add tests under `tests/providers/<name>.test.ts` using a mocked client.
5. Document its credentials in `deploy/PROVIDERS.md` and the docs site.

## Pull request checklist

- [ ] `npm run typecheck` passes
- [ ] `npm test` passes
- [ ] `npm run build` succeeds
- [ ] New behavior has tests
- [ ] Docs updated if behavior or setup changed
- [ ] No secrets, keys, or `.env` files committed

## Reporting security issues

Please **do not** open a public issue for security vulnerabilities. Email **rahul@iamrraj.com** with details and we'll coordinate a fix and disclosure.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](./LICENSE).

---

Questions? Open a [discussion or issue](https://github.com/shipiit/forge/issues) — and feel free to let Forge review your PR. 😄
