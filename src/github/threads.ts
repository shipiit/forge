import { fingerprint } from './findingIssues.js';
import type { ReviewFinding } from './review.js';

/**
 * Not repeating yourself across re-reviews.
 *
 * With `review always`, every push re-reviews the pull request. Without this,
 * the third push means the same finding posted three times, and a PR buried in
 * duplicate bot comments is exactly when a team turns review off. So each
 * inline comment carries a fingerprint, and a later review:
 *
 *  - **skips** a finding whose comment is already on the PR and unresolved, and
 *  - **resolves** the thread for a finding that has since been fixed.
 *
 * Resolution needs the GraphQL API — `resolveReviewThread` has no REST
 * equivalent — so it degrades to a no-op wherever GraphQL is unavailable rather
 * than failing the review.
 */

/** Embedded in each inline comment so a later run recognizes its own. */
export function commentMarker(f: ReviewFinding): string {
  return `<!-- forge-f: ${fingerprint(f)} -->`;
}

export interface ExistingComment {
  /** GraphQL node id of the review thread, when known. */
  threadId?: string;
  body: string;
  /** Whether the thread is already resolved. */
  resolved: boolean;
}

export interface ThreadPlan {
  /** Findings with no live comment — post these. */
  toPost: ReviewFinding[];
  /** Findings already commented and unresolved — do not repeat. */
  alreadyPosted: ReviewFinding[];
  /** Threads whose finding is gone — resolve these. */
  toResolve: string[];
}

/**
 * Work out what to post and what to resolve.
 *
 * Pure, so the interesting behaviour — never duplicate, always resolve what is
 * fixed — is testable without touching GitHub.
 */
export function planThreads(findings: ReviewFinding[], existing: ExistingComment[]): ThreadPlan {
  const live = new Map<string, ExistingComment>();
  for (const c of existing) {
    const m = c.body?.match(/<!-- forge-f: ([0-9a-f]{12}) -->/);
    if (m) live.set(m[1]!, c);
  }

  const current = new Set(findings.map(fingerprint));
  const toPost: ReviewFinding[] = [];
  const alreadyPosted: ReviewFinding[] = [];

  for (const f of findings) {
    // Already commented, resolved or not, is already said. An unresolved
    // thread is the same comment; a resolved one is somebody having dismissed
    // it, and re-posting reopens an argument they already settled.
    if (live.has(fingerprint(f))) alreadyPosted.push(f);
    else toPost.push(f);
  }

  const toResolve: string[] = [];
  for (const [fp, c] of live) {
    if (!current.has(fp) && !c.resolved && c.threadId) toResolve.push(c.threadId);
  }

  return { toPost, alreadyPosted, toResolve };
}

/** GraphQL to read this PR's review threads, with each thread's first comment. */
export const REVIEW_THREADS_QUERY = `
query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $number) {
      reviewThreads(first: 100) {
        nodes {
          id
          isResolved
          comments(first: 1) { nodes { body author { login } } }
        }
      }
    }
  }
}`;

export const RESOLVE_THREAD_MUTATION = `
mutation($threadId: ID!) {
  resolveReviewThread(input: { threadId: $threadId }) { thread { id } }
}`;

/** Shape of the threads query response, narrowed to what we read. */
export interface ThreadsResponse {
  repository?: {
    pullRequest?: {
      reviewThreads?: {
        nodes?: Array<{
          id: string;
          isResolved: boolean;
          comments?: { nodes?: Array<{ body?: string; author?: { login?: string } | null }> };
        }>;
      };
    };
  };
}

/** Flatten the GraphQL response into the shape `planThreads` expects. */
export function parseThreads(res: ThreadsResponse, isOwnComment: (login?: string) => boolean): ExistingComment[] {
  const nodes = res.repository?.pullRequest?.reviewThreads?.nodes ?? [];
  const out: ExistingComment[] = [];
  for (const t of nodes) {
    const first = t.comments?.nodes?.[0];
    if (!first?.body) continue;
    // Only ever consider our own comments — resolving someone else's thread
    // would be a genuinely rude thing for a bot to do.
    if (!isOwnComment(first.author?.login ?? undefined)) continue;
    out.push({ threadId: t.id, body: first.body, resolved: Boolean(t.isResolved) });
  }
  return out;
}

/** A line for the review summary when findings were withheld as duplicates. */
export function renderSkipped(plan: ThreadPlan): string {
  if (plan.alreadyPosted.length === 0) return '';
  const n = plan.alreadyPosted.length;
  return `\n\n<sub>${n} finding${n === 1 ? '' : 's'} already commented on this PR ${n === 1 ? 'was' : 'were'} not repeated.</sub>`;
}
