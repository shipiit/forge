# Deploying ShipIT Forge as a hosted GitHub App (Cloud Run)

This gives you the **org-level install** experience (one click, permissions screen) — the same model
as Claude's GitHub App. The Action (`examples/forge-action.yml`) is the no-server alternative; this
guide is for the hosted App.

## Prerequisites
- `gcloud` CLI installed and logged in: `gcloud auth login`
- A GCP project (pass it as `PROJECT=your-gcp-project-id` to the script)
- Node ≥ 20 to run the one-time registration locally

## Step 1 — Register the GitHub App (once, ever)

```bash
npm install && npm run build
npm run dev          # prints http://localhost:3000 (setup mode)
```
Open `http://localhost:3000` → **Register a GitHub App** → choose owner **`shipiit`** → confirm.
GitHub writes `APP_ID`, `PRIVATE_KEY`, and `WEBHOOK_SECRET` into `.env`, and lets you **download the
private key `.pem`**. Save that file (e.g. `./shipit-forge.private-key.pem`).

> Prefer manual? GitHub → **Settings → Developer settings → GitHub Apps → New**, copying the
> permissions/events from [`app.yml`](../app.yml). Then generate + download a private key.

## Step 2 — Deploy to Cloud Run (one command)

```bash
APP_ID=<your-app-id> \
WEBHOOK_SECRET=<your-webhook-secret> \
PRIVATE_KEY_FILE=./shipit-forge.private-key.pem \
./deploy/cloudrun.sh
```

The script enables the needed APIs, stores the private key in **Secret Manager**, grants the Cloud
Run service account **Vertex AI access** (so no JSON key is needed on the server — auth uses the
runtime identity), builds the Docker image, and deploys. It prints your public URL.

Using a different provider? Pass `LLM_PROVIDER=openai` (etc.) and set that provider's key — for
non-Vertex providers, add `--set-env-vars`/`--set-secrets` for the relevant key (see
[`.env.example`](../.env.example)).

## Step 3 — Point the App at the server

In your GitHub App settings, set **Webhook URL** to the printed URL plus `/api/github/webhooks`:

```
https://shipit-forge-xxxxx.run.app/api/github/webhooks
```

Upload `assets/logo.png` under **Display information → Logo** while you're there.

## Step 4 — Install on an organization

- **Your orgs** (e.g. `shipiit`): App page → **Install App** → choose the org → repos. Works while
  the App is private.
- **Other organizations:** set `public: true` in [`app.yml`](../app.yml) (or in the App's settings),
  then share `https://github.com/apps/shipit-forge`. That org's admin clicks **Install** and approves
  the permissions screen.

## Step 5 — Use it
Open an issue and add the label **`agent-fix`** (or comment `/fix`) → Forge opens a fix PR.
Open a PR or request **@shipit-forge** as a reviewer → it reviews with inline + security findings.

## Updating later
Re-run `./deploy/cloudrun.sh` to ship a new version (it adds a new secret version + redeploys).
