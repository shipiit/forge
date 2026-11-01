import type { OctokitLike } from './pr.js';

/**
 * Review only what a push changed.
 *
 * Every push to an open pull request used to re-review all of it: the same
 * files, the same tokens, the same conclusions, to find out about the one file
 * that moved. Forge records the commit it reviewed in its own comment, asks
 * GitHub which files changed since, and reviews the pull request's changes in
 * those files only. When nothing reviewable moved — a merge from the base
 * branch, a docs-only push outside the diff — it says so and spends nothing.
 *
 * Anything it cannot establish (no marker, a force-push that dropped the old
 * commit, an API error) falls back to the full review. Being wrong here costs
 * a missed bug; reviewing too much only costs money.
 */

const MARKER = /<!-- forge-reviewed-sha: ([0-9a-f]{40}) -->/i;

export function reviewedMarker(sha: string): string {
  return /^[0-9a-f]{40}$/i.test(sha) ? `<!-- forge-reviewed-sha: ${sha.toLowerCase()} -->` : '';
}

export function parseReviewedSha(body: string | null | undefined): string | undefined {
  return MARKER.exec(body ?? '')?.[1]?.toLowerCase();
}

/** Files changed between two commits, or undefined if GitHub cannot say (force-push, error, too large). */
export async function filesChangedSince(
  octokit: OctokitLike,
  args: { owner: string; repo: string },
  from: string,
  to: string,
  log: (msg: string) => void = () => {},
): Promise<Set<string> | undefined> {
  try {
    const res = await octokit.request('GET /repos/{owner}/{repo}/compare/{basehead}', {
      owner: args.owner,
      repo: args.repo,
      basehead: `${from}...${to}`,
      per_page: 300,
    });
    const data: unknown = res.data;
    const files = typeof data === 'object' && data !== null ? Reflect.get(data, 'files') : undefined;
    const status = typeof data === 'object' && data !== null ? Reflect.get(data, 'status') : undefined;
    // "diverged" or "behind" means the old head is not an ancestor: a rebase or
    // force-push. The compare no longer describes "what this push added".
    if (status !== 'ahead' && status !== 'identical') return undefined;
    if (!Array.isArray(files)) return undefined;
    // GitHub caps a compare at 300 files; past that, the list is incomplete.
    if (files.length >= 300) return undefined;
    return new Set(
      files
        .map((f) => (typeof f === 'object' && f !== null ? Reflect.get(f, 'filename') : undefined))
        .filter((n): n is string => typeof n === 'string'),
    );
  } catch (err) {
    log(`incremental: could not compare ${from.slice(0, 7)}...${to.slice(0, 7)} (${err instanceof Error ? err.message : 'unknown'})`);
    return undefined;
  }
}

/** The pull request's diff, keeping only the files in `keep`. */
export function filterDiff(diff: string, keep: ReadonlySet<string>): string {
  const sections = diff.split(/^(?=diff --git )/m);
  return sections
    .filter((s) => {
      const m = /^diff --git a\/(.+?) b\/(.+)$/m.exec(s);
      return m ? keep.has(m[2]!) || keep.has(m[1]!) : false;
    })
    .join('');
}
