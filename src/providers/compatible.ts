import { OpenAIAdapter } from './openai.js';
import type { LLMClient, ProviderId } from './types.js';

/**
 * Providers that expose an OpenAI-compatible `/chat/completions` endpoint. They
 * all reuse {@link OpenAIAdapter} — only the base URL, credential env var, and
 * default model differ — which is how one adapter covers four more providers
 * without a line of new wire-format code.
 */
export interface CompatibleSpec {
  id: ProviderId;
  label: string;
  baseURL: string;
  /** Credential env vars, in priority order. Empty means no key required. */
  keyEnv: string[];
  modelEnv: string;
  defaultModel: string;
  /** Most open-weight chat models are text-only. */
  supportsVision: boolean;
}

export const COMPATIBLE_PROVIDERS: Record<string, CompatibleSpec> = {
  groq: {
    id: 'groq',
    label: 'Groq',
    baseURL: 'https://api.groq.com/openai/v1',
    keyEnv: ['GROQ_API_KEY'],
    modelEnv: 'GROQ_MODEL',
    defaultModel: 'llama-3.3-70b-versatile',
    supportsVision: false,
  },
  together: {
    id: 'together',
    label: 'Together AI',
    baseURL: 'https://api.together.xyz/v1',
    keyEnv: ['TOGETHER_API_KEY', 'TOGETHERAI_API_KEY'],
    modelEnv: 'TOGETHER_MODEL',
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    supportsVision: false,
  },
  ollama: {
    id: 'ollama',
    label: 'Ollama (local)',
    baseURL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434/v1',
    keyEnv: [], // local server, no credentials
    modelEnv: 'OLLAMA_MODEL',
    defaultModel: 'llama3.1',
    supportsVision: false,
  },
  'openai-compatible': {
    id: 'openai-compatible',
    label: 'OpenAI-compatible endpoint',
    baseURL: process.env.OPENAI_COMPATIBLE_BASE_URL || '',
    keyEnv: ['OPENAI_COMPATIBLE_API_KEY'],
    modelEnv: 'OPENAI_COMPATIBLE_MODEL',
    defaultModel: '',
    supportsVision: false,
  },
};

export function isCompatibleProvider(id: string): boolean {
  return id in COMPATIBLE_PROVIDERS;
}

/** Build an adapter for one of the OpenAI-compatible providers. */
export function createCompatibleClient(
  spec: CompatibleSpec,
  opts: { model?: string; apiKey?: string; baseURL?: string } = {},
): LLMClient {
  const baseURL = opts.baseURL || spec.baseURL;
  if (!baseURL) {
    throw new Error(
      `${spec.label} needs a base URL. Set OPENAI_COMPATIBLE_BASE_URL to the endpoint's /v1 root.`,
    );
  }
  const model = opts.model || process.env[spec.modelEnv] || spec.defaultModel;
  if (!model) {
    throw new Error(`${spec.label} needs a model id. Set ${spec.modelEnv} or pass a model in config.`);
  }
  const apiKey = opts.apiKey || spec.keyEnv.map((n) => process.env[n]).find(Boolean) || 'not-needed';

  return new OpenAIAdapter({
    apiKey,
    baseURL,
    model,
    providerId: spec.id,
    supportsVision: spec.supportsVision,
  });
}
