import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import os from 'node:os';
import path from 'node:path';
import { SQLiteRecorder } from '../../src/usage/sqlite.js';
import { newId, noopRecorder, type RunMeta } from '../../src/usage/types.js';
import { recordingListener, findingRecords, outcomeFrom } from '../../src/usage/record.js';
import type { AgentEvent, AgentResult } from '../../src/agent/loop.js';
import type { ReviewFinding } from '../../src/github/review.js';

const T0 = 1_754_000_000_000;

const meta = (over: Partial<RunMeta> = {}): RunMeta => ({
  host: 'github.com',
  owner: 'acme',
  repo: 'web',
  surface: 'app',
  flow: 'review',
  trigger: 'pull_request.opened',
  provider: 'anthropic',
  model: 'claude-sonnet-4-5',
  startedAt: T0,
  ...over,
});

let dir: string;
let rec: SQLiteRecorder;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'forge-usage-'));
  rec = new SQLiteRecorder({ file: path.join(dir, 'usage.db'), now: () => T0 });
});
afterEach(async () => {
  await rec.close();
  await fs.rm(dir, { recursive: true, force: true });
});

const rows = (sql: string, ...args: unknown[]) => rec.database.prepare(sql).all(...(args as never[])) as any[];

describe('ids', () => {
  it('sort chronologically, so a listing is time-ordered without an index scan', () => {
    const early = newId(T0, () => 0.9);
    const late = newId(T0 + 1000, () => 0.1);
    expect(early < late).toBe(true);
  });

  it('do not collide within the same millisecond', () => {
    let i = 0;
    const a = newId(T0, () => (i++, 0.1));
    const b = newId(T0, () => 0.9);
    expect(a).not.toBe(b);
  });
});

describe('recording a run', () => {
  it('opens as running and closes with the outcome', async () => {
    const id = await rec.startRun(meta());
    expect(rows('SELECT status FROM runs WHERE id=?', id)[0].status).toBe('running');

    await rec.endRun(id, {
      endedAt: T0 + 5000,
      status: 'ok',
      iterations: 4,
      stoppedBy: 'end',
      usage: { inputTokens: 1000, outputTokens: 200, cacheReadTokens: 800 },
      usd: 0.01,
      usdUncached: 0.03,
      resultUrl: 'https://github.com/acme/web/pull/1',
    });

    const r = rows('SELECT * FROM runs WHERE id=?', id)[0];
    expect(r.status).toBe('ok');
    expect(r.iterations).toBe(4);
    expect(r.cache_read).toBe(800);
    expect(r.usd_uncached).toBeCloseTo(0.03, 5);
    expect(r.result_url).toContain('/pull/1');
  });

  it('keeps every dimension the dashboard filters on', async () => {
    const id = await rec.startRun(meta({ flow: 'audit', skill: 'security-audit', actor: 'octocat', prNumber: 7 }));
    const r = rows('SELECT * FROM runs WHERE id=?', id)[0];
    expect(r.flow).toBe('audit');
    expect(r.skill).toBe('security-audit');
    expect(r.actor).toBe('octocat');
    expect(r.pr_number).toBe(7);
  });
});

describe('turns and tools', () => {
  it('records per-turn usage, which aggregate usage cannot answer', async () => {
    const id = await rec.startRun(meta());
    await rec.recordTurn(id, {
      idx: 1,
      startedAt: T0,
      latencyMs: 1200,
      usage: { inputTokens: 500, outputTokens: 100, cacheReadTokens: 400 },
      stopReason: 'tool_use',
    });
    await rec.recordTurn(id, {
      idx: 2,
      startedAt: T0 + 2000,
      latencyMs: 900,
      usage: { inputTokens: 900, outputTokens: 50 },
      stopReason: 'end',
    });
    const turns = rows('SELECT * FROM turns WHERE run_id=? ORDER BY idx', id);
    expect(turns).toHaveLength(2);
    expect(turns[0].cache_read).toBe(400);
    expect(turns[1].latency_ms).toBe(900);
  });

  it('is idempotent per turn index, so a retry cannot double-count', async () => {
    const id = await rec.startRun(meta());
    const t = { idx: 1, startedAt: T0, latencyMs: 10, usage: { inputTokens: 1, outputTokens: 1 }, stopReason: 'end' };
    await rec.recordTurn(id, t);
    await rec.recordTurn(id, t);
    expect(rows('SELECT * FROM turns WHERE run_id=?', id)).toHaveLength(1);
  });

  it('records tool duration and failure, so p95 and error rate are answerable', async () => {
    const id = await rec.startRun(meta());
    await rec.recordTool(id, { turnIdx: 1, name: 'run_tests', durationMs: 45_000, ok: false, error: 'timed out' });
    await rec.recordTool(id, { turnIdx: 1, name: 'read_file', durationMs: 3, ok: true, outputBytes: 900 });
    const tools = rows('SELECT * FROM tool_calls WHERE run_id=? ORDER BY name', id);
    expect(tools.map((t) => t.name)).toEqual(['read_file', 'run_tests']);
    expect(tools[1].ok).toBe(0);
    expect(tools[1].duration_ms).toBe(45_000);
  });

  it('redacts secrets out of tool arguments', async () => {
    const id = await rec.startRun(meta());
    await rec.recordTool(id, {
      turnIdx: 1,
      name: 'run_bash',
      argsPreview: 'curl -H "Authorization: Bearer ghp_abcdefghijklmnopqrstuvwxyz0123"',
      durationMs: 5,
      ok: true,
    });
    const preview = rows('SELECT args_preview FROM tool_calls WHERE run_id=?', id)[0].args_preview;
    expect(preview).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz0123');
    expect(preview).toContain('[REDACTED]');
  });
});

