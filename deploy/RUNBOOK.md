# Running ShipIT Forge on your own server

From nothing to a working agent with a dashboard you can sign in to. Fifteen
minutes, most of it waiting for a container to build.

If you only want Forge reviewing pull requests and no server to run, stop here
and use the Action instead: copy [`examples/forge.yml`](../examples/forge.yml)
into `.github/workflows/`, add one provider secret, done. This page is for the
hosted App — one install, every repository in the organisation.

---

## What you need first

| | |
|---|---|
| **A host** | Anything that runs a container with a public HTTPS URL and a persistent disk. Render, Fly, Cloud Run, a VPS. |
| **A GitHub App** | Created once, installed on your org. Settings → Developer settings → GitHub Apps. |
| **One provider key** | Anthropic, OpenAI, Gemini, Vertex, Bedrock, Groq, Together, or Ollama. You hold it; nothing is proxied through us. |

The App needs **Contents**, **Issues**, **Pull requests** and **Checks** as
read & write, and it should subscribe to the Issues, Issue comment, Pull
request, Pull request review comment, Check suite and Workflow run events.

---

## 1. The environment

```bash
# ── GitHub App ───────────────────────────────────────────────────────────────
APP_ID=123456
PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----"
WEBHOOK_SECRET=<the one you set on the App>

# ── One provider ─────────────────────────────────────────────────────────────
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
#  or: LLM_PROVIDER=vertex + VERTEX_PROJECT / VERTEX_LOCATION / VERTEX_MODEL
#      and VERTEX_CREDENTIALS_JSON pasted whole

# ── Dashboard (optional, and off until you set the first line) ───────────────
FORGE_USAGE_DB=/data/usage.db      # MUST be on a persistent disk — see below

# ── Cost controls ────────────────────────────────────────────────────────────
FORGE_SPEND_CAP_RUN=0.50           # stops before the turn that would cross it
FORGE_MAX_RUNS_PER_HOUR=10
FORGE_PROMPT_CACHE=1               # on by default; this is what makes it cheap
# FORGE_SHOW_COST=1                # publish spend under each comment (off by default)
```

Put the private key in as one line with `\n` escapes, or use `PRIVATE_KEY_FILE`
pointing at the PEM.

### The persistent disk

Artifacts are written **next to** the database, in `<same-dir>/artifacts`, so
the whole directory has to survive a redeploy — not just the file.

| Host | Mount |
|---|---|
| Render | Disk, mount path `/data` |
| Fly.io | Volume at `/data` |
| Docker | `-v forge-usage:/data` |
| Cloud Run | A GCS or Filestore volume — the container filesystem is not persistent |

Get this wrong and it fails later as *"it signed me out"* rather than as a
storage error, because the database holding the accounts was replaced.

---

## 2. Deploy

```bash
docker build -t forge .
docker run -d --name forge -p 3000:3000 --env-file .env -v forge-usage:/data forge
```

Point the App's **Webhook URL** at `https://your-server/api/github/webhooks`.

Check the log. You are looking for two lines:

```
Probot has started!
usage dashboard mounted at /usage
```

If the second is missing, see the table at the bottom.

---

## 3. Prove it works

Open an issue on a repository the App is installed on, label it `agent-fix`,
and watch. Within a couple of minutes it should clone, read the code, write a
fix, run your tests, and open a pull request.

Then open a pull request yourself. Before the model does anything, three
deterministic scanners run — credentials, infrastructure, source code — and
post one comment grouped by rule, plus a check run.

Nothing happening? Every declined run says why in the Actions log or the
container log. It is almost always the webhook secret or a missing permission.

---

## 4. Sign in to the dashboard

One account per person who should see it. Run it **where the database is** —
it writes to the file, it does not talk to a server:

```bash
docker exec -it forge node dist/cli.js dashboard:user add rahul
# New password:  (hidden — asked for, never an argument)
# Repeat it:     (hidden)
```

| Host | How |
|---|---|
| Docker | `docker exec -it forge node dist/cli.js dashboard:user add <name>` |
| Render / Fly | Open the service shell, same command |
| Cloud Run | Run it as a Job against the same volume — there is no shell |

Then open **`https://your-server/usage`** and sign in. That is the whole step:
the agent serves the dashboard itself, from the same origin as its data, so
there is no API URL to configure and no CORS origin to allow.

```bash
forge dashboard:user list             # who can sign in, and when they last did
forge dashboard:user password rahul   # also signs out every session it had
forge dashboard:user remove rahul     # same
```

Minimum twelve characters. A password is stored only as an scrypt hash with
its own salt; a session only as its SHA-256 — a copy of the database cannot be
replayed as a login.

---

## 5. Make the security scan a merge gate

The scans need no model call and run on every pull request regardless of the
review cadence. To make a finding actually stop a merge:

1. **Settings → Branches → Require status checks to pass**
2. Tick **`ShipIT Forge — security scan`** (it appears once the scan has run once)

`scan_block_on` in `.github/agent.yml` decides what fails it — `high` by
default, `low` if nothing outstanding may merge, `none` for a report with no
gate. The comment always names the threshold in force.

---

## Turning things down

Per repository, in `.github/agent.yml` — every repo can override the org
default, so this is opt-out rather than enforced:

```yaml
auto_review: requested    # always | requested | off
auto_fix: off             # label | opened | off
secret_scan: true         # deterministic, free
code_scan: true           # deterministic, free
scan_block_on: high       # critical | high | medium | low | none
```

---

## When something does not appear

| What you see | What it means |
|---|---|
| `usage dashboard not mounted: set FORGE_DASHBOARD_TOKEN, or create an account…` | `FORGE_USAGE_DB` is set but no credential exists. Create an account. |
| Nothing about the dashboard in the log | `FORGE_USAGE_DB` is unset. Recording is off, so there is nothing to serve. |
| Dashboard loads, no runs in it | The agent is recording to a different path than the dashboard reads. Same file, both. |
| Signed in, then signed out after a deploy | The disk is not persistent. The database was replaced. |
| `{"error":"unauthorized"}` at `/usage/api/…` | Expected. That is the API; sign in through the page at `/usage`. |
| Scan comments, but no check run | The App is missing the **Checks: write** permission. |
| A pull request gets nothing at all | The App is not installed on that repository, or the webhook is not reaching you — check the App's Advanced → Recent Deliveries. |

---

## What it costs

Caching is what makes this affordable: the system prompt, every tool schema
and the growing transcript are cached, and repeated context bills at roughly a
tenth of the input rate. A review of a small pull request is cents.

`FORGE_SPEND_CAP_RUN` is enforced **inside** the loop — it stops before the
turn that would cross it, rather than reporting an overspend afterwards.

The dashboard shows exactly where it went: per run, per model, per repository,
per tool.
