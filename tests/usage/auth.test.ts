import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { rmSync } from 'node:fs';
import { migrate } from '../../src/usage/sqlite.js';
import {
  createUser,
  hashPassword,
  listUsers,
  login,
  logout,
  passwordProblem,
  removeUser,
  setPassword,
  userCount,
  verifyPassword,
  verifySession,
  pruneSessions,
  SESSION_TTL_MS,
} from '../../src/usage/auth.js';

let db: DatabaseSync;

beforeEach(() => {
  db = new DatabaseSync(':memory:');
  migrate(db);
});

const PASSWORD = 'a-long-enough-password';

describe('storing a password', () => {
  it('never stores the password itself', async () => {
    const stored = await hashPassword(PASSWORD);
    expect(stored).not.toContain(PASSWORD);
    expect(stored.startsWith('scrypt$')).toBe(true);
  });

  it('gives two people who chose the same password different hashes', async () => {
    // That is what the salt is for, and it is why it is stored beside the hash.
    expect(await hashPassword(PASSWORD)).not.toBe(await hashPassword(PASSWORD));
  });

  it('verifies the right one and rejects the rest', async () => {
    const stored = await hashPassword(PASSWORD);
    expect(await verifyPassword(PASSWORD, stored)).toBe(true);
    expect(await verifyPassword('a-long-enough-passworD', stored)).toBe(false);
    expect(await verifyPassword('', stored)).toBe(false);
  });

  it('refuses to be fooled by a mangled hash rather than throwing', async () => {
    for (const bad of ['', 'plaintext', 'scrypt$notyhex', 'md5$aa$bb']) {
      expect(await verifyPassword(PASSWORD, bad)).toBe(false);
    }
  });

  it('asks for a length worth having', () => {
    expect(passwordProblem('short')).toContain('12 characters');
    expect(passwordProblem(PASSWORD)).toBeNull();
  });
});

describe('accounts', () => {
  it('creates, lists and removes', async () => {
    await createUser(db, 'Alice', PASSWORD);
    expect(userCount(db)).toBe(1);
    expect(listUsers(db)[0]!.username).toBe('alice'); // names are not case-sensitive
    expect(removeUser(db, 'ALICE')).toBe(true);
    expect(userCount(db)).toBe(0);
  });

  it('will not quietly overwrite an existing account', async () => {
    await createUser(db, 'alice', PASSWORD);
    await expect(createUser(db, 'alice', 'another-good-password')).rejects.toThrow('already an account');
  });

  it('will not create one with a password that is too short', async () => {
    await expect(createUser(db, 'alice', 'short')).rejects.toThrow('12 characters');
    expect(userCount(db)).toBe(0);
  });
});

describe('signing in', () => {
  beforeEach(async () => {
    await createUser(db, 'alice', PASSWORD);
  });

  it('issues a session for the right password', async () => {
    const token = await login(db, 'alice', PASSWORD);
    expect(token).toBeTruthy();
    expect(verifySession(db, token!)).toBe('alice');
  });

  it('refuses the wrong password, and says nothing different about an unknown user', async () => {
    // Telling those apart is how somebody enumerates accounts.
    expect(await login(db, 'alice', 'wrong-but-long-enough')).toBeNull();
    expect(await login(db, 'nobody', PASSWORD)).toBeNull();
  });

  it('records when they last signed in', async () => {
    await login(db, 'alice', PASSWORD);
    expect(listUsers(db)[0]!.lastLogin).toBeGreaterThan(0);
  });

  it('does not store the session token itself', async () => {
    const token = await login(db, 'alice', PASSWORD);
    const rows = db.prepare('SELECT token_hash FROM dashboard_sessions').all() as Array<{ token_hash: string }>;
    // A copy of the database must not be replayable as a login.
    expect(rows[0]!.token_hash).not.toBe(token);
  });
});

describe('sessions end', () => {
  beforeEach(async () => {
    await createUser(db, 'alice', PASSWORD);
  });

  it('expires, and using it keeps it alive', async () => {
    const start = 1_000_000;
    const token = (await login(db, 'alice', PASSWORD, start))!;
    expect(verifySession(db, token, start + SESSION_TTL_MS - 1)).toBe('alice');
    // That read pushed the expiry out, so a moment later it is still valid.
    expect(verifySession(db, token, start + SESSION_TTL_MS + 1)).toBe('alice');
    // Walking away does not.
    expect(verifySession(db, token, start + 3 * SESSION_TTL_MS)).toBeUndefined();
  });

  it('signs out on request', async () => {
    const token = (await login(db, 'alice', PASSWORD))!;
    logout(db, token);
    expect(verifySession(db, token)).toBeUndefined();
  });

  it('signs out everywhere when the password changes', async () => {
    const token = (await login(db, 'alice', PASSWORD))!;
    await setPassword(db, 'alice', 'a-completely-new-password');
    // A password change that leaves old sessions alive has changed nothing.
    expect(verifySession(db, token)).toBeUndefined();
    expect(await login(db, 'alice', 'a-completely-new-password')).toBeTruthy();
  });

  it('signs out everywhere when the account is deleted', async () => {
    const token = (await login(db, 'alice', PASSWORD))!;
    removeUser(db, 'alice');
    expect(verifySession(db, token)).toBeUndefined();
  });

  it('rejects a token nobody ever issued', () => {
    expect(verifySession(db, 'f'.repeat(64))).toBeUndefined();
    expect(verifySession(db, '')).toBeUndefined();
  });

  it('clears out expired rows', async () => {
    const start = 1_000_000;
    await login(db, 'alice', PASSWORD, start);
    expect(pruneSessions(db, start + 2 * SESSION_TTL_MS)).toBe(1);
  });
});

describe('the hint people are asked to paste', () => {
  it('names the command that actually exists', async () => {
    // `forge dashboard user add` is not a command — `dashboard:user` is. A
    // hint that fails when pasted is worse than no hint.
    const { renderAccounts } = await import('../../src/usage/accounts.js');
    const tmp = `${tmpdir()}/forge-hint-${process.pid}.db`;
    expect(renderAccounts(tmp)).toContain('forge dashboard:user add');
    rmSync(tmp, { force: true });
    rmSync(`${tmp}-artifacts`, { recursive: true, force: true });
  });
});