describe('findings', () => {
  it('stores them queryably, not buried in a blob', async () => {
    const id = await rec.startRun(meta());
    await rec.recordFindings(id, [
      { file: 'a.ts', line: 4, lens: 'security', severity: 'critical', category: 'CWE-89', title: 'SQLi' },
      { file: 'b.ts', line: 9, lens: 'quality', severity: 'low', title: 'naming', preExisting: true },
    ]);
    const crit = rows("SELECT * FROM findings WHERE run_id=? AND severity='critical'", id);
    expect(crit).toHaveLength(1);
    expect(crit[0].category).toBe('CWE-89');
    expect(rows('SELECT * FROM findings WHERE run_id=? AND pre_existing=1', id)).toHaveLength(1);
  });
});

describe('artifacts', () => {
  it('writes gzipped to disk and indexes the path, never the body', async () => {
    const id = await rec.startRun(meta());
    const body = 'x'.repeat(50_000);
    await rec.putArtifact(id, 'transcript', body);

    const a = rows('SELECT * FROM artifacts WHERE run_id=?', id)[0];
    expect(a.kind).toBe('transcript');
    expect(a.path).toMatch(/2025\/\d\d\/.*transcript\.gz$/);
    // Compression is the point: 50 KB of repetition must not cost 50 KB.
    expect(a.bytes).toBeLessThan(1000);

    const raw = await fs.readFile(path.join(dir, 'artifacts', a.path));
    expect(gunzipSync(raw).toString()).toBe(body);
  });

  it('redacts secrets before they reach disk', async () => {
    // A transcript contains file contents, and file contents contain keys.
    const id = await rec.startRun(meta());
    await rec.putArtifact(id, 'transcript', 'key sk-ant-abcdefghijklmnopqrstuvwxyz012345');
    const a = rows('SELECT path FROM artifacts WHERE run_id=?', id)[0];
    const text = gunzipSync(await fs.readFile(path.join(dir, 'artifacts', a.path))).toString();
    expect(text).not.toContain('sk-ant-abcdefghijklmnopqrstuvwxyz012345');
  });

  it('ignores an empty body', async () => {
    const id = await rec.startRun(meta());
    await rec.putArtifact(id, 'diff', '');
    expect(rows('SELECT * FROM artifacts WHERE run_id=?', id)).toHaveLength(0);
  });
});

describe('retention', () => {
  it('deletes transcripts past their window but keeps the run', async () => {
    const id = await rec.startRun(meta());
    await rec.putArtifact(id, 'transcript', 'old transcript');
    const day = 24 * 60 * 60 * 1000;

    const pruned = await rec.prune(T0 + 20 * day); // transcripts keep 14 days
    expect(pruned.artifacts).toBe(1);
    expect(rows('SELECT * FROM artifacts WHERE run_id=?', id)).toHaveLength(0);
    expect(rows('SELECT * FROM runs WHERE id=?', id)).toHaveLength(1);
  });

  it('keeps a transcript inside its window', async () => {
    const id = await rec.startRun(meta());
    await rec.putArtifact(id, 'transcript', 'recent');
    const pruned = await rec.prune(T0 + 2 * 24 * 60 * 60 * 1000);
    expect(pruned.artifacts).toBe(0);
  });

  it('rolls off old tool calls, which are the bulk of the rows', async () => {
    const id = await rec.startRun(meta());
    await rec.recordTool(id, { turnIdx: 1, name: 'read_file', durationMs: 1, ok: true });
    const pruned = await rec.prune(T0 + 100 * 24 * 60 * 60 * 1000);
    expect(pruned.toolCalls).toBe(1);
    expect(rows('SELECT * FROM runs WHERE id=?', id)).toHaveLength(1);
  });
});

