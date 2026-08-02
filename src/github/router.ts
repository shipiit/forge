/**
 * Pure mapping from a GitHub webhook/event (name + payload) to the action Forge
 * should take. Shared by the webhook App and the GitHub Action entry point so
 * both behave identically. No I/O — fully unit-testable.
 */

import { matchesAllFilters, type FilterSubject, type TriggerFilter } from './filters.js';

import { parseRunCommand } from '../routines.js';

/** Label applied by `review always`; subscribes a PR to push-triggered reviews. */
export const REVIEW_ALWAYS_LABEL = 'forge:review-always';

export interface RouteOpts {
  triggerLabel: string;
  mentionHandle: string; // e.g. "@shipit-forge"
  autoFix: 'label' | 'opened' | 'off';
  autoReview: 'always' | 'requested' | 'off';
  /** Review cadence for automatic triggers. */
  reviewBehavior?: 'opened' | 'every_push' | 'manual';
  /** Conditions a pull request must satisfy before any PR-driven run starts. */
  filters?: TriggerFilter[];
  /** Maintain a change-history document on merged work. */
  historyEnabled?: boolean;
}

interface RepoBits {
  owner: string;
  repo: string;
  defaultBranch: string;
}

export type Route =
  | ({ kind: 'fix'; issueNumber: number; issueTitle: string; issueBody: string | null } & RepoBits)
  | ({ kind: 'review'; pullNumber: number; securityOnly: boolean; subscribe?: boolean } & RepoBits)
  | ({ kind: 'followup'; pullNumber: number; question: string } & RepoBits)
  | ({ kind: 'mention'; issueNumber: number; question: string } & RepoBits)
  | ({ kind: 'audit'; issueNumber: number; ref: string } & RepoBits)
  | ({ kind: 'history'; pullNumber?: number; title: string; ref: string } & RepoBits)
  | ({ kind: 'release'; tag: string; releaseId: number } & RepoBits)
  | ({ kind: 'routine'; routine: string; args: string; issueNumber?: number } & RepoBits)
  | { kind: 'none'; reason: string };

function repoBits(payload: any): RepoBits | null {
  const r = payload?.repository;
  if (!r?.owner?.login || !r?.name) return null;
  return { owner: r.owner.login, repo: r.name, defaultBranch: r.default_branch ?? 'main' };
}

function stripMention(body: string, handle: string): string {
  return body.replace(new RegExp(handle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), '').trim();
}

/** Facts a filter is evaluated against, pulled off a pull_request payload. */
export function prSubject(pr: any): FilterSubject {
  return {
    author: pr?.user?.login,
    title: pr?.title ?? '',
    body: pr?.body ?? '',
    baseBranch: pr?.base?.ref,
    headBranch: pr?.head?.ref,
    labels: Array.isArray(pr?.labels) ? pr.labels.map((l: any) => l?.name).filter(Boolean) : [],
    isDraft: Boolean(pr?.draft),
    isMerged: Boolean(pr?.merged),
  };
}

/**
 * Parse a review command. Mirrors Claude Code:
 *   `review` / `review once` → one review, no subscription
 *   `review always`          → review AND subscribe to push-triggered reviews
 * The command must start the comment; `once`/`always` must be on the same line.
 */
export function parseReviewCommand(body: string): { securityOnly: boolean; subscribe: boolean } | null {
  const m = body.match(/^\/?(review|security)\b[ \t]*(once|always)?/i);
  if (!m) return null;
  return { securityOnly: m[1]!.toLowerCase() === 'security', subscribe: (m[2] ?? '').toLowerCase() === 'always' };
}

