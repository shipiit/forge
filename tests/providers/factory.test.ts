import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { ChatRequest, ChatResult, LLMClient, ProviderId } from '../../src/providers/types.js';
import {
  SUPPORTED_PROVIDERS,
  checkProvider,
  createLLMClient,
  FallbackClient,
} from '../../src/providers/index.js';
import { COMPATIBLE_PROVIDERS, createCompatibleClient } from '../../src/providers/compatible.js';

const ENV_KEYS = [
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'GEMINI_API_KEY',
  'GOOGLE_API_KEY',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'VERTEX_CREDENTIALS_JSON',
  'VERTEX_PROJECT',
  'AWS_REGION',
  'GROQ_API_KEY',
  'TOGETHER_API_KEY',
  'TOGETHERAI_API_KEY',
  'OPENAI_COMPATIBLE_BASE_URL',
  'OPENAI_COMPATIBLE_MODEL',
  'FORGE_FALLBACK_PROVIDERS',
  'ANTHROPIC_MODEL',
];

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
});

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe('provider requirements check', () => {
  it('reports a missing credential with an actionable message', () => {
    const res = checkProvider('anthropic', {} as NodeJS.ProcessEnv);
    expect(res.ok).toBe(false);
    expect(res.problems[0]).toContain('ANTHROPIC_API_KEY');
  });

  it('accepts any one of several alternative credentials', () => {
    expect(checkProvider('gemini', { GOOGLE_API_KEY: 'x' } as NodeJS.ProcessEnv).ok).toBe(true);
    expect(checkProvider('gemini', { GEMINI_API_KEY: 'x' } as NodeJS.ProcessEnv).ok).toBe(true);
    expect(checkProvider('gemini', {} as NodeJS.ProcessEnv).ok).toBe(false);
  });

  it('requires every "required" var, not just one', () => {
    const res = checkProvider('vertex', { GOOGLE_APPLICATION_CREDENTIALS: '/tmp/sa.json' } as NodeJS.ProcessEnv);
    expect(res.ok).toBe(false);
    expect(res.problems.join(' ')).toContain('VERTEX_PROJECT');
  });

  it('needs no credentials for local providers', () => {
    expect(checkProvider('ollama', {} as NodeJS.ProcessEnv).ok).toBe(true);
    expect(checkProvider('fake', {} as NodeJS.ProcessEnv).ok).toBe(true);
  });

  it('flags an unknown provider and lists the supported ones', () => {
    const res = checkProvider('nope' as ProviderId, {} as NodeJS.ProcessEnv);
    expect(res.ok).toBe(false);
    expect(res.problems[0]).toContain('anthropic');
  });

  it('lists satisfied vars by NAME only — never values', () => {
    const res = checkProvider('anthropic', { ANTHROPIC_API_KEY: 'sk-ant-supersecret' } as NodeJS.ProcessEnv);
    expect(res.satisfied).toEqual(['ANTHROPIC_API_KEY']);
    expect(JSON.stringify(res)).not.toContain('supersecret');
  });

  it('covers every supported provider', () => {
    for (const p of SUPPORTED_PROVIDERS) {
      expect(() => checkProvider(p, {} as NodeJS.ProcessEnv)).not.toThrow();
    }
  });
});

describe('createLLMClient', () => {
  it('fails fast with a readable error instead of an SDK stack trace', () => {
    expect(() => createLLMClient({ provider: 'anthropic' })).toThrow(/ANTHROPIC_API_KEY/);
  });

  it('builds the fake provider with no credentials', () => {
    const client = createLLMClient({ provider: 'fake' }, { demoTask: 'add README.md' });
    expect(client.id).toBe('fake');
    expect(client.model).toBe('fake');
  });

  it('honours ANTHROPIC_MODEL from the environment', () => {
    // Regression: setup writes ANTHROPIC_MODEL to .env but the adapter used to
    // ignore it, silently pinning every run to the hardcoded default.
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    process.env.ANTHROPIC_MODEL = 'claude-sonnet-4-5';
    expect(createLLMClient({ provider: 'anthropic' }).model).toBe('claude-sonnet-4-5');
  });

  it('lets an explicit config model beat the env var', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    process.env.ANTHROPIC_MODEL = 'from-env';
    expect(createLLMClient({ provider: 'anthropic', model: 'from-config' }).model).toBe('from-config');
  });

  it('builds each OpenAI-compatible provider', () => {
    process.env.GROQ_API_KEY = 'g';
    const groq = createLLMClient({ provider: 'groq' });
    expect(groq.id).toBe('groq');
    expect(groq.model).toBe('llama-3.3-70b-versatile');

    process.env.TOGETHER_API_KEY = 't';
    expect(createLLMClient({ provider: 'together' }).id).toBe('together');

    expect(createLLMClient({ provider: 'ollama' }).id).toBe('ollama');
  });

  it('requires a base URL for the generic OpenAI-compatible provider', () => {
    expect(() =>
      createCompatibleClient({ ...COMPATIBLE_PROVIDERS['openai-compatible']!, baseURL: '' }, { model: 'm' }),
    ).toThrow(/OPENAI_COMPATIBLE_BASE_URL/);
  });

  it('requires a model id for the generic OpenAI-compatible provider', () => {
    expect(() =>
      createCompatibleClient({ ...COMPATIBLE_PROVIDERS['openai-compatible']!, baseURL: 'http://x/v1' }),
    ).toThrow(/model id/);
  });

  it('marks open-weight compatible providers as text-only', () => {
    process.env.GROQ_API_KEY = 'g';
    expect(createLLMClient({ provider: 'groq' }).supportsVision).toBe(false);
  });
});

