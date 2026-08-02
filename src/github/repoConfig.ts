import { load } from 'js-yaml';
import type { OctokitLike } from './pr.js';
import { mergeConfig, defaultConfig, type ForgeConfig } from '../config.js';

/**
 * Read `.github/agent.yml` over the API.
 *
 * The hosted App gets this free from Probot's `context.config`, but the Action
 * runs before any checkout and has no such helper — so without this, every
 * per-repository setting (routines, filters, change history, trigger phrase)
 * silently did nothing in the Action while the documentation said otherwise.
 *
 * Never throws: a missing, unreadable, or malformed file falls back to the
 * env-seeded defaults, exactly like the App does.
 */
export async function loadRepoConfig(
  octokit: OctokitLike,
  owner: string,
  repo: string,
  log: (msg: string) => void = () => {},
): Promise<ForgeConfig> {
  const base = defaultConfig();

  for (const path of ['.github/agent.yml', '.github/agent.yaml']) {
    try {
      const res = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
        owner,
        repo,
        path,
        headers: { accept: 'application/vnd.github.raw' },
      });
      // The raw media type yields a string; the JSON shape yields base64 content.
      const data = res.data as unknown;
      const text =
        typeof data === 'string'
          ? data
          : Buffer.from((data as { content?: string })?.content ?? '', 'base64').toString('utf8');
      if (!text.trim()) continue;

      const parsed = load(text);
      log(`loaded ${path}`);
      return mergeConfig(parsed, base);
    } catch {
      /* try the next filename, then fall back to defaults */
    }
  }
  return base;
}
