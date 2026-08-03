import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SQLiteRecorder } from '../../src/usage/sqlite.js';
import type { RunMeta } from '../../src/usage/types.js';
import { mountDashboard, startDashboard } from '../../src/usage/serve.js';
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

const TOKEN = 'test-token';

/** Reads authenticate by default; the gate itself is tested explicitly. */
const call = async (url: string, token = TOKEN, headers?: Record<string, string>) => {
  const res = fakeRes();
  const handled = await serveUsage(
    { db: rec.database, artifactDir: path.join(dir, 'artifacts'), token, now: () => T0 + DAY },
    req(url, headers ?? { authorization: `Bearer ${TOKEN}` }),
    res as unknown as ServerResponse,
  );
  return { handled, status: res.status, headers: res.headers, body: res.body, json: () => JSON.parse(res.body || '{}') };
};

const meta = (over: Partial<RunMeta> = {}): RunMeta => ({
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
  ...over,
});

async function seed() {
  const id = await rec.startRun(meta());
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
      const res = await call(route, 'secret', {});
      expect(res.status, route).toBe(401);
    }
  });

  it('accepts the token as a header or, for the page link, a query parameter', async () => {
    await seed();
    expect((await call('/api/summary', 'secret', { authorization: 'Bearer secret' })).status).toBe(200);
    expect((await call('/api/summary?token=secret', 'secret', {})).status).toBe(200);
  });

  it('does not accept a prefix of the token', async () => {
    expect(authorized(req('/', {}), new URL('http://x/?token=sec'), 'secret')).toBe(false);
    expect(authorized(req('/', {}), new URL('http://x/?token=secretlonger'), 'secret')).toBe(false);
  });

  it('fails closed when no token is configured at all', async () => {
    // An empty token is a misconfiguration, not permission. Nothing in the
    // codebase can construct an unauthenticated server: the standalone one
    // generates a token, and the App refuses to mount without one.
    expect(authorized(req('/', {}), new URL('http://x/'), '')).toBe(false);
    expect(authorized(req('/', { authorization: 'Bearer anything' }), new URL('http://x/'), '')).toBe(false);
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

describe('what a run produced', () => {
  it('records commits, pull requests and issues against the run', async () => {
    const id = await seed();
    await rec.recordOutput(id, { kind: 'pull_request', ref: '3', url: 'https://github.com/acme/web/pull/3', title: 'Fix: crash' });
    await rec.recordOutput(id, { kind: 'commit', ref: 'forge/issue-1', title: 'fix: handle empty input' });
    await rec.recordOutput(id, { kind: 'issue', ref: '9', url: 'https://github.com/acme/web/issues/9', title: 'SQLi in query.ts' });

    const detail = (await call(`/api/runs/${id}`)).json();
    expect(detail.outputs.map((o: { kind: string }) => o.kind)).toEqual(['pull_request', 'commit', 'issue']);

    const list = (await call('/api/outputs')).json();
    expect(list).toHaveLength(3);
    // The listing carries the run's context, so it reads without a second call.
    expect(list[0].owner).toBe('acme');
    expect(list[0].flow).toBe('review');
  });

  it('filters outputs by kind', async () => {
    const id = await seed();
    await rec.recordOutput(id, { kind: 'commit', ref: 'abc123' });
    await rec.recordOutput(id, { kind: 'issue', ref: '9' });
    expect((await call('/api/outputs?kind=commit')).json()).toHaveLength(1);
    expect((await call('/api/outputs?kind=release')).json()).toHaveLength(0);
  });

  it('drops them with the run they belong to', async () => {
    const id = await seed();
    await rec.recordOutput(id, { kind: 'commit', ref: 'abc123' });
    rec.database.prepare('DELETE FROM runs WHERE id = ?').run(id);
    expect(rec.database.prepare('SELECT * FROM outputs').all()).toHaveLength(0);
  });
});

describe('the detail lists', () => {
  it('returns findings with the run that reported them', async () => {
    await seed();
    const rows = (await call('/api/findings/list')).json();
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('XSS');
    expect(rows[0].repo).toBe('web');
    expect(rows[0].run_id).toBeTruthy();
  });

  it('filters findings by severity', async () => {
    await seed();
    expect((await call('/api/findings/list?severity=high')).json()).toHaveLength(1);
    expect((await call('/api/findings/list?severity=critical')).json()).toHaveLength(0);
  });

  it('returns each tool failure with what it said and what it was called with', async () => {
    await seed();
    const rows = (await call('/api/tools/errors')).json();
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('run_tests');
    expect(rows[0].error).toContain('timed out');
    // Successes are not failures; the point of the list is what broke.
    expect(rows.every((r: { name: string }) => r.name !== 'read_file')).toBe(true);
  });

  it('filters failures to one tool', async () => {
    await seed();
    expect((await call('/api/tools/errors?name=run_tests')).json()).toHaveLength(1);
    expect((await call('/api/tools/errors?name=read_file')).json()).toHaveLength(0);
  });
});

describe('filtering', () => {
  it('searches the fields a person would actually type', async () => {
    const id = await rec.startRun({ ...meta(), skill: 'security-audit', actor: 'mona' });
    await rec.endRun(id, { endedAt: T0 + 10, status: 'ok', iterations: 1, usage: { inputTokens: 1, outputTokens: 1 }, usd: 0, usdUncached: 0 });
    // A skill name is the most natural thing to search for and it was not
    // covered until the search grew past repo/actor/error.
    expect((await call('/api/runs?q=security-audit')).json()).toHaveLength(1);
    expect((await call('/api/runs?q=mona')).json()).toHaveLength(1);
    expect((await call('/api/runs?q=claude')).json()).toHaveLength(1);
  });

  it('filters by skill', async () => {
    const id = await rec.startRun({ ...meta(), skill: 'security-audit' });
    await rec.endRun(id, { endedAt: T0 + 10, status: 'ok', iterations: 1, usage: { inputTokens: 1, outputTokens: 1 }, usd: 0, usdUncached: 0 });
    expect((await call('/api/runs?skill=security-audit')).json()).toHaveLength(1);
    expect((await call('/api/runs?skill=triage')).json()).toHaveLength(0);
  });

  it('offers skills as a filter value', async () => {
    const id = await rec.startRun({ ...meta(), skill: 'security-audit' });
    await rec.endRun(id, { endedAt: T0 + 10, status: 'ok', iterations: 1, usage: { inputTokens: 1, outputTokens: 1 }, usd: 0, usdUncached: 0 });
    expect((await call('/api/facets')).json().skills).toEqual(['security-audit']);
  });

  it('shifts the window by its own length for a like-for-like comparison', async () => {
    await seed();
    // The run is inside the current window and outside the one before it.
    expect((await call('/api/summary?days=7')).json().runs).toBe(1);
    expect((await call('/api/summary?days=7&shift=7')).json().runs).toBe(0);
  });

  it('groups by trigger, which is how you find the expensive webhook', async () => {
    await seed();
    const rows = (await call('/api/breakdown?by=trigger')).json();
    expect(rows[0].key).toBe('pull_request.opened');
  });
});

describe('publishing the standalone dashboard', () => {
  it('generates a token when none is configured, rather than serving open', async () => {
    // Found by the agent auditing this very file: a dashboard with no token
    // served repository names, actor logins and error strings to anything that
    // could reach the port.
    const server = await startDashboard({ file: path.join(dir, 'usage.db'), port: 4399, host: '127.0.0.1' });
    try {
      expect(server.generated).toBe(true);
      expect(server.token.length).toBeGreaterThan(20);
      expect(server.url).toContain(`token=${server.token}`);

      const open = await fetch('http://127.0.0.1:4399/api/summary');
      expect(open.status).toBe(401);
      const authed = await fetch('http://127.0.0.1:4399/api/summary', { headers: { authorization: `Bearer ${server.token}` } });
      expect(authed.status).toBe(200);
    } finally {
      await server.close();
    }
  });

  it('keeps the configured token when there is one', async () => {
    const server = await startDashboard({ file: path.join(dir, 'usage.db'), port: 4398, host: '127.0.0.1', token: 'chosen' });
    try {
      expect(server.generated).toBe(false);
      expect(server.token).toBe('chosen');
    } finally {
      await server.close();
    }
  });

  it('binds to loopback unless told otherwise, so publishing is deliberate', async () => {
    const server = await startDashboard({ file: path.join(dir, 'usage.db'), port: 4397 });
    try {
      expect(server.url).toContain('http://127.0.0.1:4397/');
    } finally {
      await server.close();
    }
  });
});

describe('mounting on the App server', () => {
  const env = (over: Record<string, string> = {}) => ({ FORGE_USAGE_DB: path.join(dir, 'usage.db'), FORGE_DASHBOARD_TOKEN: 'app-token', ...over });

  /** The shape Probot's express Router presents to us. */
  function fakeRouter() {
    const handlers: Array<(req: IncomingMessage, res: ServerResponse, next: () => void) => void> = [];
    return {
      mounted: [] as string[],
      handlers,
      get: (p?: string) => {
        return { use: (h: (typeof handlers)[number]) => handlers.push(h) };
      },
    };
  }

  it('refuses to mount without a token, because that host is public', () => {
    const router = fakeRouter();
    const log: string[] = [];
    expect(mountDashboard(router.get, env({ FORGE_DASHBOARD_TOKEN: '' }), (m) => log.push(m))).toBe(false);
    expect(router.handlers).toHaveLength(0);
    expect(log.join()).toContain('FORGE_DASHBOARD_TOKEN');
  });

  it('does not mount when recording is switched off', () => {
    const router = fakeRouter();
    expect(mountDashboard(router.get, { FORGE_DASHBOARD_TOKEN: 'app-token' })).toBe(false);
    expect(router.handlers).toHaveLength(0);
  });

  it('mounts and serves through the router it was given', async () => {
    await seed();
    await rec.close();

    const router = fakeRouter();
    expect(mountDashboard(router.get, env())).toBe(true);
    expect(router.handlers).toHaveLength(1);

    // Express strips the mount path before the handler sees it.
    const res = fakeRes();
    let fellThrough = false;
    router.handlers[0]!(
      // The seed is stamped at a fixed time; ask for everything rather than
      // the default window, which is relative to the real clock.
      req('/api/summary?days=3650', { authorization: 'Bearer app-token' }),
      res as unknown as ServerResponse,
      () => {
        fellThrough = true;
      },
    );
    await new Promise((r) => setTimeout(r, 30));
    expect(fellThrough).toBe(false);
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body).runs).toBe(1);
  });

  it('tells the operator the mounted URL, not the server root', async () => {
    const router = fakeRouter();
    mountDashboard(router.get, env());
    const res = fakeRes();
    router.handlers[0]!(req('/', { authorization: 'Bearer app-token', host: 'forge.example.com' }), res as unknown as ServerResponse, () => {});
    await new Promise((r) => setTimeout(r, 30));
    // Without the mount path it would say http://forge.example.com, which is
    // the webhook endpoint, not the dashboard.
    expect(res.body).toContain('http://forge.example.com/usage');
  });

  it('escapes the Host header rather than echoing it as markup', async () => {
    const router = fakeRouter();
    mountDashboard(router.get, env());
    const res = fakeRes();
    router.handlers[0]!(
      req('/', { authorization: 'Bearer app-token', host: 'x"><script>alert(1)</script>' }),
      res as unknown as ServerResponse,
      () => {},
    );
    await new Promise((r) => setTimeout(r, 30));
    expect(res.body).not.toContain('<script>');
    expect(res.body).toContain('&lt;script&gt;');
  });

  it('lets a path under the mount that it does not serve fall through', async () => {
    const router = fakeRouter();
    mountDashboard(router.get, env());
    const res = fakeRes();
    let fellThrough = false;
    router.handlers[0]!(req('/something-else', { authorization: 'Bearer app-token' }), res as unknown as ServerResponse, () => {
      fellThrough = true;
    });
    await new Promise((r) => setTimeout(r, 30));
    expect(fellThrough).toBe(true);
  });

  it('answers an unauthenticated request itself rather than passing it on', async () => {
    // It is mounted under /usage, so everything reaching it is a dashboard
    // request; handing an unauthenticated one to the next handler would be
    // handing it to the webhook receiver.
    const router = fakeRouter();
    mountDashboard(router.get, env());
    const res = fakeRes();
    let fellThrough = false;
    router.handlers[0]!(req('/api/summary', {}), res as unknown as ServerResponse, () => {
      fellThrough = true;
    });
    await new Promise((r) => setTimeout(r, 30));
    expect(fellThrough).toBe(false);
    expect(res.status).toBe(401);
  });
});
