# Create + test ShipIT Forge privately on your org, then go public

A complete walkthrough: create the GitHub App, run it locally (no hosting), install it on your org,
test it, then later make it always-on + public.

---

## Part A — Create the GitHub App

Go to **https://github.com/organizations/shipiit/settings/apps/new** and fill in:

| Field | Value |
|---|---|
| **GitHub App name** | `ShipIT Forge` (if taken, `ShipIT Forge Bot`) |
| **Description** | `Autonomous coding agent — fixes issues, opens PRs, reviews code & security.` |
| **Homepage URL** | `https://github.com/shipiit/forge` |
| **Callback URL** | *(leave empty — click Delete if shown)* |
| Request user authorization (OAuth) during installation | ☐ unchecked |
| Enable Device Flow | ☐ unchecked |
| **Setup URL** | *(leave empty)* |

**Webhook**
- **Active:** ✅ checked
- **Webhook URL:** create one at **https://smee.io/new** and paste that URL here (temporary, for local testing)
- **Secret:** `<WEBHOOK_SECRET>` — use the value generated for you (also goes in `.env`)

**Repository permissions**
| Permission | Access |
|---|---|
| Contents | **Read and write** |
| Issues | **Read and write** |
| Pull requests | **Read and write** |
| Metadata | Read-only (automatic) |
| Checks | Read-only |

Organization & Account permissions: **No access**.

**Subscribe to events** (these appear after you set the permissions above):
✅ Issues · ✅ Issue comment · ✅ Pull request · ✅ Pull request review · ✅ Pull request review comment

**Where can this GitHub App be installed?** → **Only on this account** (keeps it private to `shipiit`).

Click **Create GitHub App.**

## Part B — Grab the credentials

On the App's page after creating:
1. Copy the **App ID**.
2. Scroll to **Private keys → Generate a private key** → downloads a `.pem`. Save it into the
   `forge/` project folder (it's gitignored).
3. Your **webhook secret** is the value you entered above.

## Part C — Run the server locally (no hosting yet)

Create `forge/.env`:

```bash
APP_ID=<your app id>
WEBHOOK_SECRET=<the secret you set>
PRIVATE_KEY_PATH=./your-app.private-key.pem      # or just drop the .pem in the folder (auto-detected)
WEBHOOK_PROXY_URL=https://smee.io/<your-channel>  # the SAME smee URL you set as the Webhook URL

# Your model (Vertex example)
LLM_PROVIDER=vertex
VERTEX_PROJECT=<your-gcp-project-id>
VERTEX_LOCATION=us-central1
VERTEX_MODEL=gemini-2.5-pro
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
```

Then:

```bash
cd forge
npm install
npm run build
npm start          # connects to smee + listens; leave it running
```

## Part D — Install on the whole org

App page → **Install App** → **`shipiit`** → choose **All repositories** → Install.
(Covers every repo, including future ones.)

## Part E — Test it

In any `shipiit` repo:
- **Fix:** open an issue, add the label **`agent-fix`** (create the label once), or comment **`/fix`** → it opens a PR.
- **Review:** open a PR, or comment **`/review`** or **`/security`**, or request **@shipit-forge** as a reviewer.
- **Ask:** comment **`@shipit-forge <question>`**.

Watch the terminal — every event and tool call is logged (secrets redacted).

## Part F — Later: always-on + public

1. **Always-on:** deploy the server so you don't need your laptop —
   `PROJECT=<gcp> APP_ID=… WEBHOOK_SECRET=… PRIVATE_KEY_FILE=./your-app.private-key.pem ./deploy/cloudrun.sh`
   then change the App's **Webhook URL** from the smee URL to the printed Cloud Run URL.
2. **Public (other orgs can install):** App settings → **Advanced / "Make public"**, set
   **"Where can this GitHub App be installed?" → Any account**, and share
   `https://github.com/apps/<your-app-slug>`.

> Credentials never go into GitHub org/profile settings — they live in your server's environment
> (`.env` locally, or Cloud Run env). GitHub only stores the App and where it's installed.
