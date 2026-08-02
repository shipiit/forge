# Deploy ShipIT Forge on your own server (systemd + Vertex AI)

A small, copy-paste guide to run the ShipIT Forge **GitHub App server** as a normal Linux
service (no Docker), using **Vertex AI Gemini**. Tested on Ubuntu 22.04 / Debian 12.

You'll end with a 24/7 service that receives GitHub webhooks and, on each issue/PR event,
clones the repo, calls Gemini, and opens PRs / posts reviews.

---

## 0. What you need

- A Linux server (1 vCPU / 1 GB RAM is enough) with **root/sudo**.
- A **domain or subdomain** pointing at the server (e.g. `forge.yourdomain.com`) — GitHub
  webhooks require a **public HTTPS URL**.
- A **GCP service-account JSON** with the **Vertex AI User** role (`roles/aiplatform.user`)
  and the **Vertex AI API** enabled in your project.

---

## 1. Install Node.js 20 + git

```bash
sudo apt update
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git nginx
node -v        # should print v20.x
```

## 2. Get the code and build it

```bash
sudo useradd -m -s /bin/bash forge          # a dedicated user (no sudo)
sudo -iu forge
git clone https://github.com/shipiit/forge.git ~/forge
cd ~/forge
npm install
npm run build                                # compiles to dist/
cp .env.example .env && chmod 600 .env       # your config goes here
exit                                         # back to your sudo user
```

## 3. Add the Vertex service-account key

Copy your service-account JSON onto the server (keep it private):

```bash
sudo mkdir -p /etc/shipit-forge
sudo nano /etc/shipit-forge/vertex-sa.json   # paste the full JSON, save
sudo chown forge:forge /etc/shipit-forge/vertex-sa.json
sudo chmod 600 /etc/shipit-forge/vertex-sa.json
```

## 4. Register the GitHub App (one-time)

Start the server once so it can serve the registration page:

```bash
sudo -iu forge
cd ~/forge && PORT=3000 node dist/server.js
```

Open `http://YOUR_SERVER_IP:3000` in a browser → **Register a GitHub App** → choose your
**organization** as the owner → confirm. GitHub creates the App and writes `APP_ID`,
`PRIVATE_KEY`, and `WEBHOOK_SECRET` into `~/forge/.env`. Press `Ctrl+C` to stop, then `exit`.

> Prefer manual? GitHub → **Settings → Developer settings → GitHub Apps → New** and copy the
> permissions/events from [`app.yml`](../app.yml). Put `APP_ID`, `PRIVATE_KEY`, `WEBHOOK_SECRET`
> into `.env` yourself.

## 5. Fill in the `.env` (the full config)

You already created `.env` from `.env.example` in step 2. Open it and fill it in:

```bash
sudo -iu forge
nano ~/forge/.env
```

This is the **complete** file — the top sections are credentials, the bottom sections
are the **per-org defaults** you can tune for each client:

```ini
# ---------- GitHub App (filled in step 4) ----------
APP_ID=123456
WEBHOOK_SECRET=your-webhook-secret
PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----\n"

# ---------- Provider ----------
LLM_PROVIDER=vertex

# ---------- Vertex AI Gemini ----------
VERTEX_PROJECT=your-gcp-project-id
VERTEX_LOCATION=us-central1
VERTEX_MODEL=gemini-2.5-pro
GOOGLE_APPLICATION_CREDENTIALS=/etc/shipit-forge/vertex-sa.json
# (or paste the JSON via VERTEX_CREDENTIALS_JSON instead of the path)

# ---------- Behavior defaults (set per client org) ----------
FORGE_AUTO_FIX=label          # label | opened (full auto) | off
FORGE_AUTO_REVIEW=always      # always | requested | off
FORGE_REVIEW_DEPTH=standard   # light | standard | deep
FORGE_TRIGGER_LABEL=agent-fix # issue label that triggers a fix
MAX_ITERATIONS=25             # max agent steps per run
# FORGE_MODEL=                # force a model for any provider
# FORGE_TEST_COMMAND=npm test # else auto-detected

# ---------- Bot identity (how it appears in the org) ----------
FORGE_DISPLAY_HANDLE=shipit-forge      # the @handle people mention — match the App slug
FORGE_DISPLAY_NAME=ShipIT Forge
FORGE_GIT_EMAIL=shipit-forge@users.noreply.github.com

# ---------- Server ----------
PORT=3000
# Never set WEBHOOK_PROXY_URL in production (dev/smee only).
```

> Every variable is documented in [`.env.example`](../.env.example), including the
> Anthropic / OpenAI / Bedrock blocks if you ever switch providers.

**Per client org, you'll typically only change:** `VERTEX_PROJECT`, the credentials path,
`FORGE_AUTO_FIX` / `FORGE_AUTO_REVIEW` (how aggressive it is), `FORGE_TRIGGER_LABEL`, and
the `FORGE_DISPLAY_*` identity. Save and `exit`.

## 6. Run it as a systemd service

```bash
sudo nano /etc/systemd/system/shipit-forge.service
```

```ini
[Unit]
Description=ShipIT Forge GitHub App
After=network.target

[Service]
Type=simple
User=forge
WorkingDirectory=/home/forge/forge
EnvironmentFile=/home/forge/forge/.env
ExecStart=/usr/bin/node dist/server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now shipit-forge
sudo systemctl status shipit-forge        # should be "active (running)"
journalctl -u shipit-forge -f             # live logs (secrets are redacted)
```

## 7. Put it behind HTTPS (nginx + free TLS)

```bash
sudo nano /etc/nginx/sites-available/shipit-forge
```

```nginx
server {
    server_name forge.yourdomain.com;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/shipit-forge /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
# Free HTTPS certificate:
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d forge.yourdomain.com
```

## 8. Point the App at your URL and install it

1. GitHub → **Settings → Developer settings → GitHub Apps → ShipIT Forge → General**.
2. Set **Webhook URL** to: `https://forge.yourdomain.com/api/github/webhooks`
   and **Webhook secret** to the same `WEBHOOK_SECRET` from your `.env`. Save.
3. **Install App** → pick your organization → choose repositories.

## 9. Test it

In an installed repo:

- Open an issue and add the label **`agent-fix`** (or comment **`/fix`**) → Forge opens a PR.
- Open a pull request → Forge auto-reviews it (code + security).
- Comment **`/review`**, **`/security`**, or **`@shipit-forge <question>`**.

Watch `journalctl -u shipit-forge -f` to see each event and tool call. A failed run still
comments on the issue/PR explaining what happened.

---

## Updating later

```bash
sudo -iu forge
cd ~/forge && git pull && npm install && npm run build && exit
sudo systemctl restart shipit-forge
```

## Quick troubleshooting

| Symptom                                  | Fix                                                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Webhook deliveries show errors in GitHub | Confirm the URL ends in `/api/github/webhooks` and the secret matches `.env`.                    |
| `Could not resolve authentication`       | Check `LLM_PROVIDER=vertex` and that `GOOGLE_APPLICATION_CREDENTIALS` points to a readable JSON. |
| `permission denied` from Vertex          | Grant the service account `roles/aiplatform.user`; verify `VERTEX_PROJECT` / `VERTEX_LOCATION`.  |
| Service not running                      | `journalctl -u shipit-forge -e` for the error, then `sudo systemctl restart shipit-forge`.       |

> No keys ever live in the repo — they stay in `.env` (chmod 600) and `/etc/shipit-forge/`.
> Provider setup for other models: [`PROVIDERS.md`](./PROVIDERS.md).
