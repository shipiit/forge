import type { AgentResult } from '../agent/loop.js';
import type { ReviewFinding } from '../github/review.js';
import { applyVerdicts, parseVerdicts, renderCandidates } from '../github/verify.js';
import { findingKey } from '../scan/types.js';
import { mergeCoverage, parseSliceReport, type CoverageEntry } from './report.js';
import type { AuditSlice } from './slices.js';

export interface AuditOptions {
  slices: AuditSlice[];
  /** One specialist's agent run. */
  find(slice: AuditSlice): Promise<AgentResult>;
  /** The verifier over every specialist's candidates. */
  verify(candidates: string): Promise<AgentResult>;
  log(msg: string): void;
  /** Specialists running at once. Providers rate-limit; eight at once mostly buys 429s. */
  concurrency?: number;
}

export interface AuditOutcome {
  findings: ReviewFinding[];
  coverage: CoverageEntry[];
  results: AgentResult[];
  rejected: Array<{ finding: ReviewFinding; reason: string }>;
  verified: boolean;
  /** Slices that returned, and those whose agent failed. */
  ran: string[];
  failed: string[];
}

/** One run per slice, at most `n` at a time, in slice order. */
async function settleEach<T, R>(items: T[], n: number, fn: (item: T) => Promise<R>): Promise<Array<PromiseSettledResult<R>>> {
  const out: Array<PromiseSettledResult<R>> = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      try {
        out[i] = { status: 'fulfilled', value: await fn(items[i]!) };
      } catch (reason) {
        out[i] = { status: 'rejected', reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(n, items.length)) }, worker));
  return out;
}

/**
 * The whole-repository audit: every applicable slice in parallel, then one
 * verifier over everything they found, then a coverage map that says what was
 * looked at as well as what was found.
 */
export async function runAudit(o: AuditOptions): Promise<AuditOutcome> {
  const settled = await settleEach(o.slices, o.concurrency ?? 3, (s) => o.find(s));
  const results: AgentResult[] = [];
  const ran: string[] = [];
  const failed: string[] = [];
  const coverageIn: Array<CoverageEntry & { slice: string }> = [];
  const candidates: ReviewFinding[] = [];
  const slicesOf = new Map<string, Set<string>>();

  settled.forEach((s, i) => {
    const slice = o.slices[i]!;
    if (s.status === 'rejected') {
      failed.push(slice.id);
      o.log(`audit: ${slice.id} failed (${s.reason instanceof Error ? s.reason.message : 'unknown'})`);
      return;
    }
    results.push(s.value);
    ran.push(slice.id);
    const report = parseSliceReport(s.value.finalText);
    coverageIn.push(...report.coverage.filter((c) => slice.rows.includes(c.row)).map((c) => ({ ...c, slice: slice.id })));
    for (const f of report.findings) {
      const key = findingKey(f);
      if (!slicesOf.has(key)) candidates.push(f);
      slicesOf.set(key, new Set([...(slicesOf.get(key) ?? []), slice.id]));
    }
  });
  if (ran.length === 0) throw new Error('every audit specialist failed');

  const ranRows = new Set(o.slices.filter((s) => ran.includes(s.id)).flatMap((s) => s.rows));
  const finish = (findings: ReviewFinding[], keptKeys: string[], rejected: AuditOutcome['rejected'], verified: boolean): AuditOutcome => {
    const confirmedSlices = new Set(keptKeys.flatMap((k) => [...(slicesOf.get(k) ?? [])]));
    return { findings, coverage: mergeCoverage(coverageIn, { confirmedSlices, ranRows }), results, rejected, verified, ran, failed };
  };

  if (candidates.length === 0) return finish([], [], [], true);
  try {
    const check = await o.verify(renderCandidates(candidates));
    results.push(check);
    const verdicts = parseVerdicts(check.finalText);
    if (verdicts.size === 0) {
      o.log('audit: verification returned no verdicts; keeping every candidate');
      return finish(candidates, candidates.map(findingKey), [], false);
    }
    const { kept, keptIds, rejected } = applyVerdicts(candidates, verdicts);
    o.log(`audit: ${ran.length} specialists, ${candidates.length} candidates, kept ${kept.length}`);
    return finish(kept, keptIds.map((i) => findingKey(candidates[i]!)), rejected, true);
  } catch (err) {
    o.log(`audit: verification failed (${err instanceof Error ? err.message : 'unknown'}); keeping every candidate`);
    return finish(candidates, candidates.map(findingKey), [], false);
  }
}
