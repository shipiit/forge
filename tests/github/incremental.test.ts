import { describe, it, expect } from 'vitest';
import { filesChangedSince, filterDiff, parseReviewedSha, reviewedMarker } from '../../src/github/incremental.js';
import { parseThreads, planThreads } from '../../src/github/threads.js';
import { routeEvent } from '../../src/github/router.js';
import type { OctokitLike } from '../../src/github/pr.js';
import type { ReviewFinding } from '../../src/github/review.js';

const A = 'a'.repeat(40);
const B = 'b'.repeat(40);

describe('the reviewed-commit marker', () => {
  it('round-trips a commit SHA', () => {
    expect(parseReviewedSha(`review text\n\n${reviewedMarker(A.toUpperCase())}`)).toBe(A);
  });

  it.each(['', 'no marker', '<!-- forge-reviewed-sha: abc -->', null, undefined])('finds nothing in %j', (body) => {
    expect(parseReviewedSha(body)).toBeUndefined();
  });

  it('writes nothing for something that is not a SHA', () => {
    expect(reviewedMarker('main')).toBe('');
  });
});

describe('filterDiff', () => {
  const diff = [
    'diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-x\n+y\n',
    'diff --git a/src/b.ts b/src/b.ts\n--- a/src/b.ts\n+++ b/src/b.ts\n@@ -1 +1 @@\n-p\n+q\n',
    'diff --git a/old.ts b/new.ts\nsimilarity index 90%\nrename from old.ts\nrename to new.ts\n',
  ].join('');

  it('keeps only the named files', () => {
    const out = filterDiff(diff, new Set(['src/b.ts']));
    expect(out).toContain('src/b.ts');
    expect(out).not.toContain('src/a.ts');
  });

  it('keeps a rename by either name', () => {
    expect(filterDiff(diff, new Set(['new.ts']))).toContain('rename to new.ts');
    expect(filterDiff(diff, new Set(['old.ts']))).toContain('rename from old.ts');
  });

  it('returns nothing for an empty set or an empty diff', () => {
    expect(filterDiff(diff, new Set())).toBe('');
    expect(filterDiff('', new Set(['src/a.ts']))).toBe('');
  });
});

describe('filesChangedSince', () => {
  const octokit = (data: unknown | Error) => {
    const asked: Array<Record<string, unknown>> = [];
    const o = {
      async request(_r: string, p: Record<string, unknown>) {
        asked.push(p);
        if (data instanceof Error) throw data;
        return { data };
      },
    } as unknown as OctokitLike;
    return { o, asked };
  };

  it('lists the files when the new head is ahead of the old one', async () => {
    const { o, asked } = octokit({ status: 'ahead', files: [{ filename: 'src/a.ts' }, { filename: 'README.md' }] });
    expect(await filesChangedSince(o, { owner: 'o', repo: 'r' }, A, B)).toEqual(new Set(['src/a.ts', 'README.md']));
    expect(asked[0]!.basehead).toBe(`${A}...${B}`);
  });

  it('is empty, not unknown, when nothing changed', async () => {
    expect(await filesChangedSince(octokit({ status: 'identical', files: [] }).o, { owner: 'o', repo: 'r' }, A, B)).toEqual(new Set());
  });

  it.each([
    ['a force-push', { status: 'diverged', files: [{ filename: 'x' }] }],
    ['a reset', { status: 'behind', files: [] }],
    ['a capped list', { status: 'ahead', files: Array.from({ length: 300 }, (_, i) => ({ filename: `f${i}` })) }],
    ['a malformed answer', { status: 'ahead' }],
    ['an API error', new Error('404')],
  ])('cannot say after %s', async (_why, data) => {
    expect(await filesChangedSince(octokit(data).o, { owner: 'o', repo: 'r' }, A, B)).toBeUndefined();
  });
});

describe('resolving threads after a partial review', () => {
  const f = (file: string): ReviewFinding => ({ file, startLine: 1, endLine: 1, lens: 'quality', severity: 'low', category: 'x', title: 't', body: 'b' });
  const thread = (id: string, path: string | undefined, file: string) => ({
    threadId: id,
    body: `<!-- forge-f: ${'0'.repeat(12)} -->`,
    resolved: false,
    ...(path ? { path } : {}),
    file,
  });

  it('resolves only threads in files the review read', () => {
    const existing = [
      { ...thread('in', 'src/a.ts', 'src/a.ts'), body: '<!-- forge-f: 111111111111 -->' },
      { ...thread('out', 'src/b.ts', 'src/b.ts'), body: '<!-- forge-f: 222222222222 -->' },
      { ...thread('nopath', undefined, ''), body: '<!-- forge-f: 333333333333 -->' },
    ];
    expect(planThreads([], existing, new Set(['src/a.ts'])).toResolve).toEqual(['in']);
    expect(planThreads([f('src/a.ts')], existing).toResolve.sort()).toEqual(['in', 'nopath', 'out']);
  });

  it('reads the thread path from GitHub', () => {
    const parsed = parseThreads(
      { repository: { pullRequest: { reviewThreads: { nodes: [{ id: 't', isResolved: false, path: 'src/a.ts', comments: { nodes: [{ body: 'x', author: { login: 'forge' } }] } }] } } } },
      () => true,
    );
    expect(parsed[0]!.path).toBe('src/a.ts');
  });
});

describe('which pull-request events review incrementally', () => {
  const route = (action: string) =>
    routeEvent(
      'pull_request',
      { action, repository: { name: 'r', owner: { login: 'o' }, default_branch: 'main' }, pull_request: { number: 5, draft: false, labels: [] } },
      { triggerLabel: 'agent-fix', mentionHandle: '@forge', autoFix: 'label', autoReview: 'always', reviewBehavior: 'every_push', filters: [] },
    );

  it('a push does', () => {
    expect(route('synchronize')).toMatchObject({ kind: 'review', incremental: true });
  });

  it.each(['opened', 'ready_for_review', 'review_requested'])('%s reviews everything', (action) => {
    const r = route(action);
    expect(r.kind).toBe('review');
    expect(r).not.toHaveProperty('incremental');
  });
});
