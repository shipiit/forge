import type { AgentResult } from '../agent/loop.js';
import { addUsage } from '../util/cost.js';
import { parseFindings, type ReviewFinding } from './review.js';
import { dedupe } from '../scan/types.js';

/**
 * Find, then verify.
 *
 * A reviewer that posts whatever it first suspects is a reviewer people learn
 * to skim. Both Claude's Code Review and Cursor's Bugbot put a second, separate
 * look between "this might be a bug" and a comment on somebody's pull request:
 * it goes back to the code and drops what the code does not bear out. This is
 * that step, and the depth setting decides how much finding happens before it.
 *
 *   light    one pass, posted as found — the cheapest review
 *   standard one pass, then verification — the default
 *   deep     three passes with different focus, merged, then verification
 */

export type ReviewDepth = 'light' | 'standard' | 'deep';

/** The focus of each finder in a deep review. Different questions find different bugs. */
export const FINDER_FOCUS: readonly string[] = [
  'Focus on correctness: logic errors, wrong conditions, off-by-one, broken invariants, and behaviour that changed for existing callers.',
  'Focus on security: follow every value an outsider controls from where it enters to where it is used, and check authorization on every path.',
  'Focus on failure: error handling, null and empty inputs, concurrency, resource leaks, and what happens when a dependency is slow or down.',
];

/**
 * One run's spend cap, shared between its passes.
 *
 * `spend_cap_per_run_usd` is a ceiling for the run, not for each agent in it.
 * The finders split most of it; the verifier, which re-reads named lines
 * rather than exploring, gets the rest.
 */
export function splitSpend(depth: ReviewDepth, capUsd: number): { finder: number; verify: number } {
  if (depth === 'light') return { finder: capUsd, verify: 0 };
  const finders = depth === 'deep' ? FINDER_FOCUS.length : 1;
  return { finder: (capUsd * 0.7) / finders, verify: capUsd * 0.3 };
}

export interface Verdict {
  verdict: 'confirmed' | 'rejected';
  reason?: string;
  severity?: ReviewFinding['severity'];
  /** Id of another candidate that reports the same problem. */
  duplicateOf?: number;
}

const RANK: Record<ReviewFinding['severity'], number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };

/** The candidates as the verifier reads them: numbered, without suggestions to anchor on. */
export function renderCandidates(candidates: ReviewFinding[]): string {
  return JSON.stringify(
    candidates.map((f, id) => ({
      id,
      file: f.file,
      startLine: f.startLine,
      endLine: f.endLine,
      lens: f.lens,
      severity: f.severity,
      category: f.category,
      title: f.title,
      body: f.body,
    })),
    null,
    2,
  );
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isSeverity(v: unknown): v is ReviewFinding['severity'] {
  return typeof v === 'string' && Object.hasOwn(RANK, v);
}

/** Verdicts by candidate id. Anything malformed is skipped, never guessed at. */
export function parseVerdicts(text: string): Map<number, Verdict> {
  const out = new Map<number, Verdict>();
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start < 0 || end <= start) return out;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return out;
  }
  if (!Array.isArray(parsed)) return out;
  for (const raw of parsed) {
    if (!isRecord(raw) || typeof raw.id !== 'number' || !Number.isInteger(raw.id)) continue;
    if (raw.verdict !== 'confirmed' && raw.verdict !== 'rejected') continue;
    const severity = isSeverity(raw.severity) ? raw.severity : undefined;
    out.set(raw.id, {
      verdict: raw.verdict,
      reason: typeof raw.reason === 'string' ? raw.reason : undefined,
      severity,
      duplicateOf: typeof raw.duplicateOf === 'number' && Number.isInteger(raw.duplicateOf) ? raw.duplicateOf : undefined,
    });
  }
  return out;
}

/**
 * Keep what the verifier confirmed.
 *
 * A candidate it said nothing about is kept: silence is not a rejection, and a
 * verifier that ran out of turns should not cost a real finding. It may lower a
 * severity, never raise one — it was asked whether a finding holds, not to
 * escalate it. A duplicate goes only when the one it duplicates survives.
 */
