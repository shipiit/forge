# Deploy ShipIT Forge on Render (no GCP, 24/7, free tier)

The simplest way to run the hosted App always-on without Google Cloud. Render builds the
`Dockerfile` straight from your repo and gives you an HTTPS URL.

## Steps

1. **Register the GitHub App first** (once) — see [`DEPLOY.md`](./DEPLOY.md) Part A. You need
   `APP_ID`, `WEBHOOK_SECRET`, and the private-key `.pem`.

2. **Create the service on Render**
   - Go to **https://dashboard.render.com** → **New** → **Blueprint** and connect `shipiit/forge`
     (it reads [`render.yaml`](../render.yaml)), **or** **New → Web Service → Docker** and pick the repo.

3. **Set the secret environment variables** (Render dashboard → your service → Environment):
   ```
   APP_ID=4085969
   WEBHOOK_SECRET=<your webhook secret>
   PRIVATE_KEY=<paste the FULL .pem contents, including the BEGIN/END lines>
   LLM_PROVIDER=vertex
   VERTEX_PROJECT=<your-gcp-project>
   VERTEX_CREDENTIALS_JSON=<paste the service-account JSON>   # server writes it to a file at boot
   ```
   (For OpenAI/Anthropic/Bedrock instead, set that provider's key — see [`PROVIDERS.md`](./PROVIDERS.md).)
   Do **not** set `WEBHOOK_PROXY_URL` in production.

4. **Deploy.** Render builds and gives you a URL like `https://shipit-forge.onrender.com`.

5. **Point the App at it** — GitHub App settings → **Webhook URL**:
   ```
   https://shipit-forge.onrender.com/api/github/webhooks
   ```
   Save. Done — Forge now runs 24/7 with no laptop.

## Notes
- **Security:** HTTPS is automatic; every webhook is signature-verified with `WEBHOOK_SECRET`;
  secrets live in Render's env store, never in the repo.
- **Free tier sleeps** after inactivity (first webhook after idle has a cold start). Use the Starter
  plan to keep it warm for production.
- Same pattern works on **Railway**, **Fly.io**, **Koyeb**, or any VPS running the Docker image.
