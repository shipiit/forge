import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SQLiteRecorder } from '../../src/usage/sqlite.js';
import { tracked } from '../../src/usage/track.js';
import type { LLMClient } from '../../src/providers/types.js';
import type { AgentResult } from '../../src/agent/loop.js';

const T0 = 1_754_000_000_000;

const client = {
  id: 'anthropic',
  supportsVision: true,
  model: 'claude-sonnet-4-5',
  async chat() {
    throw new Error('not called');
  },
} as unknown as LLMClient;

const meta = {
  host: 'github.com',
  owner: 'acme',
  repo: 'web',
  surface: 'app' as const,
  flow: 'fix' as const,
  trigger: 'issue_comment.created',
};

const segment = (over: Partial<AgentResult> = {}): AgentResult => ({
  finalText: 'done',
  iterations: 2,
  stoppedBy: 'end',
  messages: [],
  usage: { inputTokens: 100, outputTokens: 20 },
  ...over,
});

let dir: string;
let rec: SQLiteRecorder;
const rows = (sql: string, ...args: unknown[]) => rec.database.prepare(sql).all(...(args as never[])) as any[];
const run = <T>(body: Parameters<typeof tracked<T>>[1]) =>
  tracked({ recorder: rec, client, meta, now: () => T0 }, body);

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'forge-track-'));
  rec = new SQLiteRecorder({ file: path.join(dir, 'usage.db'), now: () => T0 });
});
afterEach(async () => {
  await rec.close();
  await fs.rm(dir, { recursive: true, force: true });
});

describe('tracking a run', () => {
  it('keeps each segment of a run apart', async () => {
    // A fix run is the fix, then a self-review over its diff, then whatever it
    // delegated. Each numbers its turns from 1 — without the phase they would
    // overwrite one another and the run would look like it did a third of the
    // work it did.
    await run(async (r) => {
      for (const phase of ['main', 'self_review', 'sub0.1']) {
        const listen = r.listen(phase);
        listen({ type: 'turn', idx: 1, startedAt: T0, latencyMs: 10, usage: { inputTokens: 5, outputTokens: 1 }, stopReason: 'end' });
      }
    });

    const turns = rows('SELECT phase, idx FROM turns ORDER BY phase');
    expect(turns.map((t) => t.phase)).toEqual(['main', 'self_review', 'sub0.1']);
  });

  it('adds up what every segment spent', async () => {
    await run(async (r) => {
      r.add(segment());
      r.add(segment({ iterations: 3, usage: { inputTokens: 400, outputTokens: 80, cacheReadTokens: 900 } }));
    });

    const row = rows('SELECT * FROM runs')[0];
    expect(row.input_tokens).toBe(500);
    expect(row.output_tokens).toBe(100);
    expect(row.cache_read).toBe(900);
    expect(row.iterations).toBe(5);
    expect(row.usd).toBeGreaterThan(0);
    // Caching is only worth reporting if the counterfactual is stored too.
    expect(row.usd_uncached).toBeGreaterThan(row.usd);
  });

  it('reports the segment that ran out of money, not the one that finished', async () => {
    // Reporting the last segment's reason would hide the truncation that matters.
    await run(async (r) => {
      r.add(segment({ stoppedBy: 'budget' }));
      r.add(segment({ stoppedBy: 'end' }));
    });
    expect(rows('SELECT stopped_by FROM runs')[0].stopped_by).toBe('budget');
  });

  it('closes the run when the handler throws', async () => {
    // Handlers throw: a clone fails, the API 500s. If closing only happened on
    // the happy path these rows would sit at `running` forever and the
    // dashboard would show phantom work in flight.
    await expect(
      run(async (r) => {
        r.add(segment());
        throw new Error('clone failed: repository not found');
      }),
    ).rejects.toThrow('clone failed');

    const row = rows('SELECT * FROM runs')[0];
    expect(row.status).toBe('failed');
    expect(row.error).toContain('clone failed');
    expect(row.ended_at).toBe(T0);
    // The work it did before it died is still accounted for.
    expect(row.input_tokens).toBe(100);
  });

  it('closes a declined run as skipped, not as a success', async () => {
    await run(async (r) => r.skip('rate limited'));
    const row = rows('SELECT * FROM runs')[0];
    expect(row.status).toBe('skipped');
    expect(row.error).toBe('rate limited');
  });

  it('records the link to what the run produced', async () => {
    await run(async (r) => {
      r.add(segment());
      r.link('https://github.com/acme/web/pull/12');
    });
    expect(rows('SELECT result_url FROM runs')[0].result_url).toContain('/pull/12');
  });

  it('runs the body even when the recorder is dead', async () => {
    // Recording is telemetry. Losing it costs a row, never a code review.
    const broken = {
      startRun: async () => {
        throw new Error('disk full');
      },
    } as never;
    const out = await tracked({ recorder: broken, client, meta, now: () => T0 }, async () => 'reviewed');
    expect(out).toBe('reviewed');
  });
});
