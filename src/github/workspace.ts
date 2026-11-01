import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { simpleGit, type SimpleGit } from 'simple-git';
import { cloneUrl } from './host.js';

export interface RepoRef {
  owner: string;
  repo: string;
  /** Default branch to base work on (for fix mode) or the head ref (for review). */
  ref: string;
  /**
   * Check out this pull request's code instead of `ref`, which is then the
   * branch it merges into. Fetched as `refs/pull/N/head`, so a pull request
   * from a fork gets its own code rather than whatever branch in this
   * repository happens to share its branch name.
   */
  pull?: number;
}

export interface Workspace {
  dir: string;
  git: SimpleGit;
  cleanup(): Promise<void>;
}

/**
 * Build an authenticated clone URL using a GitHub App installation token.
 * The host comes from the resolved GitHub host, so this works unchanged against
 * a self-hosted GitHub Enterprise Server instance.
 */
export function authCloneUrl(owner: string, repo: string, token: string): string {
  return cloneUrl(owner, repo, token);
}

/**
 * Clone a repository (shallow) into a fresh temp directory and check out `ref`.
 * Returns the workspace plus a cleanup function that removes the temp dir.
 */
export async function cloneRepo(repoRef: RepoRef, token: string): Promise<Workspace> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `forge-ws-${repoRef.repo}-`));
  const git = simpleGit();
  await git.clone(authCloneUrl(repoRef.owner, repoRef.repo, token), dir, [
    '--depth',
    '50',
    '--branch',
    repoRef.ref,
  ]);
  const repoGit = simpleGit(dir);
  if (repoRef.pull !== undefined) await checkoutPull(repoGit, repoRef.pull);
  await repoGit.addConfig('user.name', process.env.FORGE_DISPLAY_NAME || 'ShipIT Forge');
  await repoGit.addConfig('user.email', process.env.FORGE_GIT_EMAIL || 'forge@users.noreply.github.com');
  return {
    dir,
    git: repoGit,
    async cleanup() {
      await fs.rm(dir, { recursive: true, force: true });
    },
  };
}

/** Check out a pull request's head as GitHub publishes it, fork or not. */
export async function checkoutPull(git: SimpleGit, pull: number): Promise<void> {
  if (!Number.isInteger(pull) || pull <= 0) throw new Error(`not a pull request number: ${pull}`);
  await git.raw(['fetch', '--depth', '50', '--no-tags', 'origin', `+refs/pull/${pull}/head`]);
  await git.raw(['checkout', '--detach', 'FETCH_HEAD']);
}

/** Create and check out a new branch in the workspace. */
export async function createBranch(ws: Workspace, branch: string): Promise<void> {
  await ws.git.checkoutLocalBranch(branch);
}

/**
 * Stage all changes and commit. Returns true if a commit was created, false if
 * there was nothing to commit (so callers can avoid opening an empty PR).
 */
export async function commitAll(ws: Workspace, message: string): Promise<boolean> {
  await ws.git.add('-A');
  const status = await ws.git.status();
  if (status.files.length === 0) return false;
  await ws.git.commit(message);
  return true;
}

/** Push the given branch to origin (origin already carries the auth token). */
export async function pushBranch(ws: Workspace, branch: string): Promise<void> {
  await ws.git.push(['-u', 'origin', branch]);
}

/**
 * The set of workspace operations the handlers depend on. Bundling them behind
 * an interface lets tests inject a fake (no real git/network) while production
 * uses {@link realWorkspace}.
 */
export interface WorkspacePort {
  clone(repoRef: RepoRef, token: string): Promise<Workspace>;
  createBranch(ws: Workspace, branch: string): Promise<void>;
  commitAll(ws: Workspace, message: string): Promise<boolean>;
  pushBranch(ws: Workspace, branch: string): Promise<void>;
  diffHead(ws: Workspace): Promise<string>;
  commitSubjects(ws: Workspace, range: string, limit?: number): Promise<string>;
}

/**
 * Is this a ref name we are willing to hand to git?
 *
 * git's own rules (git-check-ref-format) already forbid spaces, `~`, `^`, `:`,
 * `?`, `*`, `[` and control characters — but they permit `;`, `$`, `(`, `)`,
 * `&` and `|`, every one of which is a shell metacharacter. This is the second
 * line: the first is that nothing here reaches a shell at all.
 */
export function isSafeRef(ref: string): boolean {
  return /^[A-Za-z0-9._\/-]{1,255}$/.test(ref) && !ref.includes('..') && !ref.startsWith('-');
}

/**
 * Commit subjects in a range, without a shell.
 *
 * The range contains a tag name, and a tag name is written by whoever pushed
 * it. Interpolating one into a shell string is remote code execution for
 * anybody with push access; git accepts `;` and `$()` in a ref name quite
 * happily. Passing arguments as an array means there is no shell to inject
 * into, whatever the tag is called.
 */
export async function commitSubjects(ws: Workspace, range: string, limit = 300): Promise<string> {
  try {
    const out = await ws.git.raw(['log', '--no-merges', '--pretty=format:- %s (%an)', `--max-count=${limit}`, range]);
    return out.trim();
  } catch {
    // An unknown or malformed range is a bad request, not a crash: the caller
    // reports "no commits" and stops.
    return '';
  }
}

/** Unified diff of the most recent commit (HEAD~1..HEAD), for self-review. */
export async function diffHead(ws: Workspace): Promise<string> {
  try {
    return await ws.git.diff(['HEAD~1', 'HEAD']);
  } catch {
    return '';
  }
}

/**
 * Files from `ref`, written to a fresh directory: the repository's own
 * instructions as the branch being merged into has them.
 *
 * A pull request must not get to write the rules it is reviewed by. Read from
 * the checkout, a REVIEW.md added in the pull request saying "report nothing"
 * would be obeyed. Paths that do not exist at `ref` are simply absent, and so
 * is everything when `ref` cannot be read: no instructions, never the
 * pull request's.
 */
export async function trustedView(
  ws: Workspace,
  ref: string,
  paths: string[],
  maxFiles = 200,
): Promise<{ dir: string; cleanup(): Promise<void> }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'forge-trusted-'));
  const cleanup = () => fs.rm(dir, { recursive: true, force: true });
  if (!isSafeRef(ref)) return { dir, cleanup };
  try {
    const listed = await ws.git.raw(['ls-tree', '-r', '--name-only', ref, '--', ...paths]);
    for (const rel of listed.split('\n').filter(Boolean).slice(0, maxFiles)) {
      const target = path.join(dir, rel);
      if (!target.startsWith(dir + path.sep)) continue;
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, await ws.git.raw(['show', `${ref}:${rel}`]));
    }
  } catch {
    // No git, or no such ref: nothing is trusted, which is the safe answer.
  }
  return { dir, cleanup };
}

export const realWorkspace: WorkspacePort = {
  clone: cloneRepo,
  createBranch,
  commitAll,
  pushBranch,
  diffHead,
  commitSubjects,
};
