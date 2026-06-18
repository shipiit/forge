# GitHub Marketplace listing — copy/paste kit

Everything below is ready to paste into **GitHub → your App → Marketplace → Create/Edit listing**.
A listing requires the App to be **public** and the publisher to be **verified** (an org with 2FA);
GitHub reviews the listing before it goes live.

---

## Listing name
```
ShipIT Forge
```

## Very short description (tagline, ≤ 80 chars)
```
Autonomous coding agent: fixes issues, opens PRs, reviews code & security.
```

## Categories
- Primary: **Code review**
- Secondary: **Continuous integration** (and/or **Project management**)

## Supported languages
`Any` — Forge is language-agnostic (auto-detects test/build commands for JS/TS, Python, Go, Rust, Make…).

## Logo & card
- Logo: `assets/logo.png` (512×512) — anvil-and-spark mark.
- Feature card / social preview: `assets/banner.png` (1280×320).

---

## Introductory description (short pitch shown at the top)
```
ShipIT Forge is an autonomous engineering teammate for your repositories. Open an issue and it
investigates the codebase, writes a fix on a branch, runs your tests, and opens a pull request.
Open a PR and it reviews the diff with inline comments, a security pass (SSRF, injection, secrets,
authz…) with severity and suggested fixes, and an overall verdict. Mention it anywhere to get
answers or a follow-up commit. Bring your own model — Vertex AI Gemini, AWS Bedrock, OpenAI, or
Anthropic — and your own key.
```

## Detailed description (full listing body — Markdown)
```markdown
## What it does

- **Fix issues → PRs.** Label an issue `agent-fix` (or comment `/fix`). Forge clones the repo,
  investigates with real tools (read/search/edit/multi-edit/run-tests), verifies its change, and
  opens a pull request that closes the issue. If tests fail it opens a **draft** and explains why.
- **Review pull requests.** Auto-review on open, or request it as a reviewer, or comment `/review`.
  It posts inline comments plus a structured summary and verdict.
- **Security review** (GitHub Advanced Security–style). A dedicated security lens flags SSRF,
  injection, broken auth/authz, hardcoded secrets, unsafe deserialization, path traversal and more —
  each with a **severity** and a **suggested-fix** block. Comment `/security` for a security-only pass.
  Optional: ingest your existing CodeQL/SARIF results and triage them alongside.
- **Mentions.** `@your-app <ask>` on an issue for an answer, or on a PR to push a follow-up commit.
- **Reads screenshots.** Images in issue/PR descriptions are sent to vision-capable models.

## Bring your own model
Choose **Vertex AI Gemini**, **AWS Bedrock**, **OpenAI**, or **Anthropic** and provide your own key.
You control the model and the spend; per-run token + cost is reported.

## Built for trust
- Never pushes to your default branch — always a `forge/…` branch via a PR.
- Sandboxed shell (command allow/deny, timeouts, no network), secret redaction in logs.
- Multi-pass self-review: the agent critiques its own diff before opening the PR.
- Per-repo config via `.github/agent.yml` (model, trigger label, auto-review, ignore paths…).

## How to use
1. Install on your org and pick repositories.
2. (Optional) add `.github/agent.yml` to tune behavior.
3. Open an issue + label `agent-fix`, or open a PR. That's it.
```

## Pricing plan (suggested)
- **Free** plan to start (you supply your own LLM key, so there's no inference cost to you as the
  publisher). Example plan name: `BYO-Key` — "Free. Bring your own model key."
- If you later host inference yourself, add paid tiers (per-seat or per-repo).

## Resource links (required fields)
- Homepage URL: `https://github.com/shipiit/forge`
- Customer support URL: `https://github.com/shipiit/forge/issues`
- Privacy policy URL: `https://github.com/shipiit/forge/blob/main/deploy/PRIVACY.md` (add one)
- Status URL (optional): your Cloud Run health URL

## Screenshots to capture (3–5)
1. A PR opened by Forge that closes an issue (root-cause + verification body).
2. An inline **security** review comment with severity + a `suggestion` block.
3. The review summary comment with the verdict.
4. The `@shipit-forge` follow-up-commit comment on a PR.
5. `.github/agent.yml` config example.

---

## Install & permissions — what users approve

When someone installs ShipIT Forge (or you update its permissions), GitHub shows a **permissions
request** screen and emails the account owner — the same flow as any GitHub App ("The GitHub App
ShipIT Forge is requesting access to your account"). Be transparent about exactly what it asks for
and why. ShipIT Forge requests the **minimum** needed:

| Permission | Access | Why |
|---|---|---|
| **Contents** | Read & write | Clone the repo and push fix branches (`forge/…`). Never the default branch directly. |
| **Pull requests** | Read & write | Open PRs and post reviews with inline comments. |
| **Issues** | Read & write | Read issue details and post progress/result comments. |
| **Metadata** | Read | Basic repo info (required by all apps). |
| **Checks** | Read | Read CI/check results when verifying a fix. |

Events it subscribes to: `issues`, `issue_comment`, `pull_request`, `pull_request_review`,
`pull_request_review_comment`.

**What it does *not* do:** it never reads your Actions **secrets**, never force-pushes, never merges
on its own, and never sends code to anywhere except the LLM provider **you** configured with **your**
key. A human always reviews the PR.

> Org owners can review or revoke at any time:
> **Organization → Settings → GitHub Apps → ShipIT Forge → Configure**, or the per-install link
> `https://github.com/settings/installations/<id>/permissions/update` that GitHub emails you.
