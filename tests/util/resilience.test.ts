import { describe, it, expect } from 'vitest';
import { withRetry, redactSecrets } from '../../src/util/resilience.js';

const noSleep = async () => {};

describe('withRetry', () => {
  it('returns on first success', async () => {
    let calls = 0;
    const r = await withRetry(async () => { calls++; return 'ok'; }, { sleep: noSleep });
    expect(r).toBe('ok');
    expect(calls).toBe(1);
  });

  it('retries retryable errors then succeeds', async () => {
    let calls = 0;
    const r = await withRetry(
      async () => {
        calls++;
        if (calls < 3) throw { status: 503 };
        return 'recovered';
      },
      { sleep: noSleep, baseDelayMs: 1 },
    );
    expect(r).toBe('recovered');
    expect(calls).toBe(3);
  });

  it('does not retry non-retryable errors', async () => {
    let calls = 0;
    await expect(
      withRetry(async () => { calls++; throw { status: 400 }; }, { sleep: noSleep }),
    ).rejects.toEqual({ status: 400 });
    expect(calls).toBe(1);
  });

  it('gives up after the retry budget', async () => {
    let calls = 0;
    await expect(
      withRetry(async () => { calls++; throw { code: 'ETIMEDOUT' }; }, { retries: 2, sleep: noSleep }),
    ).rejects.toEqual({ code: 'ETIMEDOUT' });
    expect(calls).toBe(3); // initial + 2 retries
  });
});

describe('redactSecrets', () => {
  it('redacts GitHub, OpenAI, Anthropic, AWS keys and tokens in URLs', () => {
    const s = redactSecrets(
      'token ghp_abcdefghijklmnopqrstuvwxyz0123 and sk-ant-abcdefghij1234567890xyz and ' +
        'AKIAIOSFODNN7EXAMPLE and https://x-access-token:ghs_secretsecretsecret123456@github.com/x/y.git',
    );
    expect(s).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz0123');
    expect(s).not.toContain('sk-ant-');
    expect(s).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(s).not.toContain('ghs_secretsecretsecret123456');
    expect(s).toContain('[REDACTED]');
  });
});
