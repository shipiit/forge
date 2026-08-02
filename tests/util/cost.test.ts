import { describe, it, expect } from 'vitest';
import { estimateCost, formatCost, addUsage } from '../../src/util/cost.js';

describe('estimateCost', () => {
  it('prices a known model (gemini-2.5-pro)', () => {
    const c = estimateCost({ inputTokens: 1_000_000, outputTokens: 1_000_000 }, 'gemini-2.5-pro');
    expect(c.usd).toBeCloseTo(11.25, 5); // 1.25 in + 10 out
    expect(c.priced).toBe(true);
  });

  it('prices OpenAI gpt-4o', () => {
    const c = estimateCost({ inputTokens: 500_000, outputTokens: 200_000 }, 'gpt-4o');
    // 0.5 * 2.5 + 0.2 * 10 = 1.25 + 2 = 3.25
    expect(c.usd).toBeCloseTo(3.25, 5);
  });

  it('uses a fallback price for unknown models and flags it', () => {
    const c = estimateCost({ inputTokens: 1_000_000, outputTokens: 0 }, 'some-new-model');
    expect(c.usd).toBeCloseTo(3, 5);
    expect(c.priced).toBe(false);
  });

  it('formats a readable line', () => {
    const c = estimateCost({ inputTokens: 1234, outputTokens: 567 }, 'gpt-4o');
    const line = formatCost(c);
    expect(line).toMatch(/1,234 in/);
    expect(line).toMatch(/567 out/);
    expect(line).toMatch(/\$/);
  });

  it('marks approximate cost for unknown models', () => {
    expect(formatCost(estimateCost({ inputTokens: 1, outputTokens: 1 }, 'mystery'))).toMatch(/approx/);
  });
});

describe('cache-aware pricing', () => {
  it('bills cached reads far below fresh input', () => {
    const fresh = estimateCost({ inputTokens: 1_000_000, outputTokens: 0 }, 'claude-3-5-sonnet');
    const cached = estimateCost({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 1_000_000 }, 'claude-3-5-sonnet');
    expect(fresh.usd).toBeCloseTo(3, 5);
    expect(cached.usd).toBeCloseTo(0.3, 5); // 10% of input rate
    expect(cached.usd).toBeLessThan(fresh.usd);
  });

  it('bills cache writes at a premium', () => {
    const c = estimateCost({ inputTokens: 0, outputTokens: 0, cacheWriteTokens: 1_000_000 }, 'claude-3-5-sonnet');
    expect(c.usd).toBeCloseTo(3.75, 5); // 125% of input rate
  });

  it('reports what the run would have cost without caching', () => {
    const c = estimateCost(
      { inputTokens: 100_000, outputTokens: 0, cacheReadTokens: 900_000 },
      'claude-3-5-sonnet',
    );
    // real: 0.1*3 + 0.9*0.3 = 0.3 + 0.27 = 0.57
    expect(c.usd).toBeCloseTo(0.57, 5);
    // uncached: 1M input at 3.00
    expect(c.usdWithoutCache).toBeCloseTo(3, 5);
  });

  it('derives cache rates for models without explicit ones', () => {
    const c = estimateCost({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 1_000_000 }, 'gpt-4o');
    expect(c.usd).toBeCloseTo(0.25, 5); // 10% of 2.50
  });

  it('shows the cache saving in the formatted line', () => {
    const line = formatCost(
      estimateCost({ inputTokens: 100_000, outputTokens: 0, cacheReadTokens: 900_000 }, 'claude-3-5-sonnet'),
    );
    expect(line).toMatch(/900,000 cached/);
    expect(line).toMatch(/saved/);
  });

  it('omits cache wording when nothing was cached', () => {
    expect(formatCost(estimateCost({ inputTokens: 10, outputTokens: 10 }, 'gpt-4o'))).not.toMatch(/cached/);
  });

  it('prices free local models at zero', () => {
    expect(estimateCost({ inputTokens: 1_000_000, outputTokens: 1_000_000 }, 'llama3.1').usd).toBe(0);
  });
});

describe('addUsage', () => {
  it('sums plain input/output', () => {
    expect(addUsage({ inputTokens: 1, outputTokens: 2 }, { inputTokens: 10, outputTokens: 20 })).toEqual({
      inputTokens: 11,
      outputTokens: 22,
    });
  });

  it('sums cache fields when either side has them', () => {
    const out = addUsage(
      { inputTokens: 1, outputTokens: 1, cacheReadTokens: 5 },
      { inputTokens: 1, outputTokens: 1, cacheReadTokens: 7, cacheWriteTokens: 3 },
    );
    expect(out.cacheReadTokens).toBe(12);
    expect(out.cacheWriteTokens).toBe(3);
  });

  it('leaves cache fields absent when neither side reports any', () => {
    const out = addUsage({ inputTokens: 1, outputTokens: 1 }, { inputTokens: 1, outputTokens: 1 });
    expect('cacheReadTokens' in out).toBe(false);
  });
});
