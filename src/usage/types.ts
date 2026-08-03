import type { Usage } from '../providers/types.js';

/**
 * Recording what the agent did.
 *
 * One interface, several backends: SQLite on a host with a disk, HTTP for a
 * throwaway Action container that has none, and a no-op everywhere else. The
 * handlers only ever see this, so adding a backend never touches them.
 *
 * **Recording must never break a run.** Every implementation swallows its own
 * failures. A full disk or a locked database is a reason to lose telemetry, not
 * a reason to fail somebody's code review.
 */

/**
 * The flows a run can belong to. Pinned to a union deliberately: handlers
 * passing ad-hoc strings would give the dashboard `review` and `pr_review` as
 * two different rows in every group-by.
 */
export type Flow =
  | 'analyze'
  | 'fix'
  | 'review'
  | 'followup'
  | 'mention'
  | 'audit'
  | 'ci'
  | 'history'
  | 'routine'
  | 'release';

export interface RunMeta {
  host: string;
  owner: string;
  repo: string;
  /** Which entry point this ran from. */
  surface: 'app' | 'action' | 'cli';
  flow: Flow;
  /** What started it: issues.opened, /fix, schedule, … */
  trigger: string;
  provider: string;
  model: string;
  skill?: string;
  routine?: string;
  issueNumber?: number;
  prNumber?: number;
  actor?: string;
  startedAt: number;
}

export interface TurnRecord {
  /** Which agent segment this turn belongs to: main, self_review, sub1, … */
  phase?: string;
  idx: number;
  startedAt: number;
  latencyMs: number;
  usage: Usage;
  stopReason: string;
  reasoningChars?: number;
  retries?: number;
}

export interface ToolRecord {
  phase?: string;
  turnIdx: number;
  name: string;
  /** Truncated and redacted before it ever reaches here. */
  argsPreview?: string;
  durationMs: number;
  ok: boolean;
  error?: string;
  outputBytes?: number;
}

export interface FindingRecord {
  file: string;
  line?: number;
  lens: string;
  severity: string;
  category?: string;
  title: string;
  preExisting?: boolean;
  postedInline?: boolean;
}

export interface RunOutcome {
  endedAt: number;
  status: 'ok' | 'failed' | 'skipped';
  iterations: number;
  stoppedBy?: string;
  usage: Usage;
  usd: number;
  usdUncached: number;
  error?: string;
  resultUrl?: string;
  fellBackTo?: string;
}

export type ArtifactKind = 'transcript' | 'final_text' | 'diff' | 'findings';

export interface Recorder {
  startRun(meta: RunMeta): Promise<string>;
  recordTurn(runId: string, turn: TurnRecord): Promise<void>;
  recordTool(runId: string, tool: ToolRecord): Promise<void>;
  recordFindings(runId: string, findings: FindingRecord[]): Promise<void>;
  putArtifact(runId: string, kind: ArtifactKind, body: string): Promise<void>;
  endRun(runId: string, outcome: RunOutcome): Promise<void>;
  close?(): Promise<void>;
}

/**
 * The default. Costs nothing, records nothing, and means every handler and test
 * works without a database — recording is opt-in infrastructure, not a
 * prerequisite for the agent to run.
 */
export const noopRecorder: Recorder = {
  async startRun() {
    return '';
  },
  async recordTurn() {},
  async recordTool() {},
  async recordFindings() {},
  async putArtifact() {},
  async endRun() {},
};

/** Monotonic-ish sortable id: time prefix + randomness, hex, no dependency. */
export function newId(now: number, rand: () => number = Math.random): string {
  const time = now.toString(16).padStart(12, '0');
  const noise = Math.floor(rand() * 0xffffffff)
    .toString(16)
    .padStart(8, '0');
  return `${time}${noise}`;
}
