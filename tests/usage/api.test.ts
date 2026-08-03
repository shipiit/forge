import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SQLiteRecorder } from '../../src/usage/sqlite.js';
import { serveUsage, authorized, windowFrom } from '../../src/usage/api.js';
import { summary, breakdown, toolStats, runs } from '../../src/usage/queries.js';
import type { IncomingMessage, ServerResponse } from 'node:http';

const T0 = 1_754_000_000_000;
const DAY = 86_400_000;

let dir: string;
let rec: SQLiteRecorder;

/** A response that captures instead of writing to a socket. */
function fakeRes() {
  const res = {
    status: 0,
    headers: {} as Record<string, string>,
    body: '',
    writeHead(status: number, headers?: Record<string, string>) {
      res.status = status;
      Object.assign(res.headers, headers ?? {});
      return res;
    },
    end(chunk?: string) {
      res.body = chunk ?? '';
      return res;
    },
  };
  return res;
}

const req = (url: string, headers: Record<string, string> = {}) => ({ url, headers }) as unknown as IncomingMessage;

const call = async (url: string, token?: string, headers?: Record<string, string>) => {
  const res = fakeRes();
  const handled = await serveUsage(
    { db: rec.database, artifactDir: path.join(dir, 'artifacts'), ...(token ? { token } : {}), now: () => T0 + DAY },
    req(url, headers ?? {}),
    res as unknown as ServerResponse,
  );
  return { handled, status: res.status, headers: res.headers, body: res.body, json: () => JSON.parse(res.body || '{}') };
};

async function seed() {
  const id = await rec.startRun({
    host: 'github.com',
    owner: 'acme',
    repo: 'web',
    surface: 'app',
    flow: 'review',
    trigger: 'pull_request.opened',
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
    prNumber: 3,
    actor: 'octocat',
    startedAt: T0,
  });
  await rec.recordTurn(id, { idx: 1, startedAt: T0, latencyMs: 800, usage: { inputTokens: 900, outputTokens: 120, cacheReadTokens: 4000 }, stopReason: 'end' });
  await rec.recordTool(id, { turnIdx: 1, name: 'read_file', durationMs: 4, ok: true, outputBytes: 200 });
  await rec.recordTool(id, { turnIdx: 1, name: 'run_tests', durationMs: 30_000, ok: false, error: 'timed out' });
  await rec.recordFindings(id, [{ file: 'a.ts', line: 2, lens: 'security', severity: 'high', title: 'XSS' }]);
  await rec.putArtifact(id, 'diff', 'diff --git a/a.ts b/a.ts');
  await rec.endRun(id, {
    endedAt: T0 + 12_000,
    status: 'ok',
    iterations: 3,
    stoppedBy: 'end',
    usage: { inputTokens: 900, outputTokens: 120, cacheReadTokens: 4000 },
    usd: 0.02,
    usdUncached: 0.05,
    resultUrl: 'https://github.com/acme/web/pull/3',
  });
  return id;
}

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'forge-api-'));
  rec = new SQLiteRecorder({ file: path.join(dir, 'usage.db'), now: () => T0 });
});
afterEach(async () => {
  await rec.close();
  await fs.rm(dir, { recursive: true, force: true });
});

describe('the access gate', () => {
  it('refuses every route without the token', async () => {
    await seed();
    for (const route of ['/', '/api/summary', '/api/runs', '/api/facets']) {
      const res = await call(route, 'secret');
      expect(res.status, route).toBe(401);
    }
  });

  it('accepts the token as a header or, for the page link, a query parameter', async () => {
    await seed();
    expect((await call('/api/summary', 'secret', { authorization: 'Bearer secret' })).status).toBe(200);
    expect((await call('/api/summary?token=secret', 'secret')).status).toBe(200);
  });

  it('does not accept a prefix of the token', async () => {
    expect(authorized(req('/', {}), new URL('http://x/?token=sec'), 'secret')).toBe(false);
    expect(authorized(req('/', {}), new URL('http://x/?token=secretlonger'), 'secret')).toBe(false);
  });

  it('is open only when the caller deliberately configured no token', async () => {
    // The standalone dashboard binds to loopback in that case; the App refuses
    // to mount at all.
    expect(authorized(req('/', {}), new URL('http://x/'), undefined)).toBe(true);
  });
});

