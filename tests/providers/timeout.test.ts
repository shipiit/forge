import { describe, it, expect } from 'vitest';
import { timeoutMs } from '../../src/providers/openai.js';

/**
 * A review that hangs is worse than a review that fails.
 *
 * Both SDKs default to ten minutes per request and retry twice, so an endpoint
 * that accepts a connection and then stalls — a self-hosted model, an
 * experimental gateway, a gateway in front of a cold GPU — costs half an hour
 * of a job printing nothing at all. The person watching cannot tell that from
 * a slow model, so they wait.
 */
describe('how long one model turn may take', () => {
  it('defaults to five minutes', () => {
    expect(timeoutMs({})).toBe(300_000);
  });

  it('takes an explicit budget, because slow is a property of the endpoint', () => {
    // A 1T-parameter model on somebody's own GPUs is legitimately slower than
    // a hosted one, and no single number is right for both.
    expect(timeoutMs({ FORGE_REQUEST_TIMEOUT_MS: '900000' })).toBe(900_000);
  });

  it('never lets a typo disable the timeout', () => {
    // Which is the state this exists to prevent, so every bad value has to
    // land on the default rather than on "wait forever".
    for (const bad of ['', '0', '-1', 'abc', 'Infinity', 'NaN']) {
      expect(timeoutMs({ FORGE_REQUEST_TIMEOUT_MS: bad })).toBe(300_000);
    }
  });

  it('clamps both ends', () => {
    // Ten seconds is below the slowest legitimate first token; half an hour is
    // past the point where a runner should be abandoned instead.
    expect(timeoutMs({ FORGE_REQUEST_TIMEOUT_MS: '5' })).toBe(10_000);
    expect(timeoutMs({ FORGE_REQUEST_TIMEOUT_MS: '99999999' })).toBe(1_800_000);
  });
});
