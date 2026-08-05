import type { ReviewFinding } from '../github/review.js';

/**
 * Measuring whether a review is any good.
 *
 * The test suite proves the code runs. It says nothing about whether the
 * review is worth reading, and that is the only property anybody buys. Without
 * this, every prompt edit and every model swap is a guess: "gemini-2.5-flash is
 * four times cheaper" is a sentence about cost, and on its own it is not a
 * reason to switch.
 *
 * A case is a small repository, the findings a good review must produce, and —
 * just as important — the findings it must not. Precision is the half people
 * forget, and it is the half that decides whether anyone keeps the tool on.
 */

/** What a finding must look like to count as a match. */
export interface Expectation {
  file: string;
  /** CWE or rule id. The primary key of "is this the same problem". */
  category: string;
  /** Optional: fail if the finding lands more than `lineTolerance` away. */
  line?: number;
  /** Lowest acceptable severity. A critical reported as low is not a pass. */
  minSeverity?: ReviewFinding['severity'];
  /** Why this belongs in the corpus. Read by a human deciding to change it. */
  because?: string;
}

export interface EvalCase {
  name: string;
  /** Relative path → contents. Written to a temp dir and scanned. */
  files: Record<string, string>;
  /** Findings a good review produces. Missing one costs recall. */
  expect?: Expectation[];
  /**
   * Findings a good review does NOT produce.
   *
   * Every entry here is a false positive somebody actually hit. They are
   * listed by name so a regression says which mistake came back, rather than
   * "precision dropped".
   */
  forbid?: Array<{ file?: string; category: string; because?: string }>;
}

export interface CaseResult {
  name: string;
  /** Expectations met. */
  hits: Expectation[];
  /** Expectations the run did not produce. */
  misses: Expectation[];
  /** Findings matching a `forbid` entry — false positives with a name. */
  regressions: Array<{ category: string; file: string; because?: string }>;
  /** Findings that were neither expected nor forbidden. */
  extra: ReviewFinding[];
  passed: boolean;
}

export interface Scorecard {
  cases: CaseResult[];
  /** Of the findings reported, how many were asked for. */
  precision: number;
  /** Of the findings asked for, how many were reported. */
  recall: number;
  f1: number;
  /** Named false positives that came back. The number to keep at zero. */
  regressions: number;
  passed: number;
  failed: number;
}

const RANK: Record<ReviewFinding['severity'], number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
};

/** How far a finding may drift from its expected line and still count. */
export const LINE_TOLERANCE = 2;

/**
 * Does this finding satisfy this expectation?
 *
 * File and category must match exactly — those are what make it the same
 * problem. The line is allowed to drift a little, because a model counting
 * lines in a diff and a scanner counting them in a file disagree by one often
 * enough that pinning it exactly would measure arithmetic rather than review
 * quality.
 */
export function satisfies(finding: ReviewFinding, want: Expectation): boolean {
  if (finding.file !== want.file) return false;
  if (finding.category !== want.category) return false;
  if (want.line !== undefined && Math.abs(finding.endLine - want.line) > LINE_TOLERANCE) return false;
  if (want.minSeverity && RANK[finding.severity] < RANK[want.minSeverity]) return false;
  return true;
}
