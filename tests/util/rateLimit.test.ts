import { describe, it, expect } from 'vitest';
import {
  HOUR_MS,
  MemoryRateLimitStore,
  checkRateLimit,
  renderRateLimited,
  repoKey,
  type RateLimitStore,
} from '../../src/util/rateLimit.js';

const T0 = 1_700_000_000_000;

describe('the key', () => {
  it('is per repository and case-insensitive', () => {
    expect(repoKey('Acme', 'Web')).toBe('acme/web');
    expect(repoKey('acme', 'web')).toBe(repoKey('ACME', 'WEB'));
  });

  it('separates repositories in the same org', () => {
    expect(repoKey('acme', 'web')).not.toBe(repoKey('acme', 'api'));
  });
});

describe('the sliding window', () => {
  it('allows runs up to the limit, then denies', async () => {
    const store = new MemoryRateLimitStore();
    for (let i = 0; i < 3; i++) {
      expect((await checkRateLimit(store, 'r', 3, T0 + i)).allowed).toBe(true);
    }
    const denied = await checkRateLimit(store, 'r', 3, T0 + 4);
    expect(denied.allowed).toBe(false);
    expect(denied.used).toBe(3);
  });

  it('frees capacity as the oldest run ages out', async () => {
    const store = new MemoryRateLimitStore();
    await checkRateLimit(store, 'r', 1, T0);
    expect((await checkRateLimit(store, 'r', 1, T0 + 1000)).allowed).toBe(false);
    // Just past the hour, the first run leaves the window.
    expect((await checkRateLimit(store, 'r', 1, T0 + HOUR_MS + 1)).allowed).toBe(true);
  });

  it('says when to retry', async () => {
    const store = new MemoryRateLimitStore();
    await checkRateLimit(store, 'r', 1, T0);
    const denied = await checkRateLimit(store, 'r', 1, T0 + 60_000);
    expect(denied.retryAt).toBe(T0 + HOUR_MS);
  });

  it('keeps repositories independent', async () => {
    const store = new MemoryRateLimitStore();
    await checkRateLimit(store, 'a/one', 1, T0);
    expect((await checkRateLimit(store, 'a/two', 1, T0)).allowed).toBe(true);
  });

  it('treats a zero or negative limit as no limit', async () => {
    const store = new MemoryRateLimitStore();
    for (let i = 0; i < 50; i++) {
      expect((await checkRateLimit(store, 'r', 0, T0 + i)).allowed).toBe(true);
    }
    expect((await checkRateLimit(store, 'r', -1, T0)).allowed).toBe(true);
  });

  it('does not consume capacity on a denied request', async () => {
    const store = new MemoryRateLimitStore();
    await checkRateLimit(store, 'r', 1, T0);
    await checkRateLimit(store, 'r', 1, T0 + 1);
    await checkRateLimit(store, 'r', 1, T0 + 2);
    // Still exactly one recorded run, so the window clears on schedule.
    expect((await store.recent('r', T0 - HOUR_MS)).length).toBe(1);
  });

  it('prunes expired timestamps rather than growing forever', async () => {
    const store = new MemoryRateLimitStore();
    for (let i = 0; i < 5; i++) await checkRateLimit(store, 'r', 100, T0 + i);
    const after = await store.recent('r', T0 + HOUR_MS * 2);
    expect(after).toEqual([]);
  });
});

describe('failing open', () => {
  it('allows the run when the store throws', async () => {
    // A limiter that blocks the agent because its own bookkeeping broke is
    // worse than no limiter at all.
    const broken: RateLimitStore = {
      recent: async () => {
        throw new Error('store down');
      },
      add: async () => {},
    };
    expect((await checkRateLimit(broken, 'r', 1, T0)).allowed).toBe(true);
  });

  it('allows the run when recording throws', async () => {
    const broken: RateLimitStore = {
      recent: async () => [],
      add: async () => {
        throw new Error('disk full');
      },
    };
    expect((await checkRateLimit(broken, 'r', 1, T0)).allowed).toBe(true);
  });
});

describe('the notice', () => {
  it('states the usage, the limit, and how to raise it', () => {
    const text = renderRateLimited(
      { allowed: false, used: 5, limit: 5, retryAt: T0 + 30 * 60_000 },
      T0,
    );
    expect(text).toContain('5 runs');
    expect(text).toContain('limit of 5');
    expect(text).toContain('30 minutes');
    expect(text).toContain('max_runs_per_hour');
  });

  it('never says zero minutes', () => {
    const text = renderRateLimited({ allowed: false, used: 1, limit: 1, retryAt: T0 + 500 }, T0);
    expect(text).toContain('1 minute');
  });
});
