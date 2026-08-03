import path from 'node:path';
import { execa } from 'execa';
import type { LLMClient } from '../providers/types.js';
import type { AgentEvent, AgentResult } from '../agent/loop.js';
import { estimateCost } from '../util/cost.js';
import { recordingListener, findingRecords } from './record.js';
import { createRecorder } from './index.js';
import type { ArtifactKind, Flow } from './types.js';
import type { ReviewFinding } from '../github/review.js';

/**
 * Recording a command-line run.
 *
 * The CLI has no webhook to wrap and no handler to thread deps through, so it
 * gets a small explicit tracker instead: open, listen, add, finish. Recording
 * stays off unless FORGE_USAGE_DB is set, so nothing changes for anyone who
 * has not asked for it.
 */
export interface CliTracker {
  listen(phase: string, onEvent?: (e: AgentEvent) => void): (e: AgentEvent) => void;
  add<T extends AgentResult>(result: T): T;
  findings(findings: ReviewFinding[]): void;
  artifact(kind: ArtifactKind, body: string): void;
  finish(error?: unknown): Promise<void>;
}

/** Name the repository the way the dashboard groups by: owner and name. */
async function repoIdentity(dir: string): Promise<{ owner: string; repo: string; host: string }> {
  const local = { owner: path.basename(path.dirname(path.resolve(dir))), repo: path.basename(path.resolve(dir)), host: 'local' };
  try {
    const { stdout } = await execa('git', ['remote', 'get-url', 'origin'], { cwd: dir, reject: false });
    const m = stdout.trim().match(/(?:@|:\/\/)([^/:]+)[/:]([^/]+)\/(.+?)(?:\.git)?$/);
    return m ? { host: m[1]!, owner: m[2]!, repo: m[3]! } : local;
  } catch {
    return local; // not a git repo, or no origin — the local name is enough
  }
}

export async function cliRun(
  client: LLMClient,
  opts: { flow: Flow; trigger: string; repo: string; skill?: string },
): Promise<CliTracker> {
  const recorder = createRecorder();
  const startedAt = Date.now();
  const { owner, repo, host } = await repoIdentity(opts.repo);

  let id = '';
  try {
    id = await recorder.startRun({
      host,
      owner,
      repo,
      surface: 'cli',
      flow: opts.flow,
      trigger: opts.trigger,
      provider: client.id,
      model: client.model,
      ...(opts.skill ? { skill: opts.skill } : {}),
      startedAt,
    });
  } catch {
    /* telemetry must never stop a run */
  }

  let usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  let iterations = 0;
  let stoppedBy = 'end';
  const transcript: unknown[] = [];

  return {
    listen: (phase, onEvent) => recordingListener(recorder, id, phase, onEvent),
    add(result) {
      usage = {
        inputTokens: usage.inputTokens + result.usage.inputTokens,
        outputTokens: usage.outputTokens + result.usage.outputTokens,
        cacheReadTokens: usage.cacheReadTokens + (result.usage.cacheReadTokens ?? 0),
        cacheWriteTokens: usage.cacheWriteTokens + (result.usage.cacheWriteTokens ?? 0),
      };
      iterations += result.iterations;
      if (result.stoppedBy !== 'end') stoppedBy = result.stoppedBy;
      if (id) transcript.push({ messages: result.messages, finalText: result.finalText });
      return result;
    },
    findings(findings) {
      if (id && findings.length) void recorder.recordFindings(id, findingRecords(findings));
    },
    artifact(kind, body) {
      if (id && body) void recorder.putArtifact(id, kind, body);
    },
    async finish(error?: unknown) {
      if (!id) return;
      const cost = estimateCost(usage, client.model);
      const message = error instanceof Error ? error.message : error ? String(error) : undefined;
      try {
        if (transcript.length) await recorder.putArtifact(id, 'transcript', JSON.stringify(transcript));
        await recorder.endRun(id, {
          endedAt: Date.now(),
          status: message ? 'failed' : 'ok',
          iterations,
          stoppedBy,
          usage,
          usd: cost.usd,
          usdUncached: cost.usdWithoutCache,
          ...(message ? { error: message } : {}),
        });
        await recorder.close?.();
      } catch {
        /* best effort */
      }
    },
  };
}
