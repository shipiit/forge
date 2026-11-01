import { describe, it, expect } from 'vitest';
import { CHECK_GROUPS, DEPTHS } from '../../web/src/sections/landing/lib/checks.js';
import { SCANNERS } from '../../src/scan/index.js';
import { FINDER_FOCUS } from '../../src/github/verify.js';

/**
 * The landing page makes claims about the product. These hold it to the code,
 * so the page cannot advertise a scanner that does not run, or miss one that does.
 */
describe('what the landing page says Forge checks', () => {
  it('describes every scanner that runs, and no scanner that does not', () => {
    const advertised = CHECK_GROUPS.filter((g) => g.source !== 'model' && g.source !== 'audit').map((g) => g.source).sort();
    expect(advertised).toEqual(SCANNERS.map((s) => s.name).sort());
  });

  it('calls the scanners free and the agent review not', () => {
    for (const g of CHECK_GROUPS) expect(g.cost).toBe(g.source === 'model' || g.source === 'audit' ? 'tokens' : 'free');
  });

  it('writes every CWE in the canonical form, and no group is empty', () => {
    for (const g of CHECK_GROUPS) {
      expect(g.items.length, g.title).toBeGreaterThan(0);
      for (const it of g.items) if (it.cwe) expect(it.cwe).toMatch(/^CWE-\d+$/);
    }
  });

  it('matches the review depths to the engine', () => {
    expect(DEPTHS.map((d) => d.depth)).toEqual(['light', 'standard', 'deep']);
    expect(DEPTHS.find((d) => d.depth === 'deep')?.finders).toBe(FINDER_FOCUS.length);
    expect(DEPTHS.find((d) => d.depth === 'light')?.verified).toBe(false);
    expect(DEPTHS.filter((d) => d.depth !== 'light').every((d) => d.verified)).toBe(true);
  });
});
