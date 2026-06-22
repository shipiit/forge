import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CodeBlock } from './CodeBlock';

const ext = { target: '_blank', rel: 'noopener noreferrer' } as const;

type Step = { t: string; d: React.ReactNode };
type Provider = {
  key: string;
  name: string;
  badge: string;          // LLM_PROVIDER value
  model: string;          // default model id
  blurb: string;
  steps: Step[];
  env: string;
  cli: string;
  action: string;
  app: string;
};

const A = (href: string, label: string) => (
  <a href={href} {...ext} className="text-white/80 underline decoration-white/20 underline-offset-2 hover:decoration-white/60">{label}</a>
);

const PROVIDERS: Provider[] = [
  {
    key: 'anthropic',
    name: 'Anthropic',
    badge: 'anthropic',
    model: 'claude-opus-4-8',
    blurb: 'The fastest to set up — just an API key. Claude models are strong at code edits and security review.',
    steps: [
      { t: 'Create an API key', d: <>Open {A('https://console.anthropic.com/settings/keys', 'console.anthropic.com → API Keys')} → <b>Create Key</b>. Copy the <code className="text-white/80">sk-ant-…</code> value (shown once).</> },
      { t: 'Add billing', d: <>Add a payment method under <b>Plans &amp; Billing</b> so requests aren’t rejected with a quota error.</> },
      { t: 'Give the key to Forge', d: <>Run <code className="text-white/80">node dist/cli.js setup</code> and paste it, or set the env vars below.</> },
    ],
    env: `LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-xxxxxxxx
ANTHROPIC_MODEL=claude-opus-4-8   # optional`,
    cli: `export ANTHROPIC_API_KEY=sk-ant-...
node dist/cli.js fix --repo . --task "fix the failing test" --provider anthropic`,
    action: `# repo/org secret: ANTHROPIC_API_KEY
with:  { provider: anthropic }
env:   { ANTHROPIC_API_KEY: \${{ secrets.ANTHROPIC_API_KEY }} }`,
    app: `# on the server
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...`,
  },
  {
    key: 'openai',
    name: 'OpenAI',
    badge: 'openai',
    model: 'gpt-4o',
    blurb: 'A single API key. GPT-4o is vision-capable, so Forge can read screenshots in issues and PRs.',
    steps: [
      { t: 'Create a secret key', d: <>Open {A('https://platform.openai.com/api-keys', 'platform.openai.com/api-keys')} → <b>Create new secret key</b>. Copy the <code className="text-white/80">sk-…</code> value.</> },
      { t: 'Fund the account', d: <>Add credit under <b>Billing</b> — new keys start with a $0 balance and will 429 until funded.</> },
      { t: 'Give the key to Forge', d: <>Run the <code className="text-white/80">setup</code> wizard or set the env vars below.</> },
    ],
    env: `LLM_PROVIDER=openai
OPENAI_API_KEY=sk-xxxxxxxx
OPENAI_MODEL=gpt-4o   # optional`,
    cli: `export OPENAI_API_KEY=sk-...
node dist/cli.js fix --repo . --task "fix the failing test" --provider openai`,
    action: `# repo/org secret: OPENAI_API_KEY
with:  { provider: openai }
env:   { OPENAI_API_KEY: \${{ secrets.OPENAI_API_KEY }} }`,
    app: `# on the server
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...`,
  },
  {
    key: 'vertex',
    name: 'Vertex Gemini',
    badge: 'vertex',
    model: 'gemini-2.5-pro',
    blurb: 'Google Cloud’s Gemini via a service account. No per-token key — auth is the service-account JSON (or the Cloud Run runtime identity).',
    steps: [
      { t: 'Enable the Vertex AI API', d: <>Pick or create a GCP project, then enable {A('https://console.cloud.google.com/apis/library/aiplatform.googleapis.com', 'the Vertex AI API')}.</> },
      { t: 'Create a service account', d: <>{A('https://console.cloud.google.com/iam-admin/serviceaccounts', 'IAM &amp; Admin → Service Accounts')} → <b>Create</b> → grant the role <code className="text-white/80">Vertex AI User</code> (<code className="text-white/80">roles/aiplatform.user</code>).</> },
      { t: 'Download a JSON key', d: <>On the service account → <b>Keys → Add key → JSON</b>. Keep the file private — never commit it.</> },
      { t: 'Give it to Forge', d: <>Run <code className="text-white/80">node dist/cli.js setup</code> and paste the JSON (saved <code className="text-white/80">chmod 600</code>, gitignored), or point <code className="text-white/80">GOOGLE_APPLICATION_CREDENTIALS</code> at the file.</> },
    ],
    env: `LLM_PROVIDER=vertex
VERTEX_PROJECT=your-gcp-project
VERTEX_LOCATION=us-central1
VERTEX_MODEL=gemini-2.5-pro
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json`,
    cli: `node dist/cli.js setup            # paste the JSON, or:
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json
node dist/cli.js fix --repo . --task "..." --provider vertex`,
    action: `# secret VERTEX_SA_JSON (paste whole JSON) + var VERTEX_PROJECT
with:  { provider: vertex }
env:
  LLM_PROVIDER: vertex
  VERTEX_PROJECT: \${{ vars.VERTEX_PROJECT }}
  VERTEX_CREDENTIALS_JSON: \${{ secrets.VERTEX_SA_JSON }}`,
    app: `# On Cloud Run, skip the key file entirely:
# grant the Cloud Run service account roles/aiplatform.user
# (deploy/cloudrun.sh does this) — auth uses the runtime identity.`,
  },
  {
    key: 'bedrock',
    name: 'AWS Bedrock',
    badge: 'bedrock',
    model: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    blurb: 'Run Claude (or other models) through your own AWS account. Auth via IAM keys or an attached role.',
    steps: [
      { t: 'Enable model access', d: <>In the AWS console → {A('https://console.aws.amazon.com/bedrock/home#/modelaccess', 'Bedrock → Model access')}, request/enable the model you want (e.g. Anthropic Claude) <b>in your region</b>.</> },
      { t: 'Create credentials', d: <>An IAM user or role with the <code className="text-white/80">bedrock:InvokeModel</code> permission. On EC2/ECS/Lambda you can use an attached role instead of keys.</> },
      { t: 'Set the region + model id', d: <>The <code className="text-white/80">BEDROCK_MODEL_ID</code> must exist and be enabled in <code className="text-white/80">AWS_REGION</code>.</> },
    ],
    env: `LLM_PROVIDER=bedrock
AWS_REGION=us-east-1
BEDROCK_MODEL_ID=anthropic.claude-3-5-sonnet-20241022-v2:0
AWS_ACCESS_KEY_ID=AKIA...          # or an attached IAM role
AWS_SECRET_ACCESS_KEY=...`,
    cli: `export AWS_REGION=us-east-1 AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=...
node dist/cli.js fix --repo . --task "..." --provider bedrock`,
    action: `# secrets AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
with:  { provider: bedrock }
env:
  LLM_PROVIDER: bedrock
  AWS_REGION: us-east-1
  BEDROCK_MODEL_ID: anthropic.claude-3-5-sonnet-20241022-v2:0`,
    app: `# on the server
LLM_PROVIDER=bedrock
AWS_REGION=us-east-1
BEDROCK_MODEL_ID=anthropic.claude-3-5-sonnet-20241022-v2:0
AWS_ACCESS_KEY_ID=...  AWS_SECRET_ACCESS_KEY=...`,
  },
];

