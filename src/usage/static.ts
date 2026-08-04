import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ServerResponse } from 'node:http';

/**
 * Serving the dashboard from the agent itself.
 *
 * The dashboard used to be a page on our site that you pointed at your API.
 * That is fine for one person on a laptop and wrong for everybody who
 * self-hosts: it needs a CORS origin configured, an API base URL typed in by
 * hand, and it fails with an opaque network error when either is missing —
 * which is not a debugging session anybody should have to do before seeing
 * their own numbers.
 *
 * Served from the agent, the page and its data share an origin. There is no
 * CORS, no base URL, and nothing to configure: open the address, sign in.
 */

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

/** Where the built UI lives inside the package, if it was bundled at all. */
export function uiRoot(fromDir: string): string {
  return path.join(fromDir, 'ui');
}

/**
 * Resolve a request path to a file inside the root, or undefined.
 *
 * The resolved path is checked to still be inside the root, because a request
 * path is attacker-controlled and `..` is all it takes to walk out of it —
 * `/usage/../../etc/passwd` is a request anybody can make.
 */
export async function resolveAsset(root: string, requestPath: string): Promise<string | undefined> {
  const clean = decodeURIComponent(requestPath.split('?')[0] ?? '').replace(/^\/+/, '');
  const abs = path.resolve(root, clean);
  const rootAbs = path.resolve(root);
  if (abs !== rootAbs && !abs.startsWith(rootAbs + path.sep)) return undefined;
  try {
    const stat = await fs.stat(abs);
    return stat.isFile() ? abs : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Serve a built asset, or the app shell for anything that is not a file.
 *
 * A single-page app owns its own routing, so `/usage/runs` is a route rather
 * than a missing file and has to be answered with index.html. Only paths that
 * look like files are allowed to 404, so a genuinely missing asset still
 * reports as missing instead of silently returning HTML that a script tag
 * cannot parse.
 */
export async function serveUi(
  root: string,
  requestPath: string,
  res: ServerResponse,
  extraHeaders: Record<string, string> = {},
): Promise<boolean> {
  const file = await resolveAsset(root, requestPath);
  const looksLikeAFile = /\.[a-z0-9]{1,8}$/i.test(requestPath.split('?')[0] ?? '');

  const target = file ?? (looksLikeAFile ? undefined : await resolveAsset(root, 'index.html'));
  if (!target) return false;

  let body: Buffer;
  try {
    body = await fs.readFile(target);
  } catch {
    return false;
  }

  const ext = path.extname(target).toLowerCase();
  // The shell is never cached: it names the hashed bundles, so a stale copy
  // points at files that no longer exist after a deploy. Everything else is
  // content-hashed by the build and can be kept for a year.
  const immutable = ext !== '.html';
  res.writeHead(200, {
    'content-type': TYPES[ext] ?? 'application/octet-stream',
    'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    ...extraHeaders,
  });
  res.end(body);
  return true;
}

/** Is a built UI actually present? */
export async function hasUi(root: string): Promise<boolean> {
  return (await resolveAsset(root, 'index.html')) !== undefined;
}
