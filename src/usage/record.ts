import type { AgentEvent, AgentResult } from '../agent/loop.js';
import type { LLMClient } from '../providers/types.js';
import { estimateCost } from '../util/cost.js';
import type { ReviewFinding } from '../github/review.js';
import type { FindingRecord, Recorder, RunMeta, RunOutcome } from './types.js';

/**
 * The bridge between the agent loop and a recorder.
 *
 * The loop emits events and knows nothing about storage; the recorder stores
 * records and knows nothing about the loop. This translates, so neither has to
 * learn about the other and a run with no recorder costs one no-op call.
 */

/** Feed loop events straight into a recorder. Fire-and-forget by design. */
export function recordingListener(
  recorder: Recorder,
  runId: string,
  phase = 'main',
  onEvent?: (e: AgentEvent) => void,
): (e: AgentEvent) => void {
  return (e: AgentEvent) => {
    onEvent?.(e);
    if (!runId) return;

    // Not awaited: recording must never add latency to a run, and every
    // implementation already swallows its own failures.
    if (e.type === 'turn') {
      void recorder.recordTurn(runId, {
        phase,
        idx: e.idx,
        startedAt: e.startedAt,
        latencyMs: e.latencyMs,
        usage: e.usage,
        stopReason: e.stopReason,
        ...(e.reasoningChars ? { reasoningChars: e.reasoningChars } : {}),
      });
    } else if (e.type === 'tool_done') {
      void recorder.recordTool(runId, {
        phase,
        turnIdx: e.turnIdx,
        name: e.name,
        durationMs: e.durationMs,
        ok: e.ok,
        ...(e.error ? { error: e.error } : {}),
        outputBytes: e.outputBytes,
      });
    }
  };
}

/** Build the closing record from what the loop returned. */
export function outcomeFrom(
  result: AgentResult,
  client: LLMClient,
  endedAt: number,
  extra: { resultUrl?: string; error?: string } = {},
): RunOutcome {
  const cost = estimateCost(result.usage, client.model);
  return {
    endedAt,
    status: extra.error ? 'failed' : 'ok',
    iterations: result.iterations,
    stoppedBy: result.stoppedBy,
    usage: result.usage,
    usd: cost.usd,
    usdUncached: cost.usdWithoutCache,
    ...(extra.resultUrl ? { resultUrl: extra.resultUrl } : {}),
    ...(extra.error ? { error: extra.error } : {}),
  };
}

/** Findings, flattened for storage so they are queryable without a file. */
export function findingRecords(findings: ReviewFinding[], postedInline: Set<string> = new Set()): FindingRecord[] {
  return findings.map((f) => ({
    file: f.file,
    line: f.endLine,
    lens: f.lens,
    severity: f.severity,
    ...(f.category ? { category: f.category } : {}),
    title: f.title,
    preExisting: Boolean(f.preExisting),
    postedInline: postedInline.has(`${f.file}:${f.endLine}`),
  }));
}

/** Assemble the opening record. Kept here so handlers stay declarative. */
export function runMeta(
  base: Omit<RunMeta, 'provider' | 'model' | 'startedAt'>,
  client: LLMClient,
  startedAt: number,
): RunMeta {
  return { ...base, provider: client.id, model: client.model, startedAt };
}
