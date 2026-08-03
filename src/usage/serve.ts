import http from 'node:http';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { migrate } from './sqlite.js';
import { PRAGMAS } from './schema.js';
import { serveUsage, type ApiOptions } from './api.js';
import { DEFAULT_DB } from './index.js';

/**
 * Serving the dashboard, two ways.
 *
 * `forge dashboard` runs it standalone against a database file. The App mounts
 * the same handler on the webhook server it already has, so a hosted install
 * gets the dashboard without a second process to deploy.
 */

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
): Promise<{ url: string; token: string; generated: boolean; close: () => Promise<void> }> {
  const file = opts.file || process.env.FORGE_USAGE_DB || DEFAULT_DB;
  const configured = opts.token ?? process.env.FORGE_DASHBOARD_TOKEN;
  const token = configured || generateToken();
  const host = opts.host || '127.0.0.1';
  const port = opts.port ?? Number(process.env.FORGE_DASHBOARD_PORT || 4300);

  const origin = opts.origin ?? process.env.FORGE_DASHBOARD_ORIGIN;
  const { db, artifactDir } = openUsageDb(file);
  const api: ApiOptions = { db, artifactDir, token, ...(origin ? { origin } : {}) };

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
  const token = env.FORGE_DASHBOARD_TOKEN?.trim();
  const file = env.FORGE_USAGE_DB?.trim() || (env.FORGE_USAGE === '1' ? DEFAULT_DB : '');
  if (!getRouter || !token || !file) {
    if (file && !token) log('usage dashboard not mounted: set FORGE_DASHBOARD_TOKEN to enable it');
    return false;
  }

  try {
    const { db, artifactDir } = openUsageDb(file);
    const router = getRouter('/usage');
    router.use((req, res, next) => {
      const origin = env.FORGE_DASHBOARD_ORIGIN?.trim();
      void serveUsage({ db, artifactDir, token, ...(origin ? { origin } : {}) }, req, res).then((handled) => {
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
