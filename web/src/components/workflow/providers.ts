/**
 * What each provider actually needs.
 *
 * Providers differ in more than a key name: Vertex wants a project and a
 * location, Bedrock takes credentials from the AWS chain rather than an input,
 * and a compatible endpoint needs a base URL and an explicit model. Keeping all
 * of that in one table means the form, the validation, and the generated file
 * can never disagree about a provider's requirements.
 */

export interface ExtraEnv {
  /** Environment variable name emitted into the workflow's `env:` block. */
  name: string;
  label: string;
  hint: string;
  placeholder: string;
  required: boolean;
}

export interface ProviderMeta {
  id: string;
  label: string;
  hint: string;
  /** The Action input that carries the credential. Empty when there isn't one. */
  secretInput: string;
  /** Suggested secret name for that input. */
  defaultSecret: string;
  /** Shown as the model placeholder — the provider's own default. */
  defaultModel: string;
  /** Extra environment variables this provider needs. */
  extraEnv: ExtraEnv[];
  /** Rendered instead of a secret field when there is no credential input. */
  credentialNote?: string;
  /** Steps that must run before the Forge step. */
  preSteps?: string[];
}

export const PROVIDERS: ProviderMeta[] = [
  {
    id: 'anthropic',
    label: 'Anthropic',
    hint: 'Prompt caching + extended thinking — cheapest for long runs',
    secretInput: 'anthropic-api-key',
    defaultSecret: 'ANTHROPIC_API_KEY',
    defaultModel: 'claude-sonnet-4-5',
    extraEnv: [],
  },
  {
    id: 'openai',
    label: 'OpenAI',
    hint: 'Reasoning models (o-series, gpt-5) detected automatically',
    secretInput: 'openai-api-key',
    defaultSecret: 'OPENAI_API_KEY',
    defaultModel: 'gpt-4o',
    extraEnv: [],
  },
  {
    id: 'gemini',
    label: 'Gemini',
    hint: 'API key only — no cloud project needed',
    secretInput: 'gemini-api-key',
    defaultSecret: 'GEMINI_API_KEY',
    defaultModel: 'gemini-2.5-pro',
    extraEnv: [],
  },
  {
    id: 'vertex',
    label: 'Vertex AI',
    hint: 'Google Cloud service account — needs a project and a region',
    secretInput: 'vertex-credentials-json',
    defaultSecret: 'VERTEX_CREDENTIALS_JSON',
    defaultModel: 'gemini-2.5-pro',
    extraEnv: [
      {
        name: 'VERTEX_PROJECT',
        label: 'GCP project id',
        hint: 'The project your Vertex AI models live in.',
        placeholder: 'my-gcp-project',
        required: true,
      },
      {
        name: 'VERTEX_LOCATION',
        label: 'Region',
        hint: 'Defaults to us-central1 when left empty.',
        placeholder: 'us-central1',
        required: false,
      },
    ],
  },
  {
    id: 'bedrock',
    label: 'AWS Bedrock',
    hint: 'Standard AWS credential chain — use OIDC, no static keys',
    secretInput: '',
    defaultSecret: '',
    defaultModel: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    credentialNote:
      'Bedrock reads the standard AWS credential chain, so there is no key input. The generated file assumes an OIDC role — add AWS_ROLE_TO_ASSUME as a secret.',
    preSteps: [
      '      - uses: aws-actions/configure-aws-credentials@v4',
      '        with:',
      '          role-to-assume: ${{ secrets.AWS_ROLE_TO_ASSUME }}',
      '          aws-region: ${AWS_REGION}',
    ],
    extraEnv: [
      {
        name: 'AWS_REGION',
        label: 'AWS region',
        hint: 'Where your Bedrock models are enabled.',
        placeholder: 'us-east-1',
        required: true,
      },
    ],
  },
  {
    id: 'groq',
    label: 'Groq',
    hint: 'Fast open-weight inference. Text only — images are skipped',
    secretInput: '',
    defaultSecret: 'GROQ_API_KEY',
    defaultModel: 'llama-3.3-70b-versatile',
    credentialNote: 'Groq reads GROQ_API_KEY from the environment — set it below and it lands in the env block.',
    extraEnv: [
      {
        name: 'GROQ_API_KEY',
        label: 'Secret reference',
        hint: 'The secret holding your Groq key.',
        placeholder: '${{ secrets.GROQ_API_KEY }}',
        required: true,
      },
    ],
  },
  {
    id: 'together',
    label: 'Together',
    hint: 'A broad open-weight catalogue on one key',
    secretInput: '',
    defaultSecret: 'TOGETHER_API_KEY',
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    credentialNote: 'Together reads TOGETHER_API_KEY from the environment.',
    extraEnv: [
      {
        name: 'TOGETHER_API_KEY',
        label: 'Secret reference',
        hint: 'The secret holding your Together key.',
        placeholder: '${{ secrets.TOGETHER_API_KEY }}',
        required: true,
      },
    ],
  },
  {
    id: 'ollama',
    label: 'Ollama',
    hint: 'Fully local — no key, nothing leaves the runner',
    secretInput: '',
    defaultSecret: '',
    defaultModel: 'llama3.1',
    credentialNote:
      'Ollama needs no credentials. Point it at a runner that already has Ollama running — usually a self-hosted one.',
    extraEnv: [
      {
        name: 'OLLAMA_BASE_URL',
        label: 'Ollama endpoint',
        hint: 'Defaults to http://localhost:11434/v1 when left empty.',
        placeholder: 'http://localhost:11434/v1',
        required: false,
      },
    ],
  },
  {
    id: 'openai-compatible',
    label: 'OpenAI-compatible',
    hint: 'Any internal gateway or proxy speaking /chat/completions',
    secretInput: '',
    defaultSecret: '',
    defaultModel: '',
    credentialNote: 'A compatible endpoint needs its base URL and an explicit model — there is no default to fall back on.',
    extraEnv: [
      {
        name: 'OPENAI_COMPATIBLE_BASE_URL',
        label: 'Base URL',
        hint: 'The /v1 root of your endpoint.',
        placeholder: 'https://llm.internal/v1',
        required: true,
      },
      {
        name: 'OPENAI_COMPATIBLE_API_KEY',
        label: 'Secret reference',
        hint: 'Leave empty if the endpoint needs no key.',
        placeholder: '${{ secrets.GATEWAY_KEY }}',
        required: false,
      },
      {
        name: 'OPENAI_COMPATIBLE_MODEL',
        label: 'Model id',
        hint: 'Required — this provider has no default model.',
        placeholder: 'our-model-v2',
        required: true,
      },
    ],
  },
];

export function providerMeta(id: string): ProviderMeta {
  return PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0]!;
}
