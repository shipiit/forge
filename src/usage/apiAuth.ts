import type { IncomingMessage, ServerResponse } from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import { timingSafeEqual } from 'node:crypto';
import { login, verifySession } from './auth.js';

/** Who a request turned out to be, if anyone. */
export type Identity = { as: 'token' } | { as: 'user'; username: string };

/**
 * Signing in, and making guessing expensive.
 *
 * Split from the rest of the API because it is the one route that must work
 * without being authenticated, and everything about it — the single vague
 * error, the per-username throttle, the bounded body — exists to be careful in
 * ways the read routes do not have to be.
 */

/** Send JSON. Kept local so this module does not reach back into the API. */
function json(res: ServerResponse, status: number, body: unknown, headers: Record<string, string>): void {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
}

/** Read a JSON body, bounded — a login form has no reason to be large. */
async function readJson(req: IncomingMessage, limit = 4096): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new Error('body too large');
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Sign in.
 *
 * One error for every failure, and the same shape whether the account exists,
 * the password is wrong, or there are no accounts at all. The rate limit is
 * per-username so one person guessing cannot lock out everybody else, and it
 * exists because scrypt makes each attempt cost ~50ms, not zero.
 */
export async function handleLogin(
  opts: { db: DatabaseSync },
  req: IncomingMessage,
  res: ServerResponse,
  cors: Record<string, string>,
): Promise<boolean> {
  let body: Record<string, unknown>;
  try {
    body = await readJson(req);
  } catch {
    json(res, 413, { error: 'too large' }, cors);
    return true;
  }
  const username = typeof body.username === 'string' ? body.username : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (tooManyAttempts(username)) {
    json(res, 429, { error: 'Too many attempts. Wait a minute and try again.' }, cors);
    return true;
  }
  const token = username && password ? await login(opts.db, username, password) : null;
  if (!token) {
    recordFailure(username);
    json(res, 401, { error: 'That username and password do not match.' }, cors);
    return true;
  }
  clearFailures(username);
  json(res, 200, { token, username: username.trim().toLowerCase() }, cors);
  return true;
}

/**
 * Failed attempts, per username, in memory.
 *
 * In memory on purpose: it protects a process, resets when one restarts, and
 * writing it down would mean a table somebody has to prune. Enough to make
 * guessing slow, not a claim to be a lockout policy.
 */
const failures = new Map<string, { count: number; until: number }>();
const MAX_ATTEMPTS = 8;
const LOCKOUT_MS = 60_000;

function tooManyAttempts(username: string, now = Date.now()): boolean {
  const key = username.trim().toLowerCase();
  const seen = failures.get(key);
  if (!seen) return false;
  if (seen.until <= now) {
    failures.delete(key);
    return false;
  }
  return seen.count >= MAX_ATTEMPTS;
}

function recordFailure(username: string, now = Date.now()): void {
  const key = username.trim().toLowerCase();
  const seen = failures.get(key);
  failures.set(key, {
    count: seen && seen.until > now ? seen.count + 1 : 1,
    until: now + LOCKOUT_MS,
  });
}

function clearFailures(username: string): void {
  failures.delete(username.trim().toLowerCase());
}

/** Constant-time, so a wrong token leaks nothing about how wrong it was. */
function tokenMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The credential on a request, from the header or — for links — the query. */
export function presented(req: IncomingMessage, url: URL): string {
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