export function routeEvent(eventName: string, payload: any, opts: RouteOpts): Route {
  const bits = repoBits(payload);
  if (!bits) return { kind: 'none', reason: 'no repository in payload' };
  const action: string = payload?.action ?? '';
  const filters = opts.filters ?? [];

  switch (eventName) {
    case 'issues': {
      const issue = payload.issue;
      if (!issue) return { kind: 'none', reason: 'no issue' };
      const fix = (): Route => ({
        kind: 'fix',
        ...bits,
        issueNumber: issue.number,
        issueTitle: issue.title,
        issueBody: issue.body ?? null,
      });
      if (action === 'opened' && opts.autoFix === 'opened') return fix();
      if (action === 'labeled' && opts.autoFix !== 'off' && payload.label?.name === opts.triggerLabel) return fix();
      return { kind: 'none', reason: `issues.${action} not actionable` };
    }

    case 'issue_comment': {
      if (action !== 'created') return { kind: 'none', reason: 'not a new comment' };
      const issue = payload.issue;
      const body: string = (payload.comment?.body ?? '').trim();
      const isPr = Boolean(issue?.pull_request);

      if (/^\/fix\b/i.test(body) && !isPr) {
        return { kind: 'fix', ...bits, issueNumber: issue.number, issueTitle: issue.title, issueBody: issue.body ?? null };
      }
      if (/^\/audit\b/i.test(body)) {
        return { kind: 'audit', ...bits, issueNumber: issue.number, ref: bits.defaultBranch };
      }

      // `/run <routine>` starts a saved routine on demand, from any thread.
      const run = parseRunCommand(body);
      if (run) {
        return { kind: 'routine', ...bits, routine: run.name, args: run.args, issueNumber: issue.number };
      }

      // A review command, with or without the mention prefix.
      const withoutMention = body.toLowerCase().startsWith(opts.mentionHandle.toLowerCase())
        ? stripMention(body, opts.mentionHandle)
        : body;
      const cmd = parseReviewCommand(withoutMention);
      if (isPr && cmd) {
        return { kind: 'review', ...bits, pullNumber: issue.number, securityOnly: cmd.securityOnly, subscribe: cmd.subscribe };
      }

      if (body.toLowerCase().includes(opts.mentionHandle.toLowerCase())) {
        const question = stripMention(body, opts.mentionHandle) || 'Please help with this thread.';
        return isPr
          ? { kind: 'followup', ...bits, pullNumber: issue.number, question }
          : { kind: 'mention', ...bits, issueNumber: issue.number, question };
      }
      return { kind: 'none', reason: 'comment had no command or mention' };
    }

    case 'pull_request': {
      const pr = payload.pull_request;
      if (!pr) return { kind: 'none', reason: 'no pull_request' };

      // A merged PR feeds the change-history document, regardless of review config.
      if (action === 'closed' && pr.merged && opts.historyEnabled) {
        if (!matchesAllFilters(filters, prSubject(pr))) return { kind: 'none', reason: 'filters did not match' };
        return { kind: 'history', ...bits, pullNumber: pr.number, title: pr.title ?? '', ref: bits.defaultBranch };
      }

      const behavior = opts.reviewBehavior ?? 'every_push';
      // `review always` on a PR persists as a label, so a stateless service can
      // still honour a per-PR subscription across later pushes.
      const subscribed = (prSubject(pr).labels ?? []).includes(REVIEW_ALWAYS_LABEL);
      const wantsReview =
        (opts.autoReview === 'always' &&
          ((action === 'opened' && behavior !== 'manual') ||
            (action === 'ready_for_review' && behavior !== 'manual') ||
            (action === 'synchronize' && behavior === 'every_push'))) ||
        (subscribed && action === 'synchronize');

      if (wantsReview || action === 'review_requested') {
        const subject = prSubject(pr);
        if (!matchesAllFilters(filters, subject)) return { kind: 'none', reason: 'filters did not match' };
        // Automatic triggers skip drafts; an explicit invitation does not.
        if (subject.isDraft && action !== 'review_requested') {
          return { kind: 'none', reason: 'pull request is a draft' };
        }
        return { kind: 'review', ...bits, pullNumber: pr.number, securityOnly: false };
      }
      return { kind: 'none', reason: `pull_request.${action} not actionable` };
    }

    case 'push': {
      if (!opts.historyEnabled) return { kind: 'none', reason: 'history document disabled' };
      const ref: string = payload?.ref ?? '';
      const branch = ref.replace(/^refs\/heads\//, '');
      if (branch !== bits.defaultBranch) return { kind: 'none', reason: 'push was not to the default branch' };
      const commits: any[] = payload?.commits ?? [];
      // Merge commits arrive again via pull_request.closed; skip them here.
      const real = commits.filter((c) => !/^Merge (pull request|branch)\b/.test(c?.message ?? ''));
      if (real.length === 0) return { kind: 'none', reason: 'no non-merge commits in push' };
      return { kind: 'history', ...bits, title: real[0]?.message?.split('\n')[0] ?? 'recent changes', ref: branch };
    }

    case 'release': {
      if (action !== 'published' && action !== 'created') {
        return { kind: 'none', reason: `release.${action} not actionable` };
      }
      const rel = payload.release;
      if (!rel) return { kind: 'none', reason: 'no release' };
      return { kind: 'release', ...bits, tag: rel.tag_name ?? '', releaseId: rel.id };
    }

    case 'pull_request_review_comment': {
      if (action !== 'created') return { kind: 'none', reason: 'not a new review comment' };
      const body: string = (payload.comment?.body ?? '').trim();
      const pr = payload.pull_request;
      if (pr && body.toLowerCase().includes(opts.mentionHandle.toLowerCase())) {
        return {
          kind: 'followup',
          ...bits,
          pullNumber: pr.number,
          question: stripMention(body, opts.mentionHandle) || 'Please address this comment.',
        };
      }
      return { kind: 'none', reason: 'review comment had no mention' };
    }

    default:
      return { kind: 'none', reason: `event ${eventName} not handled` };
  }
}
