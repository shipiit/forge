import { Check } from 'lucide-react';
import { Code } from './Code';
import { Tabs } from './Tabs';
import { Walkthrough } from './GuideBits';

/**
 * Installing Forge as a GitHub App.
 *
 * The section that matters most here is the permission table: each permission
 * maps to specific capabilities, so a reader can see exactly what they are
 * granting and exactly what it turns on — and can grant less if they want less.
 */

const PERMISSIONS: { scope: string; access: string; unlocks: string[] }[] = [
  {
    scope: 'Contents',
    access: 'Read & write',
    unlocks: ['Clone the repository', 'Push fix branches', 'Open the change-history PR'],
  },
  {
    scope: 'Pull requests',
    access: 'Read & write',
    unlocks: ['Read the diff under review', 'Post inline review comments', 'Open pull requests'],
  },
  {
    scope: 'Issues',
    access: 'Read & write',
    unlocks: ['Read issues and threads', 'Post and update its own comments', 'Apply the review-always label'],
  },
  {
    scope: 'Checks',
    access: 'Read & write',
    unlocks: ['Post the review check run', 'Write the severity table and annotations'],
  },
  {
    scope: 'Actions',
    access: 'Read',
    unlocks: ['Read failing CI logs so it can auto-fix a red build'],
  },
  {
    scope: 'Metadata',
    access: 'Read',
    unlocks: ['Mandatory for every GitHub App'],
  },
];

const EVENTS = [
  ['issues', 'opened, labeled — analysis and the fix flow'],
  ['issue_comment', 'created — /fix, /review, /audit, /run, and @mentions'],
  ['pull_request', 'opened, synchronize, closed — review and change history'],
  ['pull_request_review_comment', 'created — @mentions inside a diff thread'],
  ['check_suite / workflow_run', 'completed — CI auto-fix on its own branches'],
  ['release', 'published — release notes'],
];

