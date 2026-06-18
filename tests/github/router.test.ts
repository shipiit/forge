import { describe, it, expect } from 'vitest';
import { routeEvent, type RouteOpts } from '../../src/github/router.js';

const opts: RouteOpts = { triggerLabel: 'agent-fix', mentionHandle: '@shipit-forge', autoFix: 'label', autoReview: 'always' };
const repo = { repository: { owner: { login: 'o' }, name: 'r', default_branch: 'main' } };

describe('routeEvent', () => {
  it('fixes on the trigger label', () => {
    const route = routeEvent('issues', { ...repo, action: 'labeled', label: { name: 'agent-fix' }, issue: { number: 1, title: 'bug', body: 'b' } }, opts);
    expect(route).toMatchObject({ kind: 'fix', issueNumber: 1, owner: 'o', repo: 'r', defaultBranch: 'main' });
  });

  it('does not fix on opened unless autoFix=opened', () => {
    const base = { ...repo, action: 'opened', issue: { number: 1, title: 't', body: null } };
    expect(routeEvent('issues', base, opts).kind).toBe('none');
    expect(routeEvent('issues', base, { ...opts, autoFix: 'opened' }).kind).toBe('fix');
  });

  it('/fix comment on an issue triggers a fix', () => {
    const route = routeEvent('issue_comment', { ...repo, action: 'created', comment: { body: '/fix please' }, issue: { number: 5, title: 't', body: null } }, opts);
    expect(route).toMatchObject({ kind: 'fix', issueNumber: 5 });
  });

  it('/review on a PR comment triggers a review; /security sets securityOnly', () => {
    const pr = { ...repo, action: 'created', issue: { number: 9, pull_request: {} } };
    expect(routeEvent('issue_comment', { ...pr, comment: { body: '/review' } }, opts)).toMatchObject({ kind: 'review', pullNumber: 9, securityOnly: false });
    expect(routeEvent('issue_comment', { ...pr, comment: { body: '/security' } }, opts)).toMatchObject({ kind: 'review', securityOnly: true });
  });

  it('@mention on an issue → mention; on a PR → followup', () => {
    const issue = routeEvent('issue_comment', { ...repo, action: 'created', comment: { body: '@shipit-forge explain this' }, issue: { number: 2, title: 't', body: null } }, opts);
    expect(issue).toMatchObject({ kind: 'mention', question: 'explain this' });
    const prComment = routeEvent('issue_comment', { ...repo, action: 'created', comment: { body: '@shipit-forge fix the typo' }, issue: { number: 4, pull_request: {} } }, opts);
    expect(prComment).toMatchObject({ kind: 'followup', pullNumber: 4, question: 'fix the typo' });
  });

  it('auto-reviews PRs when autoReview=always, and on review_requested regardless', () => {
    expect(routeEvent('pull_request', { ...repo, action: 'opened', pull_request: { number: 7 } }, opts)).toMatchObject({ kind: 'review', pullNumber: 7 });
    expect(routeEvent('pull_request', { ...repo, action: 'opened', pull_request: { number: 7 } }, { ...opts, autoReview: 'requested' }).kind).toBe('none');
    expect(routeEvent('pull_request', { ...repo, action: 'review_requested', pull_request: { number: 7 } }, { ...opts, autoReview: 'requested' })).toMatchObject({ kind: 'review' });
  });

  it('review-comment mention → followup', () => {
    const route = routeEvent('pull_request_review_comment', { ...repo, action: 'created', comment: { body: '@shipit-forge handle this edge case' }, pull_request: { number: 12 } }, opts);
    expect(route).toMatchObject({ kind: 'followup', pullNumber: 12, question: 'handle this edge case' });
  });

  it('returns none for unactionable or malformed events', () => {
    expect(routeEvent('issues', { ...repo, action: 'closed', issue: { number: 1 } }, opts).kind).toBe('none');
    expect(routeEvent('push', { ...repo }, opts).kind).toBe('none');
    expect(routeEvent('issues', { action: 'opened' }, opts)).toMatchObject({ kind: 'none' }); // no repository
  });
});
