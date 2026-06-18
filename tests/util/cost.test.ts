import { describe, it, expect } from 'vitest';
import { estimateCost, formatCost } from '../../src/util/cost.js';

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