describe('reading', () => {
  it('serves the page itself as HTML', async () => {
    const res = await call('/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain('Usage API is running');
  });

  it('leaves paths that are not ours alone', async () => {
    expect((await call('/webhooks/github')).handled).toBe(false);
  });

  it('summarises a run, including what caching saved', async () => {
    await seed();
    const s = (await call('/api/summary')).json();
    expect(s.runs).toBe(1);
    expect(s.ok).toBe(1);
    expect(s.cacheRead).toBe(4000);
    expect(s.saved).toBeCloseTo(0.03, 5);
    expect(s.toolCalls).toBe(2);
    expect(s.toolErrors).toBe(1);
    expect(s.findings).toBe(1);
    expect(s.medianMs).toBe(12_000);
  });

  it('filters by repository written the way a person writes it', async () => {
    await seed();
    expect(windowFrom(new URL('http://x/?repo=acme/web')).owner).toBe('acme');
    expect(windowFrom(new URL('http://x/?repo=acme/web')).repo).toBe('web');
    expect((await call('/api/runs?repo=acme/web')).json()).toHaveLength(1);
    expect((await call('/api/runs?repo=other/thing')).json()).toHaveLength(0);
  });

  it('excludes runs older than the window', async () => {
    await seed();
    expect(summary(rec.database, { days: 30 }, T0 + DAY).runs).toBe(1);
    expect(summary(rec.database, { days: 30 }, T0 + 60 * DAY).runs).toBe(0);
  });

  it('returns the full run, turn by turn', async () => {
    const id = await seed();
    const d = (await call(`/api/runs/${id}`)).json();
    expect(d.run.result_url).toContain('/pull/3');
    expect(d.turns).toHaveLength(1);
    expect(d.tools.map((t: { name: string }) => t.name)).toContain('run_tests');
    expect(d.findings[0].title).toBe('XSS');
    expect(d.artifacts).toHaveLength(1);
  });

  it('404s an unknown run rather than returning an empty shell', async () => {
    expect((await call('/api/runs/nope')).status).toBe(404);
  });
});

describe('artifacts', () => {
  it('serves by id, with the path read from the database', async () => {
    // The path never comes from the request: one that did would be a directory
    // traversal waiting to happen.
    const id = await seed();
    const list = (await call(`/api/runs/${id}`)).json();
    const res = await call(`/api/artifacts/${list.artifacts[0].id}`);
    expect(res.status).toBe(200);
    expect(res.body).toContain('diff --git');
  });

  it('has no route that accepts a path', async () => {
    expect((await call('/api/artifacts/..%2F..%2Fetc%2Fpasswd')).status).toBe(404);
    expect((await call('/api/artifacts/x/../../etc/passwd')).status).toBe(404);
  });
});

describe('aggregates', () => {
  it('refuses to group by a column that is not a dimension', async () => {
    // The column name is interpolated, so the allowlist is what makes it safe.
    expect(() => breakdown(rec.database, 'usd); DROP TABLE runs;--', {}, T0)).toThrow();
    expect((await call('/api/breakdown?by=nonsense')).status).toBe(500);
  });

  it('groups by a dimension that is one', async () => {
    await seed();
    const rows = (await call('/api/breakdown?by=flow')).json();
    expect(rows[0].key).toBe('review');
    expect(rows[0].runs).toBe(1);
  });

  it('reports the slow tail per tool, not the average', async () => {
    await seed();
    const tools = toolStats(rec.database, {}, T0 + DAY);
    const slow = tools.find((t) => t.name === 'run_tests')!;
    expect(slow.errors).toBe(1);
    expect(slow.p95_ms).toBe(30_000);
  });

  it('offers the filter values that actually exist', async () => {
    await seed();
    const f = (await call('/api/facets')).json();
    expect(f.flows).toEqual(['review']);
    expect(f.repos).toEqual(['acme/web']);
  });

  it('searches across repository, actor and error text', async () => {
    await seed();
    expect(runs(rec.database, { q: 'octocat' }, T0 + DAY)).toHaveLength(1);
    expect(runs(rec.database, { q: 'nobody' }, T0 + DAY)).toHaveLength(0);
  });
});