describe('never breaking a run', () => {
  it('survives a closed database without throwing', async () => {
    const id = await rec.startRun(meta());
    await rec.close();
    // Telemetry is not worth failing a code review over.
    await expect(rec.recordTool(id, { turnIdx: 1, name: 'x', durationMs: 1, ok: true })).resolves.toBeUndefined();
    await expect(
      rec.endRun(id, {
        endedAt: T0,
        status: 'ok',
        iterations: 1,
        usage: { inputTokens: 0, outputTokens: 0 },
        usd: 0,
        usdUncached: 0,
      }),
    ).resolves.toBeUndefined();
  });

  it('the no-op recorder satisfies the interface', async () => {
    await expect(noopRecorder.startRun(meta())).resolves.toBe('');
    await expect(noopRecorder.putArtifact('', 'diff', 'x')).resolves.toBeUndefined();
  });
});

describe('the loop-to-recorder bridge', () => {
  it('turns loop events into turn and tool records', async () => {
    const id = await rec.startRun(meta());
    const listen = recordingListener(rec, id);

    listen({
      type: 'turn',
      idx: 1,
      startedAt: T0,
      latencyMs: 500,
      usage: { inputTokens: 10, outputTokens: 5 },
      stopReason: 'tool_use',
    } as AgentEvent);
    listen({
      type: 'tool_done',
      name: 'search',
      turnIdx: 1,
      durationMs: 12,
      ok: true,
      outputBytes: 400,
    } as AgentEvent);

    await new Promise((r) => setTimeout(r, 20)); // writes are fire-and-forget
    expect(rows('SELECT * FROM turns WHERE run_id=?', id)).toHaveLength(1);
    expect(rows('SELECT * FROM tool_calls WHERE run_id=?', id)).toHaveLength(1);
  });

  it('still forwards events to the caller listener', () => {
    const seen: string[] = [];
    const listen = recordingListener(noopRecorder, 'id', 'main', (e) => seen.push(e.type));
    listen({ type: 'iteration', n: 1 } as AgentEvent);
    expect(seen).toEqual(['iteration']);
  });

  it('builds an outcome with both cached and uncached cost', () => {
    const result = {
      finalText: 'x',
      iterations: 3,
      stoppedBy: 'end',
      messages: [],
      usage: { inputTokens: 100_000, outputTokens: 0, cacheReadTokens: 900_000 },
    } as AgentResult;
    const o = outcomeFrom(result, { id: 'anthropic', model: 'claude-3-5-sonnet', supportsVision: true } as never, T0);
    expect(o.status).toBe('ok');
    expect(o.usdUncached).toBeGreaterThan(o.usd); // caching saved money, and it is recorded
  });

  it('marks a failed run as failed', () => {
    const result = { finalText: '', iterations: 1, stoppedBy: 'end', messages: [], usage: { inputTokens: 0, outputTokens: 0 } } as AgentResult;
    const o = outcomeFrom(result, { id: 'anthropic', model: 'm', supportsVision: true } as never, T0, { error: 'boom' });
    expect(o.status).toBe('failed');
  });

  it('flattens findings for storage', () => {
    const f: ReviewFinding = {
      file: 'a.ts',
      startLine: 1,
      endLine: 4,
      lens: 'security',
      severity: 'high',
      category: 'CWE-79',
      title: 'XSS',
      body: '',
    };
    const [rec0] = findingRecords([f], new Set(['a.ts:4']));
    expect(rec0).toMatchObject({ file: 'a.ts', line: 4, severity: 'high', postedInline: true });
  });
});

describe('opening the database', () => {
  it('creates the directory it was pointed at', async () => {
    // The caller's failure path is a silent fall back to recording nothing, so
    // a missing directory looked exactly like recording being switched off.
    const nested = path.join(dir, 'deep', 'forge', 'usage.db');
    const r = new SQLiteRecorder({ file: nested, now: () => T0 });
    const id = await r.startRun(meta());
    expect(id).not.toBe('');
    await r.close();
    await expect(fs.stat(nested)).resolves.toBeTruthy();
  });
});
