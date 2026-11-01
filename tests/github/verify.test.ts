import { describe, it, expect } from 'vitest';
import type { AgentResult } from '../../src/agent/loop.js';
import type { ReviewFinding } from '../../src/github/review.js';
import {
  applyVerdicts,
  combineResults,
  FINDER_FOCUS,
  parseVerdicts,
  renderCandidates,
  renderVerification,
  reviewPasses,
  splitSpend,
} from '../../src/github/verify.js';

const finding = (over: Partial<ReviewFinding> = {}): ReviewFinding => ({
  file: 'src/a.ts',
  startLine: 3,
  endLine: 3,
  lens: 'quality',
  severity: 'high',
  category: 'logic',
  title: 'Wrong comparison',
  body: 'Uses < where <= is needed.',
  ...over,
});

const result = (finalText: string, over: Partial<AgentResult> = {}): AgentResult => ({
  finalText,
  iterations: 1,
  stoppedBy: 'end',
  messages: [],
  usage: { inputTokens: 10, outputTokens: 5 },
  ...over,
});

describe('parseVerdicts', () => {
  it('reads verdicts out of surrounding prose', () => {
    const v = parseVerdicts('Checked.\n[{"id":0,"verdict":"rejected","reason":"guarded on line 2"},{"id":1,"verdict":"confirmed","severity":"low","duplicateOf":0}]\nDone.');
    expect(v.get(0)).toEqual({ verdict: 'rejected', reason: 'guarded on line 2', severity: undefined, duplicateOf: undefined });
    expect(v.get(1)).toEqual({ verdict: 'confirmed', reason: undefined, severity: 'low', duplicateOf: 0 });
  });

  it.each([
    ['', 0],
    ['no json here', 0],
    ['[not json', 0],
    ['{"id":0}', 0],
    ['[{"id":"0","verdict":"rejected"}]', 0],
    ['[{"id":1.5,"verdict":"rejected"}]', 0],
    ['[{"id":0,"verdict":"maybe"}]', 0],
    ['[null, 3, {"id":2,"verdict":"confirmed","severity":"enormous"}]', 1],
  ])('skips what is malformed: %j', (text, size) => {
    const v = parseVerdicts(text);
    expect(v.size).toBe(size);
    if (size) expect(v.get(2)?.severity).toBeUndefined();
  });
});

describe('applyVerdicts', () => {
  const candidates = [finding({ title: 'A' }), finding({ title: 'B', severity: 'medium' }), finding({ title: 'C' }), finding({ title: 'D' })];

  it('drops rejections and keeps the rest, with the reason recorded', () => {
    const { kept, rejected } = applyVerdicts(candidates, parseVerdicts('[{"id":0,"verdict":"rejected","reason":"guarded"}]'));
    expect(kept.map((f) => f.title)).toEqual(['B', 'C', 'D']);
    expect(rejected).toEqual([{ finding: candidates[0], reason: 'guarded' }]);
  });

  it('keeps a candidate it said nothing about', () => {
    expect(applyVerdicts(candidates, new Map()).kept).toHaveLength(4);
  });

  it('may lower a severity but never raise one', () => {
    const { kept } = applyVerdicts(
      candidates,
      parseVerdicts('[{"id":0,"verdict":"confirmed","severity":"low"},{"id":1,"verdict":"confirmed","severity":"critical"}]'),
    );
    expect(kept.map((f) => f.severity)).toEqual(['low', 'medium', 'high', 'high']);
  });

  it('drops a duplicate only when what it duplicates survives', () => {
    const v = parseVerdicts(
      '[{"id":1,"verdict":"confirmed","duplicateOf":0},{"id":2,"verdict":"confirmed","duplicateOf":3},{"id":3,"verdict":"rejected"}]',
    );
    const { kept, rejected } = applyVerdicts(candidates, v);
    // 1 duplicates 0, which survives → gone. 2 duplicates 3, which was rejected → kept.
    expect(kept.map((f) => f.title)).toEqual(['A', 'C']);
    expect(rejected.map((r) => r.finding.title)).toEqual(['B', 'D']);
  });

  it('ignores a duplicate pointing at itself or out of range', () => {
    const v = parseVerdicts('[{"id":0,"verdict":"confirmed","duplicateOf":0},{"id":1,"verdict":"confirmed","duplicateOf":99},{"id":2,"verdict":"confirmed","duplicateOf":-1}]');
    expect(applyVerdicts(candidates, v).kept).toHaveLength(4);
  });

  it('handles no candidates', () => {
    expect(applyVerdicts([], new Map())).toEqual({ kept: [], keptIds: [], rejected: [] });
  });
});

describe('renderCandidates', () => {
  it('numbers candidates and leaves out suggestions for the verifier to anchor on', () => {
    const text = renderCandidates([finding({ suggestion: 'x <= y' })]);
    expect(JSON.parse(text)[0]).toMatchObject({ id: 0, title: 'Wrong comparison' });
    expect(text).not.toContain('x <= y');
  });
});