export function applyVerdicts(
  candidates: ReviewFinding[],
  verdicts: Map<number, Verdict>,
): { kept: ReviewFinding[]; keptIds: number[]; rejected: Array<{ finding: ReviewFinding; reason: string }> } {
  const survives = (id: number) => verdicts.get(id)?.verdict !== 'rejected';
  const kept: ReviewFinding[] = [];
  const keptIds: number[] = [];
  const rejected: Array<{ finding: ReviewFinding; reason: string }> = [];
  candidates.forEach((f, id) => {
    const v = verdicts.get(id);
    if (v?.verdict === 'rejected') {
      rejected.push({ finding: f, reason: v.reason ?? 'not borne out by the code' });
      return;
    }
    const dup = v?.duplicateOf;
    if (dup !== undefined && dup !== id && dup >= 0 && dup < candidates.length && survives(dup)) {
      rejected.push({ finding: f, reason: `same problem as ${candidates[dup]!.title}` });
      return;
    }
    const lowered = v?.severity && RANK[v.severity] < RANK[f.severity] ? v.severity : f.severity;
    kept.push({ ...f, severity: lowered });
    keptIds.push(id);
  });
  return { kept, keptIds, rejected };
}

/** One result standing for several agent runs, for the cost footer and the budget notice. */
export function combineResults(results: AgentResult[]): AgentResult {
  const [first, ...rest] = results;
  if (!first) throw new Error('no review pass ran');
  const budgetStop = results.find((r) => r.stoppedBy === 'budget');
  return {
    ...first,
    usage: rest.reduce((u, r) => addUsage(u, r.usage), first.usage),
    iterations: results.reduce((n, r) => n + r.iterations, 0),
    stoppedBy: budgetStop ? 'budget' : first.stoppedBy,
    budget: budgetStop?.budget ?? first.budget,
  };
}

export interface PassOptions {
  depth: ReviewDepth;
  /** One finder. `focus` is undefined for the general pass. */
  find(focus: string | undefined): Promise<AgentResult>;
  /** The verifier, given the numbered candidates. */
  verify(candidates: string): Promise<AgentResult>;
  log(msg: string): void;
}

export interface PassOutcome {
  findings: ReviewFinding[];
  /** Every agent run, finders first; for usage recording. */
  results: AgentResult[];
  rejected: Array<{ finding: ReviewFinding; reason: string }>;
  /** False when verification was due and did not complete. */
  verified: boolean;
}

/** Run the finders the depth calls for, then the verifier over what they found. */
export async function reviewPasses(o: PassOptions): Promise<PassOutcome> {
  const focuses = o.depth === 'deep' ? [...FINDER_FOCUS] : [undefined];
  const settled = await Promise.allSettled(focuses.map((f) => o.find(f)));
  const results = settled.flatMap((s) => (s.status === 'fulfilled' ? [s.value] : []));
  const failed = settled.find((s): s is PromiseRejectedResult => s.status === 'rejected');
  if (results.length === 0) throw failed?.reason ?? new Error('no review pass ran');
  if (failed) o.log(`review: ${settled.length - results.length} of ${settled.length} finders failed; using the rest`);

  const candidates = dedupe(results.flatMap((r) => parseFindings(r.finalText)));
  if (o.depth === 'light' || candidates.length === 0) {
    return { findings: candidates, results, rejected: [], verified: o.depth === 'light' || candidates.length === 0 };
  }

  try {
    const check = await o.verify(renderCandidates(candidates));
    results.push(check);
    const verdicts = parseVerdicts(check.finalText);
    if (verdicts.size === 0) {
      o.log('review: verification returned no verdicts; keeping every candidate');
      return { findings: candidates, results, rejected: [], verified: false };
    }
    const { kept, rejected } = applyVerdicts(candidates, verdicts);
    o.log(`review: verified ${candidates.length} candidate(s), kept ${kept.length}, dropped ${rejected.length}`);
    return { findings: kept, results, rejected, verified: true };
  } catch (err) {
    o.log(`review: verification failed (${err instanceof Error ? err.message : 'unknown'}); keeping every candidate`);
    return { findings: candidates, results, rejected: [], verified: false };
  }
}

/** One line under the review saying how it was checked, so an unverified review never passes for a verified one. */
export function renderVerification(depth: ReviewDepth, o: Pick<PassOutcome, 'findings' | 'rejected' | 'verified' | 'results'>): string {
  if (depth === 'light') return '';
  const finders = depth === 'deep' ? `${FINDER_FOCUS.length} reviewers` : 'one reviewer';
  if (!o.verified) {
    return `\n\n<sub>⚠️ Verification did not complete, so these findings from ${finders} are unverified.</sub>`;
  }
  const total = o.findings.length + o.rejected.length;
  if (total === 0) return `\n\n<sub>🔎 Reviewed by ${finders}; nothing to verify.</sub>`;
  return (
    `\n\n<sub>🔎 Reviewed by ${finders}, then verified against the code: kept ${o.findings.length} of ${total} ` +
    `candidate finding${total === 1 ? '' : 's'}${o.rejected.length ? `, dropped ${o.rejected.length} the code did not bear out` : ''}.</sub>`
  );
}