export function ProviderSetup() {
  const [active, setActive] = useState('anthropic');
  const [usage, setUsage] = useState(0);
  const p = PROVIDERS.find((x) => x.key === active)!;
  const USAGES = [
    { tab: 'CLI', label: 'terminal', code: p.cli },
    { tab: 'GitHub Action', label: '.github/workflows/forge.yml', code: p.action },
    { tab: 'Hosted App', label: 'server env', code: p.app },
  ] as const;
  const u = USAGES[usage];

  return (
    <div className="mt-5">
      {/* tabs */}
      <div className="flex flex-wrap gap-2">
        {PROVIDERS.map((x) => (
          <button
            key={x.key}
            onClick={() => setActive(x.key)}
            className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
              x.key === active ? 'border-white/40 bg-white/10 text-white' : 'border-white/10 text-muted hover:border-white/25 hover:text-text'
            }`}
          >
            {x.name}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={p.key}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.25 }}
          className="panel mt-5 p-6"
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h3 className="text-xl font-semibold">{p.name}</h3>
            <code className="rounded bg-white/5 px-2 py-0.5 text-xs text-white/70">LLM_PROVIDER={p.badge}</code>
            <code className="rounded bg-white/5 px-2 py-0.5 text-xs text-white/70">default: {p.model}</code>
          </div>
          <p className="mt-2 text-sm text-muted">{p.blurb}</p>

          <ol className="mt-5 space-y-4">
            {p.steps.map((s, i) => (
              <li key={i} className="flex gap-4">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/15 text-xs tabular-nums text-white/80">{i + 1}</span>
                <div>
                  <div className="font-medium">{s.t}</div>
                  <div className="mt-0.5 text-sm leading-relaxed text-muted">{s.d}</div>
                </div>
              </li>
            ))}
          </ol>

          <p className="mt-6 mb-2 text-xs uppercase tracking-[0.16em] text-muted">Environment variables</p>
          <CodeBlock label=".env" code={p.env} />

          {/* usage switcher — full width, no clipping */}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs uppercase tracking-[0.16em] text-muted">Use it</p>
            <div className="inline-flex rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
              {USAGES.map((x, i) => (
                <button
                  key={x.tab}
                  onClick={() => setUsage(i)}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                    i === usage ? 'bg-white/10 text-white' : 'text-muted hover:text-text'
                  }`}
                >
                  <span className="mr-1 tabular-nums text-white/40">{i + 1}</span>{x.tab}
                </button>
              ))}
            </div>
          </div>
          <AnimatePresence mode="wait">
            <motion.div key={u.tab} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="mt-2">
              <CodeBlock label={u.label} code={u.code} />
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </AnimatePresence>

      <p className="mt-4 text-sm text-muted">
        🔐 The safest path is <code className="text-white/80">node dist/cli.js setup</code> — it writes a{' '}
        <b>gitignored <code className="text-white/80">.env</code> with <code className="text-white/80">chmod 600</code></b>, so your key is never committed.
      </p>
    </div>
  );
}
