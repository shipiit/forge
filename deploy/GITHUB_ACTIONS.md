# ShipIT Forge — GitHub Actions setup

ShipIT Forge runs as a **GitHub Action in your own CI** (no server to host), the same model as
Claude Code's GitHub Action. There are two ways to set it up.

## Quick setup (just the Action — works immediately)

1. **Add your model key** to the repo's secrets
   (Settings → Secrets and variables → Actions). E.g. `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or for
   Vertex a `VERTEX_SA_JSON` secret + `VERTEX_PROJECT` variable.
2. **Copy the workflow** from [`examples/forge.yml`](../examples/forge.yml) into your repo at
   `.github/workflows/forge.yml`.
3. Open an issue and add the label **`agent-fix`** (or comment `/fix`), or open a PR. Done.

This uses the workflow's built-in `GITHUB_TOKEN` — no app to install. Forge acts as
`github-actions[bot]`.

## Manual setup with the GitHub App (act as your own bot — like Claude)

If you want Forge to act under **its own app identity** (and to push commits that can trigger other
workflows), install the GitHub App as well:

1. **Install the ShipIT Forge GitHub App** on your repository/org:
   **https://github.com/apps/shipit-forge** *(available once you publish the App — see
   [`DEPLOY.md`](./DEPLOY.md) to register it)*.
   The App requests these repository permissions:
   - **Contents: Read & write** — to modify repository files (push `forge/…` branches)
   - **Issues: Read & write** — to respond to issues
   - **Pull requests: Read & write** — to create PRs and push changes
   - **Metadata: Read**, **Checks: Read**
   (See [`MARKETPLACE.md`](./MARKETPLACE.md) for the full permissions explainer.)
2. **Add your model key** to the repository secrets (as above), and add the App credentials as
   secrets: `FORGE_APP_ID` and `FORGE_APP_PRIVATE_KEY`.
3. **Copy the workflow** from [`examples/forge.yml`](../examples/forge.yml) into
   `.github/workflows/forge.yml`, and uncomment the `APP_ID` / `PRIVATE_KEY` env lines:
   ```yaml
   APP_ID: ${{ secrets.FORGE_APP_ID }}
   PRIVATE_KEY: ${{ secrets.FORGE_APP_PRIVATE_KEY }}
   ```

With those set, the Action mints an installation token for your App and acts as the **ShipIT Forge**
bot. Without them, it falls back to the workflow token — both work.

> Prefer a fully hosted bot (webhooks, org-wide one-click install, no per-repo workflow file)?
> Use the hosted App instead — see [`DEPLOY.md`](./DEPLOY.md).
