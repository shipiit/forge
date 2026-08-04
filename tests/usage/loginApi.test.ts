import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { IncomingMessage, type ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { migrate } from '../../src/usage/sqlite.js';
import { createUser } from '../../src/usage/auth.js';
import { serveUsage } from '../../src/usage/api.js';

/**
 * The dashboard is not open to the internet.
 *
 * These go through `serveUsage` rather than the auth helpers, because the
 * question here is not "does scrypt work" — it is whether an unauthenticated
 * request can read a repository name.
 */

let db: DatabaseSync;
const TOKEN = 'shared-token-for-scripts';
const PASSWORD = 'a-long-enough-password';

beforeEach(async () => {
  db = new DatabaseSync(':memory:');
  migrate(db);
  await createUser(db, 'alice', PASSWORD);
});

async function call(
  method: string,
  url: string,
  opts: { body?: unknown; auth?: string; token?: string } = {},
): Promise<{ status: number; body: any }> {
  const req = new IncomingMessage(new Socket());
  req.method = method;
  req.url = url;
  if (opts.auth) req.headers.authorization = `Bearer ${opts.auth}`;
  const chunks = opts.body ? [Buffer.from(JSON.stringify(opts.body))] : [];
  (req as any)[Symbol.asyncIterator] = async function* () {
    for (const c of chunks) yield c;
  };

  let status = 0;
  let out = '';
  const res = {
    writeHead(s: number) {
      status = s;
      return this;
    },
    end(b?: string) {
      out = b ?? '';
    },
  } as unknown as ServerResponse;

  await serveUsage({ db, artifactDir: '/tmp', token: opts.token ?? TOKEN }, req, res);
  return { status, body: out ? JSON.parse(out) : null };
}

describe('nothing is readable without a credential', () => {
  it('refuses the data routes outright', async () => {
    for (const route of ['/api/summary', '/api/runs', '/api/findings']) {
      expect((await call('GET', route)).status).toBe(401);
    }
  });

  it('refuses a wrong token and a made-up session alike', async () => {
    expect((await call('GET', '/api/summary', { auth: 'not-the-token' })).status).toBe(401);
    expect((await call('GET', '/api/summary', { auth: 'f'.repeat(64) })).status).toBe(401);
  });

  it('fails closed when nothing at all is configured', async () => {
    const empty = new DatabaseSync(':memory:');
    migrate(empty);
    const req = new IncomingMessage(new Socket());
    req.method = 'GET';
    req.url = '/api/summary';
    req.headers.authorization = 'Bearer anything';
    let status = 0;
    const res = {
      writeHead(s: number) {
        status = s;
        return this;
      },
      end() {},
    } as unknown as ServerResponse;
    await serveUsage({ db: empty, artifactDir: '/tmp', token: '' }, req, res);
    expect(status).toBe(401);
  });
});

describe('signing in', () => {
  it('exchanges a password for a session that reads data', async () => {
    const res = await call('POST', '/api/login', { body: { username: 'alice', password: PASSWORD } });
    expect(res.status).toBe(200);
    expect(res.body.token).toHaveLength(64);
    expect((await call('GET', '/api/summary', { auth: res.body.token })).status).toBe(200);
  });

  it('says the same thing about a wrong password and an unknown account', async () => {
    const wrong = await call('POST', '/api/login', { body: { username: 'alice', password: 'wrong-but-long' } });
    const nobody = await call('POST', '/api/login', { body: { username: 'ghost', password: PASSWORD } });
    expect(wrong.status).toBe(401);
    expect(nobody.status).toBe(401);
    expect(wrong.body).toEqual(nobody.body);
  });

  it('does not echo the password back in any form', async () => {
    const res = await call('POST', '/api/login', { body: { username: 'alice', password: 'wrong-but-long' } });
    expect(JSON.stringify(res.body)).not.toContain('wrong-but-long');
  });

  it('throttles guessing, per username', async () => {
    const guess = () => call('POST', '/api/login', { body: { username: 'throttled', password: 'nope-nope-nope' } });
    let last = await guess();
    for (let i = 0; i < 10 && last.status !== 429; i++) last = await guess();
    expect(last.status).toBe(429);
    // One person guessing must not lock everybody else out.
    expect((await call('POST', '/api/login', { body: { username: 'alice', password: PASSWORD } })).status).toBe(200);
  });
});

describe('who am I, and signing out', () => {
  it('names the account for a session and admits the token is not a person', async () => {
    const { body } = await call('POST', '/api/login', { body: { username: 'alice', password: PASSWORD } });
    expect((await call('GET', '/api/me', { auth: body.token })).body).toEqual({ username: 'alice' });
    expect((await call('GET', '/api/me', { auth: TOKEN })).body).toEqual({ username: null, token: true });
  });

  it('makes the session stop working, not just forget it locally', async () => {
    const { body } = await call('POST', '/api/login', { body: { username: 'alice', password: PASSWORD } });
    expect((await call('POST', '/api/logout', { auth: body.token })).status).toBe(200);
    expect((await call('GET', '/api/summary', { auth: body.token })).status).toBe(401);
  });
});

describe('whether to offer a sign-in form', () => {
  it('says so without a credential, because it is configuration and not data', async () => {
    const res = await call('GET', '/api/auth');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ accounts: true });
  });

  it('says there are none when nobody has been created', async () => {
    const empty = new DatabaseSync(':memory:');
    migrate(empty);
    const req = new IncomingMessage(new Socket());
    req.method = 'GET';
    req.url = '/api/auth';
    let out = '';
    const res = {
      writeHead() {
        return this;
      },
      end(b?: string) {
        out = b ?? '';
      },
    } as unknown as ServerResponse;
    await serveUsage({ db: empty, artifactDir: '/tmp', token: TOKEN }, req, res);
    expect(JSON.parse(out)).toEqual({ accounts: false });
  });
});

describe('reaching the API from a page on another origin', () => {
  it('allows the method the login actually uses', async () => {
    // The dashboard page is static and is usually served from somewhere other
    // than the agent. A preflight that lists only GET means the browser never
    // sends the sign-in request at all.
    const req = new IncomingMessage(new Socket());
    req.method = 'OPTIONS';
    req.url = '/api/login';
    let headers: Record<string, string> = {};
    const res = {
      writeHead(_s: number, h: Record<string, string>) {
        headers = h;
        return this;
      },
      end() {},
    } as unknown as ServerResponse;

    await serveUsage(
      { db, artifactDir: '/tmp', token: TOKEN, origin: 'https://shipiit.github.io' },
      req,
      res,
    );
    expect(headers['access-control-allow-methods']).toContain('POST');
    expect(headers['access-control-allow-origin']).toBe('https://shipiit.github.io');
    expect(headers['access-control-allow-headers']).toContain('content-type');
  });
});
