# Usage dashboard — server setup

Every run, turn, tool call and dollar, on your own server. It holds repository
names, actor logins, pull-request numbers and error strings, so recording is
**off until you switch it on** and nothing is readable without a credential.

---

## 1. `.env` on the server

```bash
# ── Recording ────────────────────────────────────────────────────────────────
# A path on a PERSISTENT disk. This is the whole setup — accounts live in this
# file, not in an env var.
FORGE_USAGE_DB=/data/usage.db

# ── Access ───────────────────────────────────────────────────────────────────
# Optional. A never-expiring key for scripts and CI. Leave it unset if only
# people need to look — an account is enough on its own.
# FORGE_DASHBOARD_TOKEN=

# Only if the dashboard page is served from a different origin than the API.
# FORGE_DASHBOARD_ORIGIN=https://dashboard.example.com

# Standalone `forge dashboard` only; ignored when mounted on the App.
# FORGE_DASHBOARD_PORT=4300
```

The App reads `.env` on start. Actions does **not** — a workflow reads
repository secrets instead.

### The persistent disk is the part people get wrong

Artifacts are written next to the database, in `<same-dir>/artifacts`. So the
**directory** has to survive a redeploy, not just the file:

| Host | Mount |
|---|---|
| Render | Disk, mount path `/data` |
| Fly.io | Volume, `/data` |
| Docker | `-v forge-usage:/data` |
| Cloud Run | GCS/Filestore volume — the container filesystem is not persistent |

On ephemeral storage every account and every recorded run disappears on the
next deploy, silently.

---

## 2. Create an account

Run this **wherever the database is** — it writes to the file, not to a server.

```bash
forge dashboard:user add rahul
# New password:  (hidden — asked for, never passed as an argument)
# Repeat it:     (hidden)
# → Created "rahul". They can sign in at the dashboard now.
```

| Host | How to run it |
|---|---|
| Docker | `docker exec -it <container> node dist/cli.js dashboard:user add rahul` |
| Render / Fly | Open the service shell, then the command above |
| Cloud Run | Run it as a Job against the same volume — there is no interactive shell |
| Local | `npx forge dashboard:user add rahul` |

Minimum 12 characters. For scripted provisioning it also accepts a piped
password — still never in `argv`, where it would land in `ps`, in shell
history, and in a CI log:

```bash
printf '%s\n' "$INITIAL_PASSWORD" | forge dashboard:user add rahul
```

Afterwards:

```bash
forge dashboard:user list             # who can sign in, and when they last did
forge dashboard:user password rahul   # also signs out every session it had
forge dashboard:user remove rahul     # same
```

---

## 3. Sign in

The dashboard mounts at **`/usage`** on the App server. It mounts as soon as
*either* a token is set or one account exists — with neither it refuses to
mount and says so in the log, because that host is public by definition.

Open the dashboard → **Connection** → the form appears once the server reports
that accounts exist. Username and password get you a session that expires after
12 hours idle and can be revoked on its own.

---

## Two credentials, for two different things

| | For | Expires | Revocable alone |
|---|---|---|---|
| **Account** | People | 12h idle | Yes |
| **`FORGE_DASHBOARD_TOKEN`** | Scripts, CI | Never | No |

A password is stored only as an scrypt hash with its own salt, and a session
only as its SHA-256 — a copy of the database cannot be replayed as a login. A
wrong password and an unknown account give the same answer in the same time,
because telling them apart is how somebody enumerates accounts. Guessing is
throttled per username, so one account under attack cannot lock out the rest.

---

## Retention

Pruned automatically at startup. Runs, turns and findings are tiny and are the
trend data, so they are kept indefinitely; the bulky rows are not.

| Data | Kept |
|---|---|
| Transcripts | 14 days |
| Tool calls, diffs, findings, summaries | 90 days |
| Runs, turns, findings metadata | Forever |

Roughly 20 KB of metadata per run — a thousand runs a month is about 20 MB a
year. SQLite does not notice that.

---

## When it does not appear

| Log line | Means |
|---|---|
| `usage dashboard not mounted: set FORGE_DASHBOARD_TOKEN, or create an account…` | Neither credential exists. Create an account. |
| Nothing at all in the log | `FORGE_USAGE_DB` is unset. Recording is off, so there is nothing to serve. |
| Mounts, but no runs | The agent is recording to a different path than the dashboard reads. They must be the same file. |
| Signed in, then signed out | The disk is not persistent — the database was replaced on redeploy. |
