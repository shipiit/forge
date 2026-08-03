import type { AgentEvent, AgentResult } from '../agent/loop.js';
import type { LLMClient, Usage } from '../providers/types.js';
import type { ReviewFinding } from '../github/review.js';
import { estimateCost } from '../util/cost.js';
import { findingRecords, recordingListener } from './record.js';
import { noopRecorder, type ArtifactKind, type Recorder, type RunMeta } from './types.js';

/**
 * One run, tracked from open to close.
 *
 * A single webhook can drive several agent segments — the fix, then the
 * self-review over its diff, then any sub-agents it spawned. They are one run
 * to a maintainer, so they are one row here, with each segment's turns kept
 * apart by its phase.
 *
 * Handlers touch this in two places per agent call — `listen()` going in,
 * `add()` coming out — so instrumenting a handler stays a two-line change
 * rather than a re-indent of its whole body.
 */
export interface RunTracker {
  /** Empty when nothing is recording, which is the default. */
  readonly id: string;
  /** The event listener for one segment. Chains any listener of your own. */
  listen(phase?: string, onEvent?: (e: AgentEvent) => void): (e: AgentEvent) => void;
  /** Fold a finished segment into the run total. Returns it, so it inlines. */
  add(result: AgentResult): AgentResult;
  findings(findings: ReviewFinding[], postedInline?: Set<string>): void;
  artifact(kind: ArtifactKind, body: string): void;
  /** The PR, issue, or comment this run produced. */
  link(url: string): void;
  /** Close as deliberately-did-nothing rather than as a success. */
  skip(reason?: string): void;
}

interface TrackerInternals extends RunTracker {
  finish(error?: unknown): Promise<void>;
}

const zero = (): Usage => ({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 });

/** Segments are separate API calls; their usage adds up. */
function accumulate(total: Usage, next: Usage): Usage {
  return {
    inputTokens: total.inputTokens + next.inputTokens,
    outputTokens: total.outputTokens + next.outputTokens,
    cacheReadTokens: (total.cacheReadTokens ?? 0) + (next.cacheReadTokens ?? 0),
    cacheWriteTokens: (total.cacheWriteTokens ?? 0) + (next.cacheWriteTokens ?? 0),
  };
}

/**
 * A run that hit its spend cap in any segment stopped for that reason, even if
 * a later segment ended cleanly. Reporting the last segment's reason would hide
 * the truncation that matters.
 */
function worstStop(stops: string[]): string | undefined {
  return stops.find((s) => s === 'budget') ?? stops.find((s) => s === 'limit') ?? stops[stops.length - 1];
}

/**
 * Open a run, hand a tracker to the body, and close the run whatever happens.
 *
 * The close is in a `finally` on purpose: handlers throw (a clone fails, the
 * API 500s) and handlers decline (rate limited, disabled by config). If closing
 * only happened on the happy path, those runs would sit at `running` forever
 * and the dashboard would show phantom work in flight.
 */
export async function tracked<T>(
  opts: {
    recorder?: Recorder;
    client: LLMClient;
    meta: Omit<RunMeta, 'provider' | 'model' | 'startedAt'>;
    now?: () => number;
  },
  body: (run: RunTracker) => Promise<T>,
): Promise<T> {
  const recorder = opts.recorder ?? noopRecorder;
  const now = opts.now ?? Date.now;
  const startedAt = now();

  let id = '';
  try {
    id = await recorder.startRun({ ...opts.meta, provider: opts.client.id, model: opts.client.model, startedAt });
  } catch {
    /* a recorder that cannot open a run must not stop the run happening */
  }

  let usage = zero();
  let iterations = 0;
  const stops: string[] = [];
  let resultUrl: string | undefined;
  let skipped: string | undefined;

  const run: TrackerInternals = {
    id,
    listen(phase = 'main', onEvent?: (e: AgentEvent) => void) {
      return recordingListener(recorder, id, phase, onEvent);
    },
    add(result) {
      usage = accumulate(usage, result.usage);
      iterations += result.iterations;
      stops.push(result.stoppedBy);
      return result;
    },
    findings(findings, postedInline) {
      if (!id || findings.length === 0) return;
      void recorder.recordFindings(id, findingRecords(findings, postedInline));
    },
    artifact(kind, text) {
      if (!id || !text) return;
      void recorder.putArtifact(id, kind, text);
    },
    link(url) {
      resultUrl = url;
    },
    skip(reason) {
      skipped = reason ?? 'skipped';
    },
    async finish(error?: unknown) {
      if (!id) return;
      const cost = estimateCost(usage, opts.client.model);
      const message = error instanceof Error ? error.message : error ? String(error) : undefined;
      try {
        await recorder.endRun(id, {
          endedAt: now(),
          status: message ? 'failed' : skipped ? 'skipped' : 'ok',
          iterations,
          ...(worstStop(stops) ? { stoppedBy: worstStop(stops) } : {}),
          usage,
          usd: cost.usd,
          usdUncached: cost.usdWithoutCache,
          ...(resultUrl ? { resultUrl } : {}),
          ...(message ? { error: message } : skipped ? { error: skipped } : {}),
        });
      } catch {
        /* best effort, as everywhere else in this module */
      }
    },
  };

  try {
    const out = await body(run);
    await run.finish();
    return out;
  } catch (err) {
    await run.finish(err);
    throw err;
  }
}
