import { describe, it, expect } from 'vitest';
import { createLLMClientOrStub, unconfiguredClient } from '../../src/providers/index.js';

/**
 * The deterministic scans make no model call. Until this existed, they still
 * needed a model *credential*, because building the run's dependencies
 * constructed a client and constructing one without a key throws — so a
 * repository that wanted only the free security scan got nothing at all.
 */

const KEYS = [
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'GEMINI_API_KEY',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'VERTEX_CREDENTIALS_JSON',
  'GROQ_API_KEY',
  'TOGETHER_API_KEY',
];

function withoutKeys<T>(fn: () => T): T {
  const saved = KEYS.map((k) => [k, process.env[k]] as const);
  for (const k of KEYS) delete process.env[k];
  try {
    return fn();
  } finally {
    for (const [k, v] of saved) if (v !== undefined) process.env[k] = v;
  }
}

describe('a run with no model provider configured', () => {
  it('still builds, so the free scan is not gated behind a paid credential', () => {
    const client = withoutKeys(() => createLLMClientOrStub({ provider: 'anthropic' }));
    expect(client.model).toBe('unconfigured');
    expect(client.id).toBe('anthropic');
  });

  it('says why, once, rather than failing silently', () => {
    const said: string[] = [];
    withoutKeys(() => createLLMClientOrStub({ provider: 'anthropic' }, (m) => said.push(m)));
    expect(said.join(' ')).toMatch(/scans will still run/i);
  });

  it('fails with the missing-credential message when something asks it to think', async () => {
    const client = withoutKeys(() => createLLMClientOrStub({ provider: 'anthropic' }));
    // At the point a credential was genuinely needed — not at startup, where
    // it would have taken the scan down with it.
    await expect(client.chat({ messages: [] } as never)).rejects.toThrow(/credential/i);
  });

  it('is not used when a key is present', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key-for-construction';
    try {
      expect(createLLMClientOrStub({ provider: 'anthropic' }).model).not.toBe('unconfigured');
    } finally {
      delete process.env.ANTHROPIC_API_KEY;
    }
  });

  it('reports the original reason when asked directly', async () => {
    const client = unconfiguredClient('openai', 'Missing credentials for OpenAI.');
    await expect(client.chat({ messages: [] } as never)).rejects.toThrow('Missing credentials for OpenAI.');
  });
});
