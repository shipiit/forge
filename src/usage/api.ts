import { promises as fs } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import { logout, userCount, verifySession } from './auth.js';
import { handleLogin } from './apiAuth.js';
import {
  breakdown,
  daily,
  facets,
  findingStats,
  findingTrend,
  findingsList,
  outputs,
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
   * Shared secret. Required, not optional.
   *
   * Every route returns repository names, actor logins, PR numbers and error
   * strings. There is no deployment where serving that unauthenticated is the
   * right default, so the type does not allow it — the standalone server
   * generates one when the operator has not set one.
   */
  token: string;
  /**
   * Origin allowed to read this API from a browser.
   *
   * The dashboard can be served from a different host than the agent, so a
   * deployed site needs this. Unset means same-origin only, which is what the
   * Vite dev proxy and the App's own /usage mount both are.
   */
  origin?: string;
  /**
   * Where this is mounted, for display only. Express strips the mount path
   * before the handler sees it, so the signpost page cannot work it out and
   * would otherwise tell the operator to point at the wrong URL.
   */
  mountPath?: string;
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
    // POST as well as GET: signing in and out are POSTs, and a browser on
    // another origin will not even send the request if the preflight does not
    // list the method. This is only reachable cross-origin — the dashboard
    // page is static and often served from somewhere else entirely — which is
    // exactly where it went unnoticed.
    'access-control-allow-methods': 'GET,POST,OPTIONS',
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

/** The credential on a request, from the header or — for links — the query. */
function presented(req: IncomingMessage, url: URL): string {
  const header = req.headers.authorization ?? '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
  // The query parameter exists so the page itself can be opened from a link;
  // the fetches it makes then carry the header.
  return bearer || url.searchParams.get('token') || '';
}

/**
 * Who, if anyone, is this request?
 *
 * Two credentials are accepted and they are not equivalent. The shared token
 * is for scripts and CI: it never expires, so it is deliberately not a person.
 * A session belongs to a named account and can be revoked on its own, which is
 * the whole reason accounts exist.
 */
export function identify(
  req: IncomingMessage,
  url: URL,
  token: string,
  db?: DatabaseSync,
): { as: 'token' } | { as: 'user'; username: string } | undefined {
  const given = presented(req, url);
  if (!given) return undefined;
  if (token && tokenMatches(given, token)) return { as: 'token' };
  if (db) {
    const username = verifySession(db, given);
    if (username) return { as: 'user', username };
  }
  return undefined;
}

export function authorized(req: IncomingMessage, url: URL, token: string, db?: DatabaseSync): boolean {
  // Fail closed: with no shared token and no accounts, nothing is permission.
  if (!token && !db) return false;
  return identify(req, url, token, db) !== undefined;
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
    ...(s('skill') ? { skill: s('skill') } : {}),
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
  // Signing in is the one route that cannot require being signed in.
  if (route === '/api/login' && req.method === 'POST') {
    return handleLogin(opts, req, res, cors);
  }
  // Whether a login form is worth showing: a deployment with no accounts is
  // token-only, and offering a form nobody can use is worse than not offering
  // one. Public on purpose — it is a boolean about configuration, not data.
  if (route === '/api/auth') {
    json(res, 200, { accounts: userCount(opts.db) > 0 }, cors);
    return true;
  }

  // The signpost is public, and has to be. Its entire job is to orient
  // somebody who has *no* credential — a person who opens the API port in a
  // browser. Behind the auth check it answered that person with
  // `{"error":"unauthorized"}`, which tells them nothing and looks broken.
  // It contains no data: a heading, the endpoint names, and where the
  // dashboard lives.
  if (route === '/' || route === '/index.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', ...cors });
    // The Host header is attacker-controlled; it is escaped before it is
    // echoed into the HTML. The scheme comes from the proxy that terminated
    // TLS, because this process only ever sees plain HTTP behind one — and a
    // link that says http:// to somebody on https:// is a link that fails.
    const proto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0]?.trim() || 'http';
    const host = req.headers.host ? `${escapeHtml(proto)}://${escapeHtml(req.headers.host)}` : '';
    res.end(landing(`${host}${opts.mountPath ?? prefix}`));
    return true;
  }

  const who = identify(req, url, opts.token, opts.db);
  if (!who) {
    json(res, 401, { error: 'unauthorized' }, cors);
    return true;
  }
  if (route === '/api/logout' && req.method === 'POST') {
    logout(opts.db, presented(req, url));
    json(res, 200, { ok: true }, cors);
    return true;
  }
  if (route === '/api/me') {
    json(res, 200, who.as === 'user' ? { username: who.username } : { username: null, token: true }, cors);
    return true;
  }

  const w = windowFrom(url);
  const db = opts.db;

  try {
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
    if (route === '/api/outputs') {
      const kind = url.searchParams.get('kind') ?? undefined;
      return json(res, 200, outputs(db, { ...w, ...(kind ? { kind } : {}) }, now()), cors), true;
    }

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

/** The Host header reaches this page as text; it must not reach it as markup. */
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
