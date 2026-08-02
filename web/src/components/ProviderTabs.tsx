import { Code } from './Code';
import { Tabs, type Tab } from './Tabs';

/**
 * Setup for every supported provider, as a workflow snippet plus the equivalent
 * local environment. Each tab is self-contained so a reader can copy one block
 * and be running — no cross-referencing between tabs.
 */

const workflow = (name: string, body: string) => `# .github/workflows/forge.yml
- uses: shipiit/forge@v1
  with:
    provider: ${name}
${body}`;

const PROVIDERS: { id: string; label: string; hint: string; action: string; env: string }[] = [
  {
    id: 'anthropic',
    label: 'Anthropic',
    hint: 'Prompt caching and extended thinking are both supported here — the cheapest long runs of any provider.',
    action: workflow('anthropic', `    anthropic-api-key: \${{ secrets.ANTHROPIC_API_KEY }}
    model: claude-sonnet-4-5        # optional`),
    env: `LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-4-5   # optional
FORGE_THINKING_BUDGET=4096          # optional: extended thinking`,
  },
  {
    id: 'openai',
    label: 'OpenAI',
    hint: 'Reasoning models (o-series, gpt-5) are detected automatically and get reasoning_effort plus the right token field.',
    action: workflow('openai', `    openai-api-key: \${{ secrets.OPENAI_API_KEY }}
    model: gpt-4o                   # optional`),
    env: `LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o
FORGE_REASONING_EFFORT=medium       # o-series / gpt-5 only`,
  },
  {
    id: 'gemini',
    label: 'Gemini',
    hint: 'The Gemini Developer API — an API key, no cloud project required.',
    action: workflow('gemini', `    gemini-api-key: \${{ secrets.GEMINI_API_KEY }}
    model: gemini-2.5-pro           # optional`),
    env: `LLM_PROVIDER=gemini
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.5-pro`,
  },
  {
    id: 'vertex',
    label: 'Vertex AI',
    hint: 'Service-account auth for Google Cloud. Paste the JSON as a secret and it is written to a 0600 file at runtime.',
    action: workflow('vertex', `    vertex-credentials-json: \${{ secrets.VERTEX_CREDENTIALS_JSON }}
  env:
    VERTEX_PROJECT: my-gcp-project
    VERTEX_LOCATION: us-central1`),
    env: `LLM_PROVIDER=vertex
GOOGLE_APPLICATION_CREDENTIALS=/path/to/sa.json
VERTEX_PROJECT=my-gcp-project
VERTEX_LOCATION=us-central1
VERTEX_MODEL=gemini-2.5-pro`,
  },
  {
    id: 'bedrock',
    label: 'AWS Bedrock',
    hint: 'Uses the standard AWS credential chain — OIDC on Actions, an instance role in production. Prompt caching works on Anthropic models here too.',
    action: `# .github/workflows/forge.yml
- uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-assume: \${{ secrets.AWS_ROLE_TO_ASSUME }}
    aws-region: us-east-1

- uses: shipiit/forge@v1
  with:
    provider: bedrock`,
    env: `LLM_PROVIDER=bedrock
AWS_REGION=us-east-1
BEDROCK_MODEL_ID=anthropic.claude-3-5-sonnet-20241022-v2:0
# Credentials come from the standard AWS chain.`,
  },
  {
    id: 'groq',
    label: 'Groq',
    hint: 'Very fast open-weight inference. Text-only, so image attachments are skipped.',
    action: workflow('groq', `    max-output-tokens: "8192"
  env:
    GROQ_API_KEY: \${{ secrets.GROQ_API_KEY }}`),
    env: `LLM_PROVIDER=groq
GROQ_API_KEY=gsk_...
GROQ_MODEL=llama-3.3-70b-versatile`,
  },
  {
    id: 'together',
    label: 'Together',
    hint: 'A broad catalogue of open-weight models on one key.',
    action: workflow('together', `  env:
    TOGETHER_API_KEY: \${{ secrets.TOGETHER_API_KEY }}`),
    env: `LLM_PROVIDER=together
TOGETHER_API_KEY=...
TOGETHER_MODEL=meta-llama/Llama-3.3-70B-Instruct-Turbo`,
  },
  {
    id: 'ollama',
    label: 'Ollama',
    hint: 'Fully local — no key, no data leaving the machine. Best for the CLI and self-hosted runners.',
    action: `# Point at a runner that has Ollama running
- uses: shipiit/forge@v1
  with:
    provider: ollama
  env:
    OLLAMA_BASE_URL: http://localhost:11434/v1`,
    env: `LLM_PROVIDER=ollama
OLLAMA_MODEL=llama3.1
OLLAMA_BASE_URL=http://localhost:11434/v1   # optional`,
  },
  {
    id: 'compatible',
    label: 'Any OpenAI-compatible',
    hint: 'An internal gateway, a proxy, or any vendor that speaks /chat/completions.',
    action: workflow('openai-compatible', `  env:
    OPENAI_COMPATIBLE_BASE_URL: https://llm.internal/v1
    OPENAI_COMPATIBLE_API_KEY: \${{ secrets.GATEWAY_KEY }}
    OPENAI_COMPATIBLE_MODEL: our-model-v2`),
    env: `LLM_PROVIDER=openai-compatible
OPENAI_COMPATIBLE_BASE_URL=https://llm.internal/v1
OPENAI_COMPATIBLE_API_KEY=...
OPENAI_COMPATIBLE_MODEL=our-model-v2`,
  },
];

export function ProviderTabs() {
  const tabs: Tab[] = PROVIDERS.map((p) => ({
    id: p.id,
    label: p.label,
    hint: p.hint,
    content: (
      <div className="grid gap-4 lg:grid-cols-2">
        <Code label=".github/workflows/forge.yml" code={p.action} lang="yaml" />
        <Code label=".env — local & self-hosted" code={p.env} lang="bash" />
      </div>
    ),
  }));

  return (
    <>
      <Tabs tabs={tabs} ariaLabel="Provider setup" />
      <p className="mt-5 text-sm leading-relaxed text-muted">
        Set <code className="text-[rgb(var(--syn-keyword))]">FORGE_FALLBACK_PROVIDERS=bedrock,openai</code> to keep a
        run alive when the primary provider fails hard, and run{' '}
        <code className="text-[rgb(var(--syn-keyword))]">forge doctor</code> to see exactly what a machine has
        configured — it prints variable names only, never their values.
      </p>
    </>
  );
}
