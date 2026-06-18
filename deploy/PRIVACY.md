# ShipIT Forge — Privacy Policy

_Last updated: 2026-06-18_

ShipIT Forge is an open-source GitHub App/Action that you (or your organization) self-host and
operate with your own LLM provider credentials. This policy describes how data is handled.

## What data is processed
To do its job, Forge processes, for the repositories where it is installed:
- Issue and pull-request titles, descriptions, and comments (including images embedded in them).
- Repository file contents and git history of the installed repositories.
- Diffs of pull requests under review.

## How it is used
- This content is sent to the **LLM provider you configured** (Vertex AI Gemini, AWS Bedrock,
  OpenAI, or Anthropic) **using your own credentials**, solely to generate fixes, reviews, and
  replies. Your use of that provider is governed by **that provider's** terms and privacy policy.
- Results (branches, pull requests, comments, reviews) are written back to your repositories via the
  GitHub API.

## What is NOT done
- Forge does **not** sell or share your data with third parties other than the LLM provider you chose.
- It does **not** read your GitHub Actions secrets, force-push, or merge on its own.
- The maintainers of this project do **not** receive your code or repository data. When you self-host,
  data flows only between your server, GitHub, and your chosen LLM provider.

## Data retention
- Repositories are cloned into ephemeral working directories and **deleted after each run**.
- Logs are kept by your hosting platform under your control, with secrets redacted. Configure
  retention there.

## Your controls
- Uninstall or change permissions anytime: **Organization → Settings → GitHub Apps → ShipIT Forge**.
- Limit scope by installing on selected repositories only, and via `.github/agent.yml`.

## Contact
Questions or requests: open an issue at https://github.com/shipiit/forge/issues
