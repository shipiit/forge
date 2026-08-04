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
 * Deliberately not the line number: the same secret moves down a file when
 * somebody adds an import above it, and reporting it twice is how a review
 * loses its reader. File, rule and the matched text are what make it the same
 * finding.
 */
export function findingKey(f: ReviewFinding): string {
  return [f.file, f.category, f.title.toLowerCase().replace(/\s+/g, ' ')].join('|');
}

/**
 * Merge findings from every source, keeping the most severe of any duplicate.
 *
 * One weakness legitimately surfaces from several scanners — a hardcoded key
 * is a secret finding, a pattern finding, and something the model also noticed.
 * Three comments on one line reads as three problems.
 */
export function dedupe(findings: ReviewFinding[]): ReviewFinding[] {
  const rank: Record<ReviewFinding['severity'], number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
  const best = new Map<string, ReviewFinding>();

  for (const f of findings) {
    const key = findingKey(f);
    const seen = best.get(key);
    if (!seen) {
      best.set(key, f);
      continue;
    }
    // Keep the more severe, and prefer the one that carries a fix.
    const better =
      rank[f.severity] > rank[seen.severity] ||
      (rank[f.severity] === rank[seen.severity] && f.suggestion !== undefined && seen.suggestion === undefined);
    if (better) best.set(key, { ...f, body: seen.body.length > f.body.length ? seen.body : f.body });
  }
  return [...best.values()];
}
