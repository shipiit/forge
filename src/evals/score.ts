import type { ReviewFinding } from '../github/review.js';
import { satisfies, type CaseResult, type EvalCase, type Scorecard } from './types.js';

/**
 * Turning a set of findings into a number somebody can act on.
 *
 * Two numbers, and they pull in opposite directions. Recall asks whether the
 * review found the problems; precision asks whether it stayed quiet about
 * everything else. Reporting only recall is how a tool ends up flagging every
 * line and calling it thorough.
 */

/**
 * Score one case.
 *
 * Each expectation is matched at most once, and each finding satisfies at most
 * one expectation — otherwise a single finding could paper over three misses,
 * and a run that found one thing would score as though it found three.
 */
export function scoreCase(kase: EvalCase, findings: ReviewFinding[]): CaseResult {
  const want = kase.expect ?? [];
  const unmatched = [...findings];
  const hits: typeof want = [];
  const misses: typeof want = [];

  for (const expectation of want) {
    const i = unmatched.findIndex((f) => satisfies(f, expectation));
    if (i === -1) misses.push(expectation);
    else {
      hits.push(expectation);
      unmatched.splice(i, 1);
    }
  }

  // Whatever is left over is either a named false positive or an unexpected
  // finding. The named ones are the ones worth failing over: they are mistakes
  // somebody already fixed once.
  const regressions: CaseResult['regressions'] = [];
  const extra: ReviewFinding[] = [];
  for (const f of unmatched) {
    const banned = (kase.forbid ?? []).find(
      (b) => b.category === f.category && (b.file === undefined || b.file === f.file),
    );
    if (banned) regressions.push({ category: f.category, file: f.file, ...(banned.because ? { because: banned.because } : {}) });
    else extra.push(f);
  }

  return {
    name: kase.name,
    hits,
    misses,
    regressions,
    extra,
    passed: misses.length === 0 && regressions.length === 0,
  };
}

/** Roll the cases up. Ratios are 0 when there is nothing to divide by. */
export function scorecard(results: CaseResult[]): Scorecard {
  const hits = results.reduce((n, r) => n + r.hits.length, 0);
  const misses = results.reduce((n, r) => n + r.misses.length, 0);
  const regressions = results.reduce((n, r) => n + r.regressions.length, 0);
  const extra = results.reduce((n, r) => n + r.extra.length, 0);

  // Every finding that was not asked for costs precision, whether or not
  // somebody thought to forbid it by name.
  const reported = hits + regressions + extra;
  const precision = reported === 0 ? 0 : hits / reported;
  const recall = hits + misses === 0 ? 0 : hits / (hits + misses);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

  return {
    cases: results,
    precision,
    recall,
    f1,
    regressions,
    passed: results.filter((r) => r.passed).length,
    failed: results.filter((r) => !r.passed).length,
  };
}

const pct = (n: number): string => `${(n * 100).toFixed(1)}%`;

/** The scorecard, for a terminal. */
export function renderScorecard(card: Scorecard): string {
  const lines: string[] = [];

  for (const r of card.cases) {
    lines.push(`${r.passed ? '✓' : '✗'} ${r.name}`);
    for (const m of r.misses) {
      lines.push(`    missed  ${m.category} in ${m.file}${m.because ? ` — ${m.because}` : ''}`);
    }
    for (const g of r.regressions) {
      lines.push(`    RETURNED ${g.category} in ${g.file}${g.because ? ` — ${g.because}` : ''}`);
    }
    for (const e of r.extra) {
      lines.push(`    extra   ${e.category} in ${e.file}:${e.endLine} — ${e.title}`);
    }
  }

  lines.push('');
  lines.push(`  precision ${pct(card.precision)}   recall ${pct(card.recall)}   F1 ${pct(card.f1)}`);
  lines.push(`  ${card.passed} passed, ${card.failed} failed, ${card.regressions} known false positive(s) back`);
  return lines.join('\n');
}

/**
 * Has quality dropped since the last run?
 *
 * A small tolerance, because the point is to catch a change that made reviews
 * worse — not to fail on a rounding difference. Any named false positive
 * coming back fails regardless of the averages: it is a specific mistake
 * somebody already paid to fix.
 */
export function regressedAgainst(
  baseline: Pick<Scorecard, 'precision' | 'recall'>,
  now: Scorecard,
  tolerance = 0.02,
): string[] {
  const failures: string[] = [];
  if (now.regressions > 0) {
    failures.push(`${now.regressions} known false positive(s) came back`);
  }
  if (now.precision < baseline.precision - tolerance) {
    failures.push(`precision fell from ${pct(baseline.precision)} to ${pct(now.precision)}`);
  }
  if (now.recall < baseline.recall - tolerance) {
    failures.push(`recall fell from ${pct(baseline.recall)} to ${pct(now.recall)}`);
  }
  return failures;
}
