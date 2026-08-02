import type { ReviewFinding } from './review.js';

/**
 * A GitHub check run summarizing a review.
 *
 * Inline review comments are lossy: GitHub rejects a comment on any line that
 * isn't part of the diff, and a push mid-review moves the lines out from under
 * the findings. The check run is the durable copy — every finding appears in its
 * summary table and as an annotation, whether or not the inline comment landed.
 *
 * The conclusion is ALWAYS `neutral`, so a review can never block a merge through
 * branch protection. Teams that do want to gate parse the machine-readable footer.
 */

export const CHECK_RUN_NAME = 'ShipIT Forge Review';

/** GitHub caps annotations at 50 per request. */
export const MAX_ANNOTATIONS = 50;

export interface CheckAnnotation {
  path: string;
  start_line: number;
  end_line: number;
  annotation_level: 'failure' | 'warning' | 'notice';
  title: string;
  message: string;
}

export interface CheckRunOutput {
  title: string;
  summary: string;
  text: string;
  annotations: CheckAnnotation[];
}

export interface SeverityCounts {
  blocking: number;
  nit: number;
  pre_existing: number;
}

const BLOCKING = new Set(['critical', 'high']);

export function countSeverities(findings: ReviewFinding[]): SeverityCounts {
  const counts: SeverityCounts = { blocking: 0, nit: 0, pre_existing: 0 };
  for (const f of findings) {
    if (f.preExisting) counts.pre_existing++;
    else if (BLOCKING.has(f.severity)) counts.blocking++;
    else counts.nit++;
  }
  return counts;
}

/**
 * Map a finding to an annotation level. Pre-existing issues are always a plain
 * notice — they are context, not something this author must act on.
 */
export function annotationLevel(f: ReviewFinding): CheckAnnotation['annotation_level'] {
  if (f.preExisting) return 'notice';
  return BLOCKING.has(f.severity) ? 'failure' : 'warning';
}

function marker(f: ReviewFinding): string {
  if (f.preExisting) return '🟣 Pre-existing';
  return BLOCKING.has(f.severity) ? '🔴 Important' : '🟡 Nit';
}

export function toAnnotations(findings: ReviewFinding[]): CheckAnnotation[] {
  return findings.slice(0, MAX_ANNOTATIONS).map((f) => ({
    path: f.file,
    // GitHub requires start_line <= end_line, and rejects line 0.
    start_line: Math.max(1, Math.min(f.startLine, f.endLine)),
    end_line: Math.max(1, f.endLine),
    annotation_level: annotationLevel(f),
    title: `${marker(f)} · ${f.category}`,
    message: f.body || f.title,
  }));
}

/** Escape pipes so a finding title can't break out of the markdown table. */
function cell(s: string): string {
  return String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

/**
 * Build the full check-run output. The last line of `text` is a machine-readable
 * comment a CI job can parse to gate merges on its own terms:
 *
 *   gh api repos/O/R/check-runs/ID --jq '.output.text
 *     | split("forge-severity: ")[1] | split(" -->")[0] | fromjson'
 */
export function buildCheckRunOutput(findings: ReviewFinding[]): CheckRunOutput {
  const counts = countSeverities(findings);
  const footer = `\n\n<!-- forge-severity: ${JSON.stringify(counts)} -->`;

  if (findings.length === 0) {
    return {
      title: 'No issues found',
      summary:
        '✅ **No issues found.** Reviewed the changed files for correctness bugs, ' +
        'security vulnerabilities, and regressions.',
      text: '_No findings._' + footer,
      annotations: [],
    };
  }

  const order = (f: ReviewFinding) => (f.preExisting ? 2 : BLOCKING.has(f.severity) ? 0 : 1);
  const sorted = [...findings].sort((a, b) => order(a) - order(b));

  const rows = sorted
    .map((f) => `| ${marker(f)} | \`${cell(f.file)}:${f.endLine}\` | ${cell(f.title)} |`)
    .join('\n');

  const parts = [
    counts.blocking ? `${counts.blocking} important` : '',
    counts.nit ? `${counts.nit} nit${counts.nit === 1 ? '' : 's'}` : '',
    counts.pre_existing ? `${counts.pre_existing} pre-existing` : '',
  ].filter(Boolean);

  return {
    title: `${findings.length} finding${findings.length === 1 ? '' : 's'} — ${parts.join(', ')}`,
    summary: `Found **${findings.length}** issue(s): ${parts.join(' · ')}.`,
    text: `| Severity | File:Line | Issue |\n| --- | --- | --- |\n${rows}${footer}`,
    annotations: toAnnotations(findings),
  };
}

export interface CheckRunParams {
  owner: string;
  repo: string;
  head_sha: string;
  name: string;
  status: 'completed';
  conclusion: 'neutral';
  output: CheckRunOutput;
}

/** Assemble the create-check-run request. Conclusion is neutral by construction. */
export function buildCheckRunRequest(
  owner: string,
  repo: string,
  headSha: string,
  findings: ReviewFinding[],
): CheckRunParams {
  return {
    owner,
    repo,
    head_sha: headSha,
    name: CHECK_RUN_NAME,
    status: 'completed',
    conclusion: 'neutral',
    output: buildCheckRunOutput(findings),
  };
}
