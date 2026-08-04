import type { ReviewFinding } from '../github/review.js';

/**
 * Dismissing a finding, in the code rather than in a database.
 *
 * A hosted scanner remembers that you clicked "dismiss". This has nowhere to
 * remember, and that turns out to be the better design: the dismissal lives on
 * the line it excuses, arrives through review like any other change, and is
 * visible to the next person who reads the file. A dismissal nobody can see is
 * how a suppressed finding outlives the reason for suppressing it.
 *
 *   const token = 'ghp_…'; // forge-ignore: secrets — fixture for the scanner
 *
 * On the line, or on the line above it. Bare `forge-ignore` suppresses
 * everything on that line; naming rules suppresses only those.
 */

/** `forge-ignore` optionally followed by `: rule, rule` and a reason. */
const MARKER = /forge-ignore(?::\s*([a-z0-9_,\s-]*))?/i;

export interface Suppression {
  /** 1-based line the marker applies to. */
  line: number;
  /** Empty means everything on that line. */
  rules: string[];
}

/** Read every suppression marker in a file. */
export function parseSuppressions(text: string): Suppression[] {
  const out: Suppression[] = [];
  text.split('\n').forEach((raw, i) => {
    const m = raw.match(MARKER);
    if (!m) return;
    const rules = (m[1] ?? '')
      // A reason is separated by an em dash or a double hyphen, and is not a rule.
      .split(/—|--/)[0]!
      .split(/[,\s]+/)
      .map((r) => r.trim().toLowerCase())
      .filter(Boolean);

    // A marker on its own line covers the line below; on a line with code it
    // covers that line. Both are recorded, so either spelling works.
    //
    // "Own line" is decided by what comes *before* the marker, not by what
    // follows it — a reason after the rules is normal and must not change
    // which line the dismissal applies to.
    out.push({ line: i + 1, rules });
    const before = raw.slice(0, m.index ?? 0);
    if (/^[\s/#*<!-]*$/.test(before)) out.push({ line: i + 2, rules });
  });
  return out;
}

/**
 * Does a suppression cover this finding?
 *
 * Matched loosely on purpose: `secrets`, `CWE-798` and `cwe798` should all
 * silence a secret finding, because somebody writing the marker is looking at
 * the comment, not at the source of the rule that produced it.
 */
function covers(s: Suppression, f: ReviewFinding, scanner?: string): boolean {
  if (s.rules.length === 0) return true;
  const category = f.category.toLowerCase().replace(/[^a-z0-9]/g, '');
  return s.rules.some((rule) => {
    const r = rule.replace(/[^a-z0-9]/g, '');
    return r === category || (scanner ? r === scanner.toLowerCase() : false) || r === f.lens;
  });
}

/**
 * Drop findings the file itself asked to be dismissed.
 *
 * Only the line the finding is on, and the line above it. A file-wide
 * suppression is deliberately not offered: the point of writing it next to the
 * code is that it is obvious later which line it excuses.
 */
export function applySuppressions(
  findings: ReviewFinding[],
  fileText: string,
  scanner?: string,
): ReviewFinding[] {
  const suppressions = parseSuppressions(fileText);
  if (suppressions.length === 0) return findings;

  return findings.filter(
    (f) => !suppressions.some((s) => (s.line === f.endLine || s.line === f.startLine) && covers(s, f, scanner)),
  );
}
