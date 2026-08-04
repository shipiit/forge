import http from 'node:http';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { migrate } from './sqlite.js';
import { PRAGMAS } from './schema.js';
import { serveUsage, type ApiOptions } from './api.js';
import { userCount } from './auth.js';
import { SQLiteRecorder } from './sqlite.js';
import { DEFAULT_DB } from './index.js';

/**
 * Serving the dashboard, two ways.
 *
 * `forge dashboard` runs it standalone against a database file. The App mounts
 * the same handler on the webhook server it already has, so a hosted install
 * gets the dashboard without a second process to deploy.
 */

/**
 * Delete what has aged out, once, at startup.
 *
 * Retention is only a policy if something enforces it; before this, transcripts
 * accumulated forever and the constants in schema.ts described an intention
 * rather than a behaviour. Startup is enough — this is a dashboard someone
 * opens, not a service under load.
 */
export async function pruneOnce(file: string): Promise<{ artifacts: number; toolCalls: number }> {
  const rec = new SQLiteRecorder({ file: path.resolve(file) });
  try {
    return await rec.prune();
  } finally {
    await rec.close();
  }
}

/** Open the usage database read-only-ish: same file, same migrations. */
export function openUsageDb(file: string): { db: DatabaseSync; artifactDir: string } {
  const abs = path.resolve(file);
  const db = new DatabaseSync(abs);
  db.exec(PRAGMAS);
  migrate(db);
  return { db, artifactDir: path.join(path.dirname(abs), 'artifacts') };
}

export interface DashboardOptions {
  file?: string;
  port?: number;
  host?: string;
  token?: string;
  /** Browser origin allowed to read the API (the site, when it is elsewhere). */
  origin?: string;
}

/** A token for a run that did not configure one. Printed, never stored. */
export function generateToken(bytes = 24): string {
  return randomBytes(bytes).toString('base64url');
}

/**
 * Start the standalone dashboard.
 *
 * Always authenticated. When no token is configured one is generated for the
 * lifetime of the process and printed with the URL — an unauthenticated port,
 * even on loopback, is readable by anything else running on the machine, and
 * "it was only local" is not a property anyone can check later.
 *
 * Binds to loopback unless told otherwise, so publishing it is a deliberate act.
 */
export async function startDashboard(
  opts: DashboardOptions = {},
): Promise<{
  url: string;
  token: string;
  generated: boolean;
  pruned: { artifacts: number; toolCalls: number };
  close: () => Promise<void>;
}> {
  const file = opts.file || process.env.FORGE_USAGE_DB || DEFAULT_DB;
  const configured = opts.token ?? process.env.FORGE_DASHBOARD_TOKEN;
  const token = configured || generateToken();
  const host = opts.host || '127.0.0.1';
  const port = opts.port ?? Number(process.env.FORGE_DASHBOARD_PORT || 4300);

  const origin = opts.origin ?? process.env.FORGE_DASHBOARD_ORIGIN;
  const pruned = await pruneOnce(file);
  const { db, artifactDir } = openUsageDb(file);
  // The built dashboard ships beside the compiled server, so a self-hosted
  // deployment serves the page and its data from one origin.
  const uiDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  const api: ApiOptions = { db, artifactDir, token, uiDir, ...(origin ? { origin } : {}) };

  const server = http.createServer((req, res) => {
    void serveUsage(api, req, res).then((handled) => {
      if (!handled) {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('not found');
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });

  const shown = host === '0.0.0.0' ? 'localhost' : host;
  return {
    url: `http://${shown}:${port}/?token=${token}`,
    token,
    generated: !configured,
    pruned,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          db.close();
          resolve();
        });
      }),
  };
}

/** Minimal shape of the router Probot hands an app; avoids an express import. */
export interface RouterLike {
  use(handler: (req: IncomingMessage, res: ServerResponse, next: () => void) => void): void;
}

/**
 * Mount the dashboard on the App's own webhook server, under /usage.
 *
 * A token is required here and there is no default: that host is public by
 * definition — it is how GitHub reaches you — and these routes return
 * repository names, actor logins, PR numbers and error strings. With no token
 * set, nothing is mounted at all.
 */
export function mountDashboard(
  getRouter: ((path?: string) => RouterLike) | undefined,
  env: NodeJS.ProcessEnv = process.env,
  log: (msg: string) => void = () => {},
): boolean {
  const token = env.FORGE_DASHBOARD_TOKEN?.trim() ?? '';
  const file = env.FORGE_USAGE_DB?.trim() || (env.FORGE_USAGE === '1' ? DEFAULT_DB : '');
  if (!getRouter || !file) return false;

  try {
    const { db, artifactDir } = openUsageDb(file);
    // Either credential is enough to mount: a shared token for scripts, or at
    // least one account for people. Neither means nothing is mounted — this
    // host is public by definition, since it is how GitHub reaches you.
    if (!token && userCount(db) === 0) {
      log(
        'usage dashboard not mounted: set FORGE_DASHBOARD_TOKEN, or create an account with ' +
          '`forge dashboard:user add <name>`',
      );
      return false;
    }
    const router = getRouter('/usage');
    router.use((req, res, next) => {
      const origin = env.FORGE_DASHBOARD_ORIGIN?.trim();
      const uiDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
      void serveUsage({ db, artifactDir, token, uiDir, mountPath: '/usage', ...(origin ? { origin } : {}) }, req, res).then((handled) => {
        if (!handled) next();
      });
    });
    log('usage dashboard mounted at /usage');
    return true;
  } catch (err) {
    // A dashboard that cannot open its database is not a reason to stop
    // handling webhooks.
    log(`usage dashboard not mounted: ${err instanceof Error ? err.message : 'failed to open the database'}`);
    return false;
  }
}
