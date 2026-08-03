import { DatabaseSync } from 'node:sqlite';
import { promises as fs, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { redactSecrets } from '../util/resilience.js';
import { MIGRATIONS, PRAGMAS, RETENTION_DAYS, SCHEMA_VERSION } from './schema.js';
import {
  newId,
  type ArtifactKind,
  type FindingRecord,
  type OutputRecord,
  type Recorder,
  type RunMeta,
  type RunOutcome,
  type ToolRecord,
  type TurnRecord,
} from './types.js';

/**
 * SQLite-backed recorder.
 *
 * Uses `node:sqlite`, built into Node 22, rather than `better-sqlite3` — the
 * agent ships as a Docker action and a native module would mean compiling it in
 * that image for no benefit at this scale.
 *
 * Every method swallows its own errors. Telemetry is not worth failing a run
 * over, so a locked database or a full disk costs a row, not a review.
 */
export class SQLiteRecorder implements Recorder {
  private db: DatabaseSync;
  private artifactDir: string;
  private now: () => number;

  constructor(opts: { file: string; artifactDir?: string; now?: () => number }) {
    // SQLite will not create the directory, and the caller's failure path is a
    // silent fall back to recording nothing — so `FORGE_USAGE_DB=.forge/usage.db`
    // on a machine without a .forge directory looked exactly like recording
    // being switched off.
    mkdirSync(path.dirname(path.resolve(opts.file)), { recursive: true });
    this.db = new DatabaseSync(opts.file);
    this.db.exec(PRAGMAS);
    migrate(this.db);
    this.artifactDir = opts.artifactDir ?? path.join(path.dirname(opts.file), 'artifacts');
    this.now = opts.now ?? Date.now;
  }

  /** Wrap every write: a telemetry failure must never surface to the caller. */
  private safe(fn: () => void): void {
    try {
      fn();
    } catch {
      /* recording is best effort, by design */
    }
  }

  async startRun(m: RunMeta): Promise<string> {
    const id = newId(m.startedAt);
    this.safe(() =>
      this.db
        .prepare(
          `INSERT INTO runs (id, started_at, status, host, owner, repo, surface, flow, trigger,
             skill, routine, issue_number, pr_number, actor, provider, model)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          id,
          m.startedAt,
          'running',
          m.host,
          m.owner,
          m.repo,
          m.surface,
          m.flow,
          m.trigger,
          m.skill ?? null,
          m.routine ?? null,
          m.issueNumber ?? null,
          m.prNumber ?? null,
          m.actor ?? null,
          m.provider,
          m.model,
        ),
    );
    return id;
  }

  async recordTurn(runId: string, t: TurnRecord): Promise<void> {
    if (!runId) return;
    this.safe(() =>
      this.db
        .prepare(
          `INSERT OR REPLACE INTO turns (id, run_id, phase, idx, started_at, latency_ms,
             input_tokens, output_tokens, cache_read, cache_write, stop_reason, reasoning_chars, retries)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          newId(t.startedAt),
          runId,
          t.phase ?? 'main',
          t.idx,
          t.startedAt,
          t.latencyMs,
          t.usage.inputTokens,
          t.usage.outputTokens,
          t.usage.cacheReadTokens ?? 0,
          t.usage.cacheWriteTokens ?? 0,
          t.stopReason,
          t.reasoningChars ?? null,
          t.retries ?? 0,
        ),
    );
  }

  async recordTool(runId: string, t: ToolRecord): Promise<void> {
    if (!runId) return;
    this.safe(() =>
      this.db
        .prepare(
          `INSERT INTO tool_calls (id, run_id, phase, turn_idx, name, args_preview, duration_ms, ok, error, output_bytes)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          newId(this.now()),
          runId,
          t.phase ?? 'main',
          t.turnIdx,
          t.name,
          // Tool arguments carry file paths and sometimes file contents.
          t.argsPreview ? redactSecrets(t.argsPreview).slice(0, 500) : null,
          t.durationMs,
          t.ok ? 1 : 0,
          t.error ? redactSecrets(t.error).slice(0, 500) : null,
          t.outputBytes ?? null,
        ),
    );
  }

  async recordFindings(runId: string, findings: FindingRecord[]): Promise<void> {
    if (!runId || findings.length === 0) return;
    this.safe(() => {
      const stmt = this.db.prepare(
        `INSERT INTO findings (id, run_id, file, line, lens, severity, category, title, pre_existing, posted_inline)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
      );
      for (const f of findings) {
        stmt.run(
          newId(this.now()),
          runId,
          f.file,
          f.line ?? null,
          f.lens,
          f.severity,
          f.category ?? null,
          f.title,
          f.preExisting ? 1 : 0,
          f.postedInline ? 1 : 0,
        );
      }
    });
  }

  async recordOutput(runId: string, o: OutputRecord): Promise<void> {
    if (!runId) return;
    this.safe(() =>
      this.db
        .prepare(`INSERT INTO outputs (id, run_id, kind, ref, url, title, created_at) VALUES (?,?,?,?,?,?,?)`)
        .run(newId(this.now()), runId, o.kind, o.ref ?? null, o.url ?? null, o.title ? o.title.slice(0, 300) : null, this.now()),
    );
  }

  /** Gzip to disk, index by path. A transcript never enters a column. */
  async putArtifact(runId: string, kind: ArtifactKind, body: string): Promise<void> {
    if (!runId || !body) return;
    try {
      const at = this.now();
      const d = new Date(at);
      const rel = path.join(
        String(d.getUTCFullYear()),
        String(d.getUTCMonth() + 1).padStart(2, '0'),
        runId,
        `${kind}.gz`,
      );
      const abs = path.join(this.artifactDir, rel);
      await fs.mkdir(path.dirname(abs), { recursive: true });

      // A transcript contains file contents, and file contents contain keys.
      const gz = gzipSync(Buffer.from(redactSecrets(body), 'utf8'));
      await fs.writeFile(abs, gz);

      this.safe(() =>
        this.db
          .prepare(`INSERT INTO artifacts (id, run_id, kind, path, bytes, created_at) VALUES (?,?,?,?,?,?)`)
          .run(newId(at), runId, kind, rel, gz.byteLength, at),
      );
    } catch {
      /* best effort */
    }
  }

  async endRun(runId: string, o: RunOutcome): Promise<void> {
    if (!runId) return;
    this.safe(() =>
      this.db
        .prepare(
          `UPDATE runs SET ended_at=?, status=?, iterations=?, stopped_by=?, error=?, result_url=?,
             fell_back_to=?, input_tokens=?, output_tokens=?, cache_read=?, cache_write=?, usd=?, usd_uncached=?
           WHERE id=?`,
        )
        .run(
          o.endedAt,
          o.status,
          o.iterations,
          o.stoppedBy ?? null,
          o.error ? redactSecrets(o.error).slice(0, 1000) : null,
          o.resultUrl ?? null,
          o.fellBackTo ?? null,
          o.usage.inputTokens,
          o.usage.outputTokens,
          o.usage.cacheReadTokens ?? 0,
          o.usage.cacheWriteTokens ?? 0,
          o.usd,
          o.usdUncached,
          runId,
        ),
    );
  }

  /**
   * Delete what has aged out. Returns what it removed, so a caller can log it.
   * Runs, turns, and findings are kept — they are the trend data and they are
   * tiny.
   */
  async prune(now = this.now()): Promise<{ artifacts: number; toolCalls: number }> {
    let artifacts = 0;
    let toolCalls = 0;
    const day = 24 * 60 * 60 * 1000;

    try {
      for (const [kind, days] of [
        ['transcript', RETENTION_DAYS.transcript],
        ['final_text', RETENTION_DAYS.final_text],
        ['diff', RETENTION_DAYS.diff],
        ['findings', RETENTION_DAYS.findings_artifact],
      ] as const) {
        if (!days) continue;
        const cutoff = now - days * day;
        const rows = this.db
          .prepare(`SELECT id, path FROM artifacts WHERE kind = ? AND created_at < ?`)
          .all(kind, cutoff) as Array<{ id: string; path: string }>;
        for (const r of rows) {
          await fs.rm(path.join(this.artifactDir, r.path), { force: true });
          this.db.prepare(`DELETE FROM artifacts WHERE id = ?`).run(r.id);
          artifacts++;
        }
      }

      if (RETENTION_DAYS.tool_calls) {
        const cutoff = now - RETENTION_DAYS.tool_calls * day;
        const res = this.db
          .prepare(`DELETE FROM tool_calls WHERE run_id IN (SELECT id FROM runs WHERE started_at < ?)`)
          .run(cutoff);
        toolCalls = Number(res.changes ?? 0);
      }
    } catch {
      /* pruning is maintenance; never let it throw into a run */
    }
    return { artifacts, toolCalls };
  }

  /** Escape hatch for the read API and tests. */
  get database(): DatabaseSync {
    return this.db;
  }

  async close(): Promise<void> {
    this.safe(() => this.db.close());
  }
}

/**
 * Run whatever migrations this database has not seen.
 *
 * `user_version` is a SQLite-native integer with no table of its own, which
 * makes it the cheapest possible place to keep this.
 */
export function migrate(db: DatabaseSync): number {
  const row = db.prepare('PRAGMA user_version').get() as { user_version?: number } | undefined;
  const at = Number(row?.user_version ?? 0);
  for (let v = at; v < MIGRATIONS.length; v++) {
    db.exec(MIGRATIONS[v]!);
    // Not bindable in a PRAGMA, hence the interpolation — the value is a
    // loop counter, never user input.
    db.exec(`PRAGMA user_version = ${v + 1}`);
  }
  return SCHEMA_VERSION;
}
