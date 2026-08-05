import { describe, it, expect } from 'vitest';
import { scoreCase, scorecard, regressedAgainst } from '../../src/evals/score.js';
import { satisfies } from '../../src/evals/types.js';
import type { EvalCase } from '../../src/evals/types.js';
import type { ReviewFinding } from '../../src/github/review.js';

/**
 * The scorer decides whether a change made reviews better or worse, so it has
 * to be right about what a match is. A scorer that is generous reports
 * progress that did not happen.
 */

const finding = (over: Partial<ReviewFinding> = {}): ReviewFinding =>
  ({
    file: 'src/a.ts',
    startLine: 10,
    endLine: 10,
    lens: 'security',
    severity: 'high',
    category: 'CWE-78',
    title: 'Uncontrolled command line',
    body: 'b',
    ...over,
  }) as ReviewFinding;

describe('what counts as the same problem', () => {
  it('needs the file and the rule to agree', () => {
    expect(satisfies(finding(), { file: 'src/a.ts', category: 'CWE-78' })).toBe(true);
    expect(satisfies(finding(), { file: 'src/b.ts', category: 'CWE-78' })).toBe(false);
    expect(satisfies(finding(), { file: 'src/a.ts', category: 'CWE-22' })).toBe(false);
  });

  it('forgives a line or two, because counting them is not review quality', () => {
    expect(satisfies(finding({ endLine: 12 }), { file: 'src/a.ts', category: 'CWE-78', line: 10 })).toBe(true);
    expect(satisfies(finding({ endLine: 20 }), { file: 'src/a.ts', category: 'CWE-78', line: 10 })).toBe(false);
  });

  it('does not accept a critical reported as low', () => {
    const want = { file: 'src/a.ts', category: 'CWE-78', minSeverity: 'critical' as const };
    expect(satisfies(finding({ severity: 'critical' }), want)).toBe(true);
    expect(satisfies(finding({ severity: 'low' }), want)).toBe(false);
  });
});

describe('scoring one case', () => {
  const kase: EvalCase = {
    name: 'c',
    files: {},
    expect: [{ file: 'src/a.ts', category: 'CWE-78' }],
    forbid: [{ category: 'CWE-532', because: 'prose is not a leak' }],
  };

  it('passes when the wanted finding is there and the banned one is not', () => {
    const r = scoreCase(kase, [finding()]);
    expect(r.passed).toBe(true);
    expect(r.hits).toHaveLength(1);
  });

  it('fails, by name, when a known false positive comes back', () => {
    const r = scoreCase(kase, [finding(), finding({ category: 'CWE-532' })]);
    expect(r.passed).toBe(false);
    expect(r.regressions[0]!.because).toBe('prose is not a leak');
  });

  it('fails when the finding was missed', () => {
    const r = scoreCase(kase, []);
    expect(r.passed).toBe(false);
    expect(r.misses).toHaveLength(1);
  });

  it('counts an unexpected finding as extra rather than failing on it', () => {
    // Not every real finding is in the corpus. It still costs precision.
    const r = scoreCase(kase, [finding(), finding({ category: 'CWE-1004' })]);
    expect(r.passed).toBe(true);
    expect(r.extra).toHaveLength(1);
  });

  it('does not let one finding satisfy two expectations', () => {
    // Otherwise a run that found one thing scores as though it found two.
    const two: EvalCase = {
      name: 'c',
      files: {},
      expect: [
        { file: 'src/a.ts', category: 'CWE-78' },
        { file: 'src/a.ts', category: 'CWE-78' },
      ],
    };
    const r = scoreCase(two, [finding()]);
    expect(r.hits).toHaveLength(1);
    expect(r.misses).toHaveLength(1);
  });

  it('only bans a category in the file it was banned for', () => {
    const scoped: EvalCase = {
      name: 'c',
      files: {},
      forbid: [{ file: 'src/b.ts', category: 'CWE-532' }],
    };
    expect(scoreCase(scoped, [finding({ category: 'CWE-532' })]).regressions).toHaveLength(0);
    expect(
      scoreCase(scoped, [finding({ file: 'src/b.ts', category: 'CWE-532' })]).regressions,
    ).toHaveLength(1);
  });
});

describe('the two numbers that pull against each other', () => {
  it('reports perfect scores only when both halves are perfect', () => {
    const card = scorecard([scoreCase({ name: 'c', files: {}, expect: [{ file: 'src/a.ts', category: 'CWE-78' }] }, [finding()])]);
    expect(card.precision).toBe(1);
    expect(card.recall).toBe(1);
    expect(card.f1).toBe(1);
  });

  it('punishes noise even when nothing was missed', () => {
    // Finding everything by reporting everything is not a good review.
    const card = scorecard([
      scoreCase({ name: 'c', files: {}, expect: [{ file: 'src/a.ts', category: 'CWE-78' }] }, [
        finding(),
        finding({ category: 'CWE-1' }),
        finding({ category: 'CWE-2' }),
      ]),
    ]);
    expect(card.recall).toBe(1);
    expect(card.precision).toBeCloseTo(1 / 3);
  });

  it('does not divide by zero when there is nothing to score', () => {
    const card = scorecard([scoreCase({ name: 'empty', files: {} }, [])]);
    expect(card.precision).toBe(0);
    expect(card.recall).toBe(0);
    expect(card.f1).toBe(0);
  });
});

describe('has it got worse since last time', () => {
  const before = { precision: 0.9, recall: 0.9 };
  // An empty run scores zero, not "unchanged" — so a card has to be built
  // with the numbers under test rather than left empty.
  const card = (over: Partial<{ precision: number; recall: number; regressions: number }>) => ({
    ...scorecard([]),
    precision: 0.9,
    recall: 0.9,
    regressions: 0,
    ...over,
  });

  it('says nothing when the numbers held', () => {
    expect(regressedAgainst(before, card({}))).toHaveLength(0);
  });

  it('fails on a named false positive whatever the averages say', () => {
    expect(regressedAgainst(before, card({ precision: 1, recall: 1, regressions: 1 }))[0]).toContain(
      'false positive',
    );
  });

  it('tolerates rounding but not a real drop', () => {
    expect(regressedAgainst(before, card({ precision: 0.89 }))).toHaveLength(0);
    expect(regressedAgainst(before, card({ precision: 0.5 }))[0]).toContain('precision fell');
    expect(regressedAgainst(before, card({ recall: 0.5 }))[0]).toContain('recall fell');
  });
});
