import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import type { DatabaseSync } from 'node:sqlite';

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

/**
 * Accounts for the dashboard.
 *
 * The dashboard shows repository names, actor logins, pull-request numbers and
 * error strings — it is not something to leave on a public port. A single
 * shared token was enough for one person on a laptop and is not enough for a
 * team: it cannot be revoked for one person, it says nothing about who looked,
 * and it ends up pasted into a group chat.
 *
 * So: named accounts, and sessions issued against them. The shared token still
 * works — scripts and CI need something that does not expire — but a human
 * signs in.
 *
 * Passwords are stored as scrypt hashes with a per-password salt. Nothing here
 * ever writes, logs or returns a password, and a session token is stored only
 * as its SHA-256, so a stolen database cannot be replayed as a login.
 */

/** Cost parameters. N=16384 is ~50ms per hash, which is the point. */
const KEYLEN = 64;

/** How long a session lasts without being used again. */
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

/** Password rules, kept to the one that actually matters: length. */
export const MIN_PASSWORD_LENGTH = 12;

export interface DashboardUser {
  username: string;
  createdAt: number;
  lastLogin?: number;
}

/**
 * `scrypt$<salt-hex>$<hash-hex>`.
 *
 * The salt is stored beside the hash because it must be: it is not a secret,
 * it exists so two people who chose the same password do not share a hash.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, KEYLEN);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

/** Constant-time: a wrong password must not leak how wrong it was. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  try {
    const expected = Buffer.from(hashHex, 'hex');
    const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/** A session token is stored as its digest, never in the clear. */
const digest = (token: string): string => createHash('sha256').update(token).digest('hex');

/** Why a password was refused, or null if it is fine. */
export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `A password needs at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
}

export function normaliseUsername(username: string): string {
  return username.trim().toLowerCase();
}

/** Create an account, or fail loudly if the name is taken. */
export async function createUser(db: DatabaseSync, username: string, password: string): Promise<void> {
  const problem = passwordProblem(password);
  if (problem) throw new Error(problem);
  const name = normaliseUsername(username);
  if (!name) throw new Error('A username is required.');

  const exists = db.prepare('SELECT 1 FROM dashboard_users WHERE username = ?').get(name);
  if (exists) throw new Error(`There is already an account called "${name}".`);

  db.prepare('INSERT INTO dashboard_users (username, password_hash, created_at) VALUES (?, ?, ?)').run(
    name,
    await hashPassword(password),
    Date.now(),
  );
}

/** Change a password, and end every session that used the old one. */
export async function setPassword(db: DatabaseSync, username: string, password: string): Promise<void> {
  const problem = passwordProblem(password);
  if (problem) throw new Error(problem);
  const name = normaliseUsername(username);
  const res = db
    .prepare('UPDATE dashboard_users SET password_hash = ? WHERE username = ?')
    .run(await hashPassword(password), name);
  if (!res.changes) throw new Error(`No account called "${name}".`);
  // A password change that leaves the old sessions alive has not changed
  // anything for whoever was already signed in.
  db.prepare('DELETE FROM dashboard_sessions WHERE username = ?').run(name);
}

export function removeUser(db: DatabaseSync, username: string): boolean {
  const name = normaliseUsername(username);
  db.prepare('DELETE FROM dashboard_sessions WHERE username = ?').run(name);
  return db.prepare('DELETE FROM dashboard_users WHERE username = ?').run(name).changes > 0;
}

export function listUsers(db: DatabaseSync): DashboardUser[] {
  const rows = db
    .prepare('SELECT username, created_at, last_login FROM dashboard_users ORDER BY username')
    .all() as Array<{ username: string; created_at: number; last_login: number | null }>;
  return rows.map((r) => ({
    username: r.username,
    createdAt: r.created_at,
    ...(r.last_login ? { lastLogin: r.last_login } : {}),
  }));
}

export function userCount(db: DatabaseSync): number {
  const row = db.prepare('SELECT COUNT(*) AS n FROM dashboard_users').get() as { n: number };
  return row.n;
}

/**
 * Sign in.
 *
 * Returns a token, or null. Deliberately one `null` for "no such user" and
 * "wrong password" — telling them apart is how somebody enumerates accounts —
 * and an unknown username still costs a hash, so the two take the same time.
 */
export async function login(
  db: DatabaseSync,
  username: string,
  password: string,
  now = Date.now(),
): Promise<string | null> {
  const name = normaliseUsername(username);
  const row = db.prepare('SELECT password_hash FROM dashboard_users WHERE username = ?').get(name) as
    | { password_hash: string }
    | undefined;

  // Hash regardless, against a throwaway, so a missing account returns in the
  // same time as a wrong password.
  const stored = row?.password_hash ?? (await hashPassword(randomBytes(16).toString('hex')));
  const ok = await verifyPassword(password, stored);
  if (!row || !ok) return null;

  const token = randomBytes(32).toString('hex');
  db.prepare(
    'INSERT INTO dashboard_sessions (token_hash, username, created_at, expires_at) VALUES (?, ?, ?, ?)',
  ).run(digest(token), name, now, now + SESSION_TTL_MS);
  db.prepare('UPDATE dashboard_users SET last_login = ? WHERE username = ?').run(now, name);
  pruneSessions(db, now);
  return token;
}

/**
 * Whose session is this?
 *
 * Sliding expiry: using the dashboard keeps you signed in, walking away signs
 * you out. Returns undefined for anything unknown or expired.
 */
export function verifySession(db: DatabaseSync, token: string, now = Date.now()): string | undefined {
  if (!token) return undefined;
  const row = db
    .prepare('SELECT username, expires_at FROM dashboard_sessions WHERE token_hash = ?')
    .get(digest(token)) as { username: string; expires_at: number } | undefined;
  if (!row) return undefined;
  if (row.expires_at <= now) {
    db.prepare('DELETE FROM dashboard_sessions WHERE token_hash = ?').run(digest(token));
    return undefined;
  }
  db.prepare('UPDATE dashboard_sessions SET expires_at = ? WHERE token_hash = ?').run(
    now + SESSION_TTL_MS,
    digest(token),
  );
  return row.username;
}

export function logout(db: DatabaseSync, token: string): void {
  if (token) db.prepare('DELETE FROM dashboard_sessions WHERE token_hash = ?').run(digest(token));
}

/** Expired sessions are rows nobody will ever read again. */
export function pruneSessions(db: DatabaseSync, now = Date.now()): number {
  return db.prepare('DELETE FROM dashboard_sessions WHERE expires_at <= ?').run(now).changes as number;
}
