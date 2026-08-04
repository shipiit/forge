import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { IncomingMessage, type ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { migrate } from '../../src/usage/sqlite.js';
import { serveUsage } from '../../src/usage/api.js';
import { resolveAsset, hasUi, uiRoot } from '../../src/usage/static.js';

/**
 * The agent serving its own dashboard.
 *
 * A client who self-hosts should not have to configure a CORS origin and type
 * an API base URL before seeing their own numbers. Served from the agent, the
 * page and its data share an origin and there is nothing to configure — but a
 * request path is attacker-controlled, so the file lookup has to stay inside
 * the directory it was given.
 */

let dir = '';
let db: DatabaseSync;

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'forge-ui-'));
  await fs.mkdir(path.join(dir, 'ui', 'assets'), { recursive: true });
  await fs.writeFile(path.join(dir, 'ui', 'index.html'), '<!doctype html><title>app shell</title>');
  await fs.writeFile(path.join(dir, 'ui', 'assets', 'app.js'), 'console.log(1)');
  // A file outside the UI root, to prove it cannot be reached.
  await fs.writeFile(path.join(dir, 'secret.txt'), 'MUST NOT BE SERVED');

  db = new DatabaseSync(':memory:');
  migrate(db);
});

afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

async function get(route: string): Promise<{ status: number; body: string; type: string }> {
  const req = new IncomingMessage(new Socket());
  req.method = 'GET';
  req.url = route;
  let status = 0;
  let body = '';
  let type = '';
  const res = {
    writeHead(s: number, h: Record<string, string> = {}) {
      status = s;
      type = h['content-type'] ?? '';
      return this;
    },
    end(b?: string | Buffer) {
      body = b ? b.toString() : '';
    },
  } as unknown as ServerResponse;
  await serveUsage({ db, artifactDir: dir, token: 'tok', uiDir: dir }, req, res);
  return { status, body, type };
}

describe('finding a file inside the UI', () => {
  it('will not walk out of the directory it was given', async () => {
    const root = uiRoot(dir);
    for (const attempt of ['../secret.txt', '../../etc/passwd', '/../secret.txt', '..%2fsecret.txt']) {
      expect(await resolveAsset(root, attempt), attempt).toBeUndefined();
    }
  });

  it('finds what is actually there', async () => {
    const root = uiRoot(dir);
    expect(await resolveAsset(root, 'index.html')).toBeTruthy();
    expect(await resolveAsset(root, 'assets/app.js')).toBeTruthy();
    expect(await hasUi(root)).toBe(true);
  });
});

describe('serving the dashboard', () => {
  it('answers the root with the app, not with a credential prompt', async () => {
    const res = await get('/');
    expect(res.status).toBe(200);
    expect(res.body).toContain('app shell');
  });

  it('answers a client-side route with the app, because the app owns routing', async () => {
    expect((await get('/runs')).body).toContain('app shell');
    expect((await get('/findings')).body).toContain('app shell');
  });

  it('serves an asset with its own type', async () => {
    const res = await get('/assets/app.js');
    expect(res.status).toBe(200);
    expect(res.type).toContain('javascript');
  });

  it('says a missing asset is missing rather than forbidden', async () => {
    // Falling through to the credential check answered a stale bundle with
    // 401, which sends whoever is debugging it to the wrong place entirely.
    expect((await get('/assets/gone.js')).status).toBe(404);
  });

  it('never serves a file from outside the UI directory', async () => {
    for (const attempt of ['/../secret.txt', '/../../secret.txt']) {
      const res = await get(attempt);
      expect(res.body).not.toContain('MUST NOT BE SERVED');
    }
  });

  it('still requires a credential for data', async () => {
    // The bundle is public in the way any single-page app is; the data it
    // then asks for is not.
    expect((await get('/api/summary')).status).toBe(401);
    expect((await get('/api/runs')).status).toBe(401);
  });
});