// A scripted client that either answers or throws, for exercising the chain.
function stub(id: ProviderId, behavior: 'ok' | 'fail'): LLMClient {
  return {
    id,
    model: `${id}-model`,
    supportsVision: true,
    async chat(_req: ChatRequest): Promise<ChatResult> {
      if (behavior === 'fail') throw new Error(`${id} is down`);
      return { text: id, toolCalls: [], usage: { inputTokens: 1, outputTokens: 1 }, stopReason: 'end' };
    },
  };
}

const REQ: ChatRequest = { system: 's', messages: [], tools: [], maxTokens: 10 };

describe('FallbackClient', () => {
  it('uses the primary when it works', async () => {
    const c = new FallbackClient(stub('anthropic', 'ok'), [stub('bedrock', 'ok')]);
    expect((await c.chat(REQ)).text).toBe('anthropic');
    expect(c.used).toEqual(['anthropic']);
  });

  it('falls through to the next provider on hard failure', async () => {
    const c = new FallbackClient(stub('anthropic', 'fail'), [stub('bedrock', 'ok')]);
    expect((await c.chat(REQ)).text).toBe('bedrock');
    expect(c.used).toEqual(['bedrock']);
  });

  it('walks the whole chain', async () => {
    const c = new FallbackClient(stub('anthropic', 'fail'), [stub('bedrock', 'fail'), stub('openai', 'ok')]);
    expect((await c.chat(REQ)).text).toBe('openai');
  });

  it('rethrows the last error when every provider fails', async () => {
    const c = new FallbackClient(stub('anthropic', 'fail'), [stub('bedrock', 'fail')]);
    await expect(c.chat(REQ)).rejects.toThrow('bedrock is down');
  });

  it('retries the primary on the next call rather than pinning to the fallback', async () => {
    let primaryCalls = 0;
    const flaky: LLMClient = {
      id: 'anthropic',
      model: 'm',
      supportsVision: true,
      async chat() {
        primaryCalls++;
        if (primaryCalls === 1) throw new Error('transient');
        return { text: 'primary-recovered', toolCalls: [], usage: { inputTokens: 0, outputTokens: 0 }, stopReason: 'end' };
      },
    };
    const c = new FallbackClient(flaky, [stub('bedrock', 'ok')]);
    expect((await c.chat(REQ)).text).toBe('bedrock');
    expect((await c.chat(REQ)).text).toBe('primary-recovered');
  });

  it('reports vision support only when the whole chain has it', () => {
    const noVision: LLMClient = { ...stub('groq', 'ok'), supportsVision: false };
    expect(new FallbackClient(stub('anthropic', 'ok'), [stub('openai', 'ok')]).supportsVision).toBe(true);
    expect(new FallbackClient(stub('anthropic', 'ok'), [noVision]).supportsVision).toBe(false);
  });

  it('logs which provider it fell back to', async () => {
    const logs: string[] = [];
    const c = new FallbackClient(stub('anthropic', 'fail'), [stub('bedrock', 'ok')], (m) => logs.push(m));
    await c.chat(REQ);
    expect(logs.join(' ')).toContain('falling back to bedrock');
  });
});

describe('fallback wiring from the environment', () => {
  it('is not wrapped when FORGE_FALLBACK_PROVIDERS is unset', () => {
    const client = createLLMClient({ provider: 'fake' });
    expect(client).not.toBeInstanceOf(FallbackClient);
  });

  it('skips fallbacks that are not themselves configured', () => {
    // anthropic has no key here, so it cannot be a usable fallback — but that
    // must degrade to "no fallback", never break startup.
    process.env.FORGE_FALLBACK_PROVIDERS = 'anthropic';
    const logs: string[] = [];
    const client = createLLMClient({ provider: 'fake' }, { log: (m) => logs.push(m) });
    expect(client).not.toBeInstanceOf(FallbackClient);
    expect(logs.join(' ')).toContain('anthropic');
  });

  it('never lists the primary as its own fallback', () => {
    process.env.FORGE_FALLBACK_PROVIDERS = 'fake';
    expect(createLLMClient({ provider: 'fake' })).not.toBeInstanceOf(FallbackClient);
  });
});
