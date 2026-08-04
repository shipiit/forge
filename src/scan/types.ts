import type { ReviewFinding } from '../github/review.js';

/**
 * Deterministic scanners.
 *
 * The model is good at "is this reachable and does it matter" and bad at
 * "check all four thousand lines for the same pattern, reliably, every time".
 * These do the second thing: no model call, no tokens, same answer twice.
 * Their output joins the model's findings and is triaged alongside them.
 */

export interface ScanFile {
  /** Repository-relative path. */
  path: string;
  text: string;
}

export interface ScanContext {
  /** Repository root, for scanners that need to read more than they were given. */
  cwd: string;
  /**
   * Restrict to these paths. A pull-request review scans the change; an audit
   * scans everything. Empty means everything.
   */
  only?: Set<string>;
}

export interface Scanner {
  name: string;
  /** Cheap check so a scanner can skip a file without reading it. */
  handles(path: string): boolean;
  scan(file: ScanFile, ctx: ScanContext): ReviewFinding[];
}

/**
 * Identity of a finding, for merging.
 *
 * File, rule and line — not the title. A model writing prose calls it "Action
 * pinned to a mutable reference" and the scanner calls it "Action pinned to a
 * mutable ref"; keyed on the title those are two findings, and a review that
 * says the same thing twice in different words is worse than one that says it
 * once, because the reader now has to work out whether they are the same.
 */
export function findingKey(f: ReviewFinding): string {
  return [f.file, f.category, f.endLine].join('|');
}

/** Lines apart that two reports of one rule are still the same finding. */
const NEAR = 3;

const RANK: Record<ReviewFinding['severity'], number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
};

/** Of two reports of one problem, the one worth keeping. */
function pick(a: ReviewFinding, b: ReviewFinding): ReviewFinding {
  const bWins =
    RANK[b.severity] > RANK[a.severity] ||
    (RANK[b.severity] === RANK[a.severity] &&
      ((b.suggestion !== undefined && a.suggestion === undefined) ||
        (b.suggestion === undefined === (a.suggestion === undefined) && b.body.length > a.body.length)));
  const winner = bWins ? b : a;
  const other = bWins ? a : b;
  // The surviving comment keeps the longer explanation whichever report it
  // came from — that is nearly always the one with the reasoning in it.
  return { ...winner, body: other.body.length > winner.body.length ? other.body : winner.body };
}

/**
 * Merge findings from every source, keeping the most severe of any duplicate.
 *
 * One weakness legitimately surfaces from several places — a hardcoded key is
 * a secret finding, a pattern finding, and something the model also noticed.
 * Three comments on one line reads as three problems.
 *
 * Two passes. The first merges exact matches; the second merges reports of the
 * same rule in the same file a few lines apart, because a model counting lines
 * in a diff and a scanner counting them in the file do not always agree, and
 * being one line out is not a second bug.
 */
export function dedupe(findings: ReviewFinding[]): ReviewFinding[] {
  const best = new Map<string, ReviewFinding>();
  for (const f of findings) {
    const key = findingKey(f);
    const seen = best.get(key);
    best.set(key, seen ? pick(seen, f) : f);
  }

  const out: ReviewFinding[] = [];
  for (const f of [...best.values()].sort((a, b) => a.endLine - b.endLine)) {
    const near = out.findIndex(
      (o) => o.file === f.file && o.category === f.category && Math.abs(o.endLine - f.endLine) <= NEAR,
    );
    if (near === -1) out.push(f);
    else out[near] = pick(out[near]!, f);
  }
  return out;
}

export const TEST_PATH =
  /(?:^|\/)(?:tests?|__tests__|spec|fixtures?|__mocks__)\/|\.(?:test|spec)\.[jt]sx?$|_test\.(?:py|go|rb)$|(?:^|\/)test_[^/]+\.py$/i;

/** Is this finding pointing at a test fixture rather than at shipped code? */
export function inTestFile(f: { file: string }): boolean {
  return TEST_PATH.test(f.file);
}
