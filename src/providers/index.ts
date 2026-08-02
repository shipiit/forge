import type { LLMClient, ProviderId } from './types.js';
import { FakeLLMClient } from './fake.js';
import { AnthropicAdapter } from './anthropic.js';
import { OpenAIAdapter } from './openai.js';
import { GeminiAdapter } from './gemini.js';
import { VertexAdapter } from './vertex.js';
import { BedrockAdapter } from './bedrock.js';
import { COMPATIBLE_PROVIDERS, createCompatibleClient, isCompatibleProvider } from './compatible.js';
import { FallbackClient } from './fallback.js';

export interface ProviderConfig {
  provider: ProviderId;
  /** Model id (provider-specific). Optional; adapters fall back to a default. */
  model?: string;
}

export const SUPPORTED_PROVIDERS: ProviderId[] = [
  'anthropic',
  'openai',
  'gemini',
  'vertex',
  'bedrock',
  'groq',
  'together',
  'ollama',
  'openai-compatible',
  'fake',
];

/**
 * What each provider needs from the environment. Used both to fail fast with an
 * actionable message and to power `forge doctor`.
 */
export interface ProviderRequirement {
  label: string;
  /** Credential env vars; at least one must be set. Empty = nothing required. */
  credentials: string[];
  /** Extra required env vars (all of them, not any). */
  required?: string[];
  /** Env var that overrides the model id. */
  modelEnv?: string;
}

