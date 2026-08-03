import { promises as fs } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import {
  breakdown,
  daily,
  facets,
  findingStats,
  findingTrend,
  findingsList,
  toolErrors,
  runDetail,
  runs,
  summary,
  toolStats,
  toolTrend,
  artifactPath,
  type Window,
} from './queries.js';
import { landing } from './landing.js';

/**
 * The read API.
 *
 * Written against node's own http types rather than a framework so the same
 * handler serves the standalone `forge dashboard` server and mounts on the
 * App's existing Probot router.
 */

export interface ApiOptions {
  db: DatabaseSync;
  artifactDir: string;
  /**
   * Shared secret. Every route requires it.
   *
   * Not optional when this is mounted on the webhook server: that host is
   * public by definition — it is how GitHub reaches you — and these routes
   * return repository names, actor logins, PR numbers and error strings.
   */
  token?: string;
  /**
   * Origin allowed to read this API from a browser.
   *
   * The dashboard can be served from a different host than the agent, so a
   * deployed site needs this. Unset means same-origin only, which is what the
   * Vite dev proxy and the App's own /usage mount both are.
   */
  origin?: string;
  now?: () => number;
}

const json = (res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void => {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...headers,
  });
  res.end(text);
};

/** Read-only, and only for the origin the operator named. */
function corsHeaders(origin?: string): Record<string, string> {
  if (!origin) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-headers': 'authorization,content-type',
    'access-control-allow-methods': 'GET,OPTIONS',
    'access-control-max-age': '600',
    vary: 'origin',
  };
}

/** Constant-time, so a wrong token leaks nothing about how wrong it was. */
function tokenMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function authorized(req: IncomingMessage, url: URL, token?: string): boolean {
  if (!token) return true; // caller decided this deployment needs no gate
  const header = req.headers.authorization ?? '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
  // The query parameter exists so the page itself can be opened from a link;
  // the fetches it makes then carry the header.
  const given = bearer || url.searchParams.get('token') || '';
  return Boolean(given) && tokenMatches(given, token);
}

/** Read the filter set out of the query string. */
export function windowFrom(url: URL): Window & { limit?: number; before?: string; q?: string } {
  const s = (k: string) => url.searchParams.get(k) || undefined;
  const repo = s('repo');
  // `owner/name` in one field is what the UI sends, because that is how a
  // person refers to a repository.
  const [owner, name] = repo?.includes('/') ? repo.split('/') : [s('owner'), repo];
  return {
    days: Number(url.searchParams.get('days') ?? 30) || undefined,
    ...(url.searchParams.get('shift') ? { shift: Number(url.searchParams.get('shift')) } : {}),
    ...(owner ? { owner } : {}),
    ...(name ? { repo: name } : {}),
    ...(s('flow') ? { flow: s('flow') } : {}),
    ...(s('status') ? { status: s('status') } : {}),
    ...(s('model') ? { model: s('model') } : {}),
    ...(s('q') ? { q: s('q') } : {}),
    ...(s('before') ? { before: s('before') } : {}),
    ...(url.searchParams.get('limit') ? { limit: Number(url.searchParams.get('limit')) } : {}),
  };
}

/**
 * Serve one request. Returns false when the path is not ours, so a caller can
 * fall through to whatever else it serves.
 */
export async function serveUsage(opts: ApiOptions, req: IncomingMessage, res: ServerResponse, prefix = ''): Promise<boolean> {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (prefix && !url.pathname.startsWith(prefix)) return false;
  const route = url.pathname.slice(prefix.length) || '/';
  const now = opts.now ?? Date.now;

  const cors = corsHeaders(opts.origin);
  if (req.method === 'OPTIONS') {
    // The preflight must not require the token: the browser sends it without
    // an Authorization header by design.
    res.writeHead(204, cors);
    res.end();
    return true;
  }
  if (!authorized(req, url, opts.token)) {
    json(res, 401, { error: 'unauthorized' }, cors);
    return true;
  }

  const w = windowFrom(url);
  const db = opts.db;

  try {
    if (route === '/' || route === '/index.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', ...cors });
      res.end(landing(`${req.headers.host ? `http://${req.headers.host}` : ''}${prefix}`));
      return true;
    }
    if (route === '/api/summary') return json(res, 200, summary(db, w, now()), cors), true;
    if (route === '/api/daily') return json(res, 200, daily(db, w, now()), cors), true;
    if (route === '/api/tools') return json(res, 200, toolStats(db, w, now()), cors), true;
    if (route === '/api/tools/trend') return json(res, 200, toolTrend(db, w, now()), cors), true;
    if (route === '/api/tools/errors') {
      const name = url.searchParams.get('name') ?? undefined;
      return json(res, 200, toolErrors(db, { ...w, ...(name ? { name } : {}) }, now()), cors), true;
    }
    if (route === '/api/findings/list') {
      const severity = url.searchParams.get('severity') ?? undefined;
      return json(res, 200, findingsList(db, { ...w, ...(severity ? { severity } : {}) }, now()), cors), true;
    }
    if (route === '/api/findings/trend') return json(res, 200, findingTrend(db, w, now()), cors), true;
    if (route === '/api/findings') return json(res, 200, findingStats(db, w, now()), cors), true;
    if (route === '/api/facets') return json(res, 200, facets(db, now()), cors), true;
    if (route === '/api/breakdown') {
      const by = url.searchParams.get('by') ?? 'flow';
      return json(res, 200, breakdown(db, by, w, now()), cors), true;
    }
    if (route === '/api/runs') return json(res, 200, runs(db, w, now()), cors), true;

    const run = route.match(/^\/api\/runs\/([\w-]+)$/);
    if (run) {
      const detail = runDetail(db, run[1]!);
      return json(res, detail ? 200 : 404, detail ?? { error: 'no such run' }, cors), true;
    }

    const artifact = route.match(/^\/api\/artifacts\/([\w-]+)$/);
    if (artifact) {
      // By id, with the path read out of the database. A path from the query
      // string would be a directory traversal waiting to happen.
      const found = artifactPath(db, artifact[1]!);
      if (!found) return json(res, 404, { error: 'no such artifact' }, cors), true;
      const body = gunzipSync(await fs.readFile(path.join(opts.artifactDir, found.path))).toString('utf8');
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', ...cors });
      res.end(body);
      return true;
    }

    if (route.startsWith('/api/')) {
      json(res, 404, { error: 'no such route' }, cors);
      return true;
    }
    return false;
  } catch (err) {
    json(res, 500, { error: err instanceof Error ? err.message : 'query failed' }, cors);
    return true;
  }
}