function PermissionTable() {
  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.08]">
      <div className="hidden grid-cols-[160px_130px_1fr] gap-4 border-b border-white/[0.08] bg-white/[0.02] px-5 py-3 text-[11px] uppercase tracking-[0.16em] text-muted sm:grid">
        <span>Permission</span>
        <span>Access</span>
        <span>What it turns on</span>
      </div>
      {PERMISSIONS.map((p, i) => (
        <div
          key={p.scope}
          className={`grid grid-cols-1 gap-2 px-5 py-4 transition-colors hover:bg-white/[0.02] sm:grid-cols-[160px_130px_1fr] sm:gap-4 ${
            i ? 'border-t border-white/[0.08]' : ''
          }`}
        >
          <span className="text-[14px] font-semibold">{p.scope}</span>
          <span className="text-sm text-[rgb(var(--syn-keyword))]">{p.access}</span>
          <ul className="space-y-1">
            {p.unlocks.map((u) => (
              <li key={u} className="flex gap-2 text-sm leading-relaxed text-muted">
                <Check size={13} className="mt-1 shrink-0 text-[rgb(var(--syn-string))]" />
                <span>{u}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function AppInstall() {
  return (
    <Tabs
      ariaLabel="GitHub App setup"
      tabs={[
        {
          id: 'install',
          label: '1 · Install',
          hint: 'Four steps, once per organization. After this every repository you selected is covered — there is no per-repo file to commit.',
          content: (
            <div className="grid gap-6 lg:grid-cols-2">
              <Walkthrough steps={[
                ['Register the App', 'GitHub → Settings → Developer settings → GitHub Apps → New. Or point it at the app.yml in the repo, which pre-fills every permission and event below.'],
                ['Grant the permissions', 'The six scopes in the next tab. Each one maps to specific capabilities — grant less and those capabilities simply stay off.'],
                ['Install on the organization', 'Choose "All repositories" so new repos are covered automatically, or pick a subset to start.'],
                ['Deploy the webhook server', 'Render, Cloud Run, or any Docker host with a public HTTPS URL. Set the App’s webhook URL to it and paste the same webhook secret.'],
              ]} />
              <div>
                <Code label="app.yml — pre-fills the App registration" lang="yaml" code={`default_permissions:
  contents: write
  pull_requests: write
  issues: write
  checks: write
  actions: read
  metadata: read

default_events:
  - issues
  - issue_comment
  - pull_request
  - pull_request_review_comment
  - check_suite
  - workflow_run
  - release`} />
                <Code label="server environment" lang="bash" code={`APP_ID=123456
PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\\n..."
WEBHOOK_SECRET=...

LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...`} />
              </div>
            </div>
          ),
        },
        {
          id: 'permissions',
          label: '2 · Permissions',
          hint: 'Exactly what you are granting, and exactly what each grant switches on. Once these are approved, every capability below runs automatically on the matching event — there is nothing else to enable.',
          content: (
            <div>
              <PermissionTable />
              <div className="mt-6 grid gap-px overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.06] md:grid-cols-3">
                {[
                  ['Never merges', 'Forge has no merge permission and never approves a PR. The check run is always neutral, so it cannot block one either.'],
                  ['Its own branches only', 'CI auto-fix touches only forge/* branches. It can never rewrite someone else’s work.'],
                  ['Ephemeral clones', 'Each run clones into a temp directory that is deleted afterwards. Nothing persists between runs.'],
                ].map(([t, d]) => (
                  <div key={t} className="bg-[rgb(11_11_14)] p-6">
                    <h4 className="text-[15px] font-semibold">{t}</h4>
                    <p className="mt-2 text-sm leading-relaxed text-muted">{d}</p>
                  </div>
                ))}
              </div>
            </div>
          ),
        },
        {
          id: 'deploy',
          label: '3 · Deploy & webhook',
          hint: 'The App is just a GitHub registration — it needs somewhere to send events. That somewhere is a small HTTP server you host, so your code and your keys never leave infrastructure you control.',
          content: (
            <div className="space-y-6">
              <div className="grid gap-px overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.06] md:grid-cols-3">
                {[
                  ['Render', 'Connect the repo, pick Docker, add the environment variables. Free tier is enough — the server idles at zero cost between events.', 'render.yaml is in the repo'],
                  ['Google Cloud Run', 'One command: ./deploy/cloudrun.sh. Scales to zero, so you pay only while an event is being handled.', 'deploy/cloudrun.sh'],
                  ['Any Docker host', 'Railway, Fly.io, ECS, or a VPS behind nginx. The only requirement is a public HTTPS URL.', 'Dockerfile'],
                ].map(([t, d, hint]) => (
                  <div key={t} className="bg-[rgb(11_11_14)] p-6">
                    <h4 className="text-[15px] font-semibold">{t}</h4>
                    <p className="mt-2 text-sm leading-relaxed text-muted">{d}</p>
                    <code className="mt-3 inline-block rounded-full border border-white/10 px-2.5 py-0.5 text-[11px] text-[rgb(var(--syn-keyword))]">{hint}</code>
                  </div>
                ))}
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <div>
                  <h4 className="text-[15px] font-semibold">Step by step</h4>
                  <Walkthrough steps={[
                    ['Generate a webhook secret', 'Any long random string. GitHub signs every delivery with it and the server rejects anything that does not match — without it, anyone who learns your URL could forge events.'],
                    ['Deploy the server', 'Build the Dockerfile and set the environment below. It listens on $PORT and needs no database, no queue, and no volume — state lives in GitHub.'],
                    ['Copy the public URL', 'Render and Cloud Run both hand you an HTTPS URL. That URL plus /api/github/webhooks is your webhook endpoint.'],
                    ['Point the App at it', 'In the App settings: set Webhook URL, paste the same secret, tick Active, save.'],
                    ['Generate the private key', 'App settings → Private keys → Generate. Paste the whole PEM into PRIVATE_KEY, newlines and all — most hosts accept a multi-line value directly.'],
                    ['Redeploy and test', 'Open an issue on an installed repository. A comment should appear within a minute.'],
                  ]} />
                </div>

                <div>
                  <Code label="server environment — all of it" lang="bash" code={`# --- GitHub App identity -------------------------------
APP_ID=123456
WEBHOOK_SECRET=<the long random string you generated>
PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----
MIIEow...the whole PEM...
-----END RSA PRIVATE KEY-----"

# --- your model ----------------------------------------
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...

# --- optional org-wide defaults ------------------------
FORGE_AUTO_REVIEW=always
FORGE_HISTORY=1
FORGE_MAX_OUTPUT_TOKENS=16384
FORGE_FALLBACK_PROVIDERS=bedrock,openai`} />
                  <Code label="generate a webhook secret" lang="bash" code={`openssl rand -hex 32
# → 9f2c...  paste the SAME value into the App settings
#    and into WEBHOOK_SECRET on the server.`} />
                </div>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <div className="panel p-6">
                  <h4 className="text-[15px] font-semibold">Where the webhook points</h4>
                  <p className="mt-2 text-sm leading-relaxed text-muted">
                    The server exposes one endpoint. Append the path to whatever host you deployed to:
                  </p>
                  <Code label="Webhook URL — App settings → General" lang="bash" code={`https://forge.your-company.com/api/github/webhooks

# Render:     https://<service>.onrender.com/api/github/webhooks
# Cloud Run:  https://<service>-<hash>.run.app/api/github/webhooks`} />
                  <p className="mt-1 text-sm leading-relaxed text-muted">
                    Content type <code className="text-white/80">application/json</code>. GitHub will send a ping
                    immediately — a green tick under <span className="text-text">Recent Deliveries</span> means the
                    URL and secret are both correct.
                  </p>
                </div>

                <div className="panel p-6">
                  <h4 className="text-[15px] font-semibold">Developing without deploying</h4>
                  <p className="mt-2 text-sm leading-relaxed text-muted">
                    Probot prints a <code className="text-white/80">smee.io</code> proxy URL on first run. Use it as
                    the webhook URL and real GitHub events reach your laptop — no tunnel to configure, nothing
                    public to expose.
                  </p>
                  <Code label="bash" lang="bash" code={`npm install && npm run build
npm run dev

# → Listening on http://localhost:3000
# → Connected to https://smee.io/AbCdEf123
#   Paste that smee URL into the App's Webhook URL
#   while you develop, then switch it to your
#   deployed host when you go live.`} />
                </div>
              </div>

              <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.04] p-5">
                <p className="text-sm leading-relaxed text-muted">
                  <span className="font-semibold text-amber-200/90">Where the work actually happens.</span> The
                  server is only a dispatcher: it verifies the signature, works out what the event means, and runs
                  the agent. Each run clones the repository into a temporary directory on that host, works there,
                  pushes a branch, and deletes the directory. Your code reaches exactly two places — your own
                  server, and the LLM provider whose key you configured. Nothing is stored between runs.
                </p>
              </div>
            </div>
          ),
        },
        {
          id: 'events',
          label: '4 · Events',
          hint: 'The App subscribes to these. Each one is routed by a pure function shared with the Action, so both surfaces behave identically.',
          content: (
            <div className="overflow-hidden rounded-xl border border-white/[0.08]">
              {EVENTS.map(([evt, what], i) => (
                <div
                  key={evt}
                  className={`grid grid-cols-1 gap-1.5 px-5 py-4 transition-colors hover:bg-white/[0.02] sm:grid-cols-[300px_1fr] ${
                    i ? 'border-t border-white/[0.08]' : ''
                  }`}
                >
                  <code className="text-[13px] text-[rgb(var(--syn-keyword))]">{evt}</code>
                  <span className="text-sm leading-relaxed text-muted">{what}</span>
                </div>
              ))}
            </div>
          ),
        },
        {
          id: 'verify',
          label: '5 · Verify',
          hint: 'Two minutes to confirm the whole path — webhook delivery, credentials, and a real run.',
          content: (
            <div className="grid gap-6 lg:grid-cols-2">
              <Walkthrough steps={[
                ['Check the credentials', 'Run forge doctor on the server. It prints which provider is active and what is missing — variable names only, never values.'],
                ['Open a test issue', 'Forge posts an analysis comment within a minute or two. If nothing appears, check Recent Deliveries on the App’s Advanced tab.'],
                ['Comment /fix', 'It opens a pull request with the change and the tests it ran.'],
                ['Open any PR', 'A review appears, plus a "ShipIT Forge Review" check run alongside your CI.'],
              ]} />
              <div>
                <Code label="on the server" lang="bash" code={`forge doctor

# 🩺 ShipIT Forge — environment check
#
# Active provider: anthropic (Anthropic) — ✅ ready
#
# Providers:
#   ✅ anthropic    via ANTHROPIC_API_KEY
#      openai       Missing credentials. Set one of: OPENAI_API_KEY
#
# Settings:
#   FORGE_MAX_OUTPUT_TOKENS   16384 (default)
#   FORGE_PROMPT_CACHE        on (default)`} />
                <p className="mt-3 text-sm leading-relaxed text-muted">
                  Prefer no server at all? The GitHub Action does the same work inside your own CI — see the next
                  tab of the org section.
                </p>
              </div>
            </div>
          ),
        },
      ]}
    />
  );
}