export const PROVIDER_REQUIREMENTS: Record<string, ProviderRequirement> = {
  anthropic: { label: 'Anthropic', credentials: ['ANTHROPIC_API_KEY'], modelEnv: 'ANTHROPIC_MODEL' },
  openai: { label: 'OpenAI', credentials: ['OPENAI_API_KEY'], modelEnv: 'OPENAI_MODEL' },
  gemini: { label: 'Gemini API', credentials: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'], modelEnv: 'GEMINI_MODEL' },
  vertex: {
    label: 'Vertex AI',
    credentials: ['GOOGLE_APPLICATION_CREDENTIALS', 'VERTEX_CREDENTIALS_JSON'],
    required: ['VERTEX_PROJECT'],
    modelEnv: 'VERTEX_MODEL',
  },
  bedrock: { label: 'AWS Bedrock', credentials: [], required: ['AWS_REGION'], modelEnv: 'BEDROCK_MODEL_ID' },
  groq: { label: 'Groq', credentials: ['GROQ_API_KEY'], modelEnv: 'GROQ_MODEL' },
  together: {
    label: 'Together AI',
    credentials: ['TOGETHER_API_KEY', 'TOGETHERAI_API_KEY'],
    modelEnv: 'TOGETHER_MODEL',
  },
  ollama: { label: 'Ollama (local)', credentials: [], modelEnv: 'OLLAMA_MODEL' },
  'openai-compatible': {
    label: 'OpenAI-compatible endpoint',
    credentials: [],
    required: ['OPENAI_COMPATIBLE_BASE_URL'],
    modelEnv: 'OPENAI_COMPATIBLE_MODEL',
  },
  fake: { label: 'Fake (no credentials)', credentials: [] },
};

export interface CheckResult {
  provider: ProviderId;
  label: string;
  ok: boolean;
  /** Human-readable problems, empty when ok. */
  problems: string[];
  /** Env vars that are set (names only — never values). */
  satisfied: string[];
}

/**
 * Validate a provider's environment without making a network call. Returns the
 * problems rather than throwing, so `forge doctor` can report every provider.
 */
export function checkProvider(provider: ProviderId, env: NodeJS.ProcessEnv = process.env): CheckResult {
  const req = PROVIDER_REQUIREMENTS[provider];
  if (!req) {
    return {
      provider,
      label: provider,
      ok: false,
      problems: [`Unknown provider: ${provider}. Supported: ${SUPPORTED_PROVIDERS.join(', ')}`],
      satisfied: [],
    };
  }
  const problems: string[] = [];
  const satisfied: string[] = [];

  if (req.credentials.length > 0) {
    const found = req.credentials.filter((n) => env[n]);
    if (found.length === 0) {
      problems.push(`Missing credentials for ${req.label}. Set one of: ${req.credentials.join(', ')}`);
    } else {
      satisfied.push(...found);
    }
  }
  for (const name of req.required ?? []) {
    if (env[name]) satisfied.push(name);
    else problems.push(`${req.label} requires ${name}.`);
  }
  if (req.modelEnv && env[req.modelEnv]) satisfied.push(req.modelEnv);

  return { provider, label: req.label, ok: problems.length === 0, problems, satisfied };
}

/** A built-in demo script so `--provider fake` runs end-to-end with no credentials. */
function demoScript(task: string) {
  const fileMatch = task.match(/\b([\w./-]+\.\w+)\b/);
  const file = fileMatch?.[1] ?? 'FORGE_NOTES.md';
  return [
    {
      text: `I'll create ${file} to satisfy the task.`,
      toolCalls: [
        {
          id: 'demo1',
          name: 'write_file',
          args: { path: file, content: `# Created by ShipIT Forge (demo)\n\nTask: ${task}\n` },
        },
      ],
      usage: { inputTokens: 0, outputTokens: 0 },
      stopReason: 'tool_use' as const,
    },
    {
      text: `Done. Created ${file} for the task: "${task}".`,
      toolCalls: [],
      usage: { inputTokens: 0, outputTokens: 0 },
      stopReason: 'end' as const,
    },
  ];
}

/** Construct a single adapter, with no fallback wrapping. */
function createSingleClient(config: ProviderConfig, opts: { demoTask?: string } = {}): LLMClient {
  const provider = config.provider;

  if (provider === 'fake') {
    return new FakeLLMClient(opts.demoTask ? demoScript(opts.demoTask) : []);
  }

  const check = checkProvider(provider);
  if (!check.ok) throw new Error(check.problems.join(' '));

  switch (provider) {
    case 'anthropic':
      return new AnthropicAdapter({ apiKey: process.env.ANTHROPIC_API_KEY, model: config.model });
    case 'openai':
      return new OpenAIAdapter({ apiKey: process.env.OPENAI_API_KEY, model: config.model });
    case 'gemini':
      return new GeminiAdapter({ model: config.model });
    case 'vertex':
      return new VertexAdapter({ model: config.model });
    case 'bedrock':
      return new BedrockAdapter({ model: config.model });
    default:
      if (isCompatibleProvider(provider)) {
        return createCompatibleClient(COMPATIBLE_PROVIDERS[provider]!, { model: config.model });
      }
      throw new Error(`Unknown provider: ${provider as string}. Supported: ${SUPPORTED_PROVIDERS.join(', ')}`);
  }
}

/**
 * Build an {@link LLMClient} from configuration. The provider is chosen by
 * `config.provider`; credentials are read from the standard environment
 * variables for that provider (see README) and validated up front so a
 * misconfiguration fails with an actionable message instead of an SDK stack
 * trace mid-run.
 *
 * Set `FORGE_FALLBACK_PROVIDERS` (comma-separated) to keep a run alive when the
 * primary provider fails hard — e.g. `FORGE_FALLBACK_PROVIDERS=bedrock,openai`.
 * Fallbacks that are not themselves configured are skipped silently rather than
 * breaking startup.
 */
export function createLLMClient(
  config: ProviderConfig,
  opts: { demoTask?: string; log?: (msg: string) => void } = {},
): LLMClient {
  const primary = createSingleClient(config, opts);

  const chain = (process.env.FORGE_FALLBACK_PROVIDERS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((p) => p !== config.provider) as ProviderId[];
  if (chain.length === 0) return primary;

  const fallbacks: LLMClient[] = [];
  for (const id of chain) {
    try {
      fallbacks.push(createSingleClient({ provider: id }, opts));
    } catch (err) {
      opts.log?.(`fallback provider ${id} unavailable: ${(err as Error).message}`);
    }
  }
  return fallbacks.length > 0 ? new FallbackClient(primary, fallbacks, opts.log) : primary;
}

export { FakeLLMClient } from './fake.js';
export { FallbackClient } from './fallback.js';