describe('combineResults', () => {
  it('sums usage and turns, and reports a budget stop from any pass', () => {
    const budget = { spentUsd: 1, capUsd: 1 } as unknown as AgentResult['budget'];
    const c = combineResults([result('a'), result('b', { stoppedBy: 'budget', budget, iterations: 4 })]);
    expect(c.usage).toMatchObject({ inputTokens: 20, outputTokens: 10 });
    expect(c.iterations).toBe(5);
    expect(c.stoppedBy).toBe('budget');
    expect(c.budget).toBe(budget);
    expect(c.finalText).toBe('a');
  });

  it('refuses an empty list', () => {
    expect(() => combineResults([])).toThrow('no review pass ran');
  });
});

describe('reviewPasses', () => {
  const two = JSON.stringify([finding({ title: 'real' }), finding({ title: 'imagined', startLine: 9, endLine: 9, category: 'other' })]);

  function run(depth: 'light' | 'standard' | 'deep', opts: { findText?: string; verifyText?: string; verifyThrows?: boolean; failFinders?: number } = {}) {
    const focuses: Array<string | undefined> = [];
    const verified: string[] = [];
    const logs: string[] = [];
    let calls = 0;
    const promise = reviewPasses({
      depth,
      log: (m) => logs.push(m),
      find: async (focus) => {
        focuses.push(focus);
        if (calls++ < (opts.failFinders ?? 0)) throw new Error('finder down');
        return result(opts.findText ?? two);
      },
      verify: async (candidates) => {
        verified.push(candidates);
        if (opts.verifyThrows) throw new Error('verifier down');
        return result(opts.verifyText ?? '[{"id":1,"verdict":"rejected","reason":"line 9 is guarded"}]');
      },
    });
    return { promise, focuses, verified, logs };
  }

  it('light: one finder, no verification', async () => {
    const r = run('light');
    const out = await r.promise;
    expect(r.focuses).toEqual([undefined]);
    expect(r.verified).toEqual([]);
    expect(out.findings.map((f) => f.title)).toEqual(['real', 'imagined']);
    expect(out.verified).toBe(true);
  });

  it('standard: one finder, then the verifier drops what the code does not bear out', async () => {
    const r = run('standard');
    const out = await r.promise;
    expect(r.focuses).toEqual([undefined]);
    expect(r.verified).toHaveLength(1);
    expect(out.findings.map((f) => f.title)).toEqual(['real']);
    expect(out.rejected.map((x) => x.reason)).toEqual(['line 9 is guarded']);
    expect(out.results).toHaveLength(2);
  });

  it('deep: three focused finders, merged before one verification', async () => {
    const r = run('deep');
    const out = await r.promise;
    expect(r.focuses).toEqual(FINDER_FOCUS);
    expect(r.verified).toHaveLength(1);
    // Three finders reported the same two findings; the verifier saw them once each.
    expect(JSON.parse(r.verified[0]!)).toHaveLength(2);
    expect(out.findings.map((f) => f.title)).toEqual(['real']);
    expect(out.results).toHaveLength(4);
  });

  it('deep: carries on with the finders that worked', async () => {
    const r = run('deep', { failFinders: 2 });
    const out = await r.promise;
    expect(out.findings.map((f) => f.title)).toEqual(['real']);
    expect(r.logs.join()).toContain('2 of 3 finders failed');
  });

  it('throws when every finder failed, rather than posting an empty review', async () => {
    await expect(run('standard', { failFinders: 1 }).promise).rejects.toThrow('finder down');
  });

  it('skips verification when nothing was found', async () => {
    const r = run('standard', { findText: '[]' });
    const out = await r.promise;
    expect(r.verified).toEqual([]);
    expect(out).toMatchObject({ findings: [], verified: true });
  });

  it.each([
    ['the verifier throws', { verifyThrows: true }],
    ['the verifier returns nothing usable', { verifyText: 'I could not decide.' }],
  ])('keeps every candidate, marked unverified, when %s', async (_why, opts) => {
    const out = await run('standard', opts).promise;
    expect(out.findings).toHaveLength(2);
    expect(out.verified).toBe(false);
  });
});

describe('renderVerification', () => {
  const kept = [finding()];
  it.each([
    ['light', { findings: kept, rejected: [], verified: true }, ''],
    ['standard', { findings: kept, rejected: [{ finding: finding(), reason: 'x' }], verified: true }, 'kept 1 of 2 candidate findings, dropped 1'],
    ['deep', { findings: kept, rejected: [], verified: true }, 'Reviewed by 3 reviewers'],
    ['standard', { findings: [], rejected: [], verified: true }, 'nothing to verify'],
    ['standard', { findings: kept, rejected: [], verified: false }, 'unverified'],
  ] as const)('%s → %s', (depth, o, text) => {
    const out = renderVerification(depth, { ...o, results: [] });
    if (text) expect(out).toContain(text);
    else expect(out).toBe('');
  });
});

describe('splitSpend', () => {
  it.each(['light', 'standard', 'deep'] as const)('keeps every pass of a %s review within one run’s cap', (depth) => {
    const { finder, verify } = splitSpend(depth, 1);
    const finders = depth === 'deep' ? FINDER_FOCUS.length : 1;
    expect(finder * finders + verify).toBeLessThanOrEqual(1 + 1e-9);
    expect(finder).toBeGreaterThan(0);
  });

  it('gives the verifier nothing when there is no verification', () => {
    expect(splitSpend('light', 2)).toEqual({ finder: 2, verify: 0 });
  });

  it('leaves an uncapped run uncapped', () => {
    expect(splitSpend('deep', Infinity)).toEqual({ finder: Infinity, verify: Infinity });
  });
});
