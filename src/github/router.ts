/**
 * Pure mapping from a GitHub webhook/event (name + payload) to the action Forge
 * should take. Shared by the webhook App and the GitHub Action entry point so
 * both behave identically. No I/O — fully unit-testable.
 */

export interface RouteOpts {
  triggerLabel: string;
  mentionHandle: string; // e.g. "@shipit-forge"
  autoFix: 'label' | 'opened' | 'off';
  autoReview: 'always' | 'requested' | 'off';
}

interface RepoBits {
  owner: string;
  repo: string;
  defaultBranch: string;
}

export type Route =
  | ({ kind: 'fix'; issueNumber: number; issueTitle: string; issueBody: string | null } & RepoBits)
  | ({ kind: 'review'; pullNumber: number; securityOnly: boolean } & RepoBits)
  | ({ kind: 'followup'; pullNumber: number; question: string } & RepoBits)
  | ({ kind: 'mention'; issueNumber: number; question: string } & RepoBits)
  | { kind: 'none'; reason: string };

function repoBits(payload: any): RepoBits | null {
  const r = payload?.repository;
  if (!r?.owner?.login || !r?.name) return null;
  return { owner: r.owner.login, repo: r.name, defaultBranch: r.default_branch ?? 'main' };
}

function stripMention(body: string, handle: string): string {
  return body.replace(new RegExp(handle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), '').trim();
}

export function routeEvent(eventName: string, payload: any, opts: RouteOpts): Route {
  const bits = repoBits(payload);
  if (!bits) return { kind: 'none', reason: 'no repository in payload' };
  const action: string = payload?.action ?? '';

  switch (eventName) {
    case 'issues': {
      const issue = payload.issue;
      if (!issue) return { kind: 'none', reason: 'no issue' };
      const fix = (): Route => ({ kind: 'fix', ...bits, issueNumber: issue.number, issueTitle: issue.title, issueBody: issue.body ?? null });
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
      if (isPr && /^\/(review|security)\b/i.test(body)) {
        return { kind: 'review', ...bits, pullNumber: issue.number, securityOnly: /^\/security\b/i.test(body) };
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
      if ((action === 'opened' || action === 'synchronize') && opts.autoReview === 'always') {
        return { kind: 'review', ...bits, pullNumber: pr.number, securityOnly: false };
      }
      if (action === 'review_requested') {
        return { kind: 'review', ...bits, pullNumber: pr.number, securityOnly: false };
      }
      return { kind: 'none', reason: `pull_request.${action} not actionable` };
    }

    case 'pull_request_review_comment': {
      if (action !== 'created') return { kind: 'none', reason: 'not a new review comment' };
      const body: string = (payload.comment?.body ?? '').trim();
      const pr = payload.pull_request;
      if (pr && body.toLowerCase().includes(opts.mentionHandle.toLowerCase())) {
        return { kind: 'followup', ...bits, pullNumber: pr.number, question: stripMention(body, opts.mentionHandle) || 'Please address this comment.' };
      }
      return { kind: 'none', reason: 'review comment had no mention' };
    }

    default:
      return { kind: 'none', reason: `event ${eventName} not handled` };
  }
}
