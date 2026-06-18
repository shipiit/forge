import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { simpleGit, type SimpleGit } from 'simple-git';

export interface RepoRef {
  owner: string;
  repo: string;
  /** Default branch to base work on (for fix mode) or the head ref (for review). */
  ref: string;
}

export interface Workspace {
  dir: string;
  git: SimpleGit;
  cleanup(): Promise<void>;
}

/** Build an authenticated clone URL using a GitHub App installation token. */
export function authCloneUrl(owner: string, repo: string, token: string): string {
  return `https://x-access-token:${token}@github.com/${owner}/${repo}.git`;
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
}

export const realWorkspace: WorkspacePort = { clone: cloneRepo, createBranch, commitAll, pushBranch };
