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

describe('commands addressed to the agent by name', () => {
  const comment = (body: string, opts: Record<string, unknown> = {}) =>
    routeEvent(
      'issue_comment',
      {
        action: 'created',
        comment: { body },
        issue: { number: 7, title: 'Broken', body: 'It breaks.' },
        repository: { owner: { login: 'o' }, name: 'r', default_branch: 'main' },
        ...opts,
      } as never,
      { mentionHandle: '@shipit-forge', autoFix: 'label', autoReview: 'always', reviewBehavior: 'comment', filters: {}, historyEnabled: false } as never,
    );

  it('runs /fix when it is addressed to the agent first', () => {
    // "@forge /fix" is how people actually ask. It used to fall through to the
    // mention handler, which read `/fix` as the name of a skill and replied
    // "No skill named /fix" with a list of skills.
    expect(comment('@shipit-forge /fix').kind).toBe('fix');
    expect(comment('/fix').kind).toBe('fix');
  });

  it('runs the other commands after a mention too', () => {
    expect(comment('@shipit-forge /audit').kind).toBe('audit');
    expect(comment('@ShipIT-Forge /fix please').kind).toBe('fix');
  });

  it('still treats a plain mention as a question', () => {
    const r = comment('@shipit-forge what does this do?');
    expect(r.kind).toBe('mention');
    expect('question' in r && r.question).toBe('what does this do?');
  });

  it('hands the thread text to a mention, so it is not answering blind', () => {
    // Without these the agent replies "I need more information" about an issue
    // that is sitting directly above the comment.
    const r = comment('@shipit-forge diagnose this');
    expect('issueTitle' in r && r.issueTitle).toBe('Broken');
    expect('issueBody' in r && r.issueBody).toBe('It breaks.');
  });
});

describe('/help', () => {
  const comment = (body: string) =>
    routeEvent(
      'issue_comment',
      {
        action: 'created',
        comment: { body },
        issue: { number: 9, title: 'Question', body: 'How does caching work?' },
        repository: { owner: { login: 'o' }, name: 'r', default_branch: 'main' },
      } as never,
      { mentionHandle: '@shipit-forge', autoFix: 'label', autoReview: 'always', reviewBehavior: 'comment', filters: {}, historyEnabled: false } as never,
    );

  it('answers a question from the code, without anyone knowing a skill name', () => {
    const r = comment('/help how do I add a new provider?');
    expect(r.kind).toBe('mention');
    expect('skill' in r && r.skill).toBe('how-to');
    expect('question' in r && r.question).toBe('how do I add a new provider?');
  });

  it('works when addressed to the agent first', () => {
    const r = comment('@shipit-forge /help how do I run this locally?');
    expect('skill' in r && r.skill).toBe('how-to');
  });

  it('accepts /how and /how-to as the same thing', () => {
    for (const c of ['/how do I deploy?', '/how-to deploy']) {
      expect('skill' in comment(c) && comment(c).skill).toBe('how-to');
    }
  });

  it('asks a sensible default when given nothing', () => {
    // "/help" on its own is somebody who does not know what to ask yet.
    expect('question' in comment('/help') && comment('/help').question).toContain('how do I use it');
  });

  it('carries the thread text, so it can read what was asked above', () => {
    const r = comment('/help');
    expect('issueBody' in r && r.issueBody).toBe('How does caching work?');
  });
});
