import { describe, it, expect } from 'vitest';
import { commentMarker, parseThreads, planThreads, renderSkipped } from '../../src/github/threads.js';
import { renderFindingBody, type ReviewFinding } from '../../src/github/review.js';

const finding = (over: Partial<ReviewFinding> = {}): ReviewFinding => ({
  file: 'src/proxy.ts',
  startLine: 8,
  endLine: 8,
  lens: 'security',
  severity: 'high',
  category: 'CWE-918',
  title: 'SSRF via unvalidated URL',
  body: 'attacker-controlled target',
  ...over,
});

const commented = (f: ReviewFinding, resolved = false, threadId = 't1') => ({
  threadId,
  body: renderFindingBody(f),
  resolved,
});

describe('the marker on every inline comment', () => {
  it('is embedded in the rendered body', () => {
    expect(renderFindingBody(finding())).toContain(commentMarker(finding()));
  });

  it('is stable across re-renders, so it survives a re-review', () => {
    expect(commentMarker(finding())).toBe(commentMarker(finding({ body: 'reworded' })));
  });
});

describe('planning a re-review', () => {
  it('posts everything on a first review', () => {
    const plan = planThreads([finding()], []);
    expect(plan.toPost).toHaveLength(1);
    expect(plan.alreadyPosted).toHaveLength(0);
    expect(plan.toResolve).toHaveLength(0);
  });

  it('does not repeat a finding already commented', () => {
    // The behaviour that stops a PR filling with duplicate bot comments after
    // three pushes.
    const f = finding();
    const plan = planThreads([f], [commented(f)]);
    expect(plan.toPost).toHaveLength(0);
    expect(plan.alreadyPosted).toHaveLength(1);
  });

  it('does not repost a finding whose thread a human resolved', () => {
    const f = finding();
    const plan = planThreads([f], [commented(f, true)]);
    expect(plan.toPost).toHaveLength(0);
  });

  it('resolves a thread once its finding is gone', () => {
    const fixed = finding();
    const plan = planThreads([], [commented(fixed, false, 'thread-9')]);
    expect(plan.toResolve).toEqual(['thread-9']);
  });

  it('does not re-resolve an already resolved thread', () => {
    const plan = planThreads([], [commented(finding(), true, 'thread-9')]);
    expect(plan.toResolve).toEqual([]);
  });

  it('handles a mixed re-review: one fixed, one lingering, one new', () => {
    const lingering = finding({ title: 'Lingering' });
    const fixed = finding({ title: 'Fixed' });
    const fresh = finding({ title: 'Fresh' });

    const plan = planThreads(
      [lingering, fresh],
      [commented(lingering, false, 'a'), commented(fixed, false, 'b')],
    );
    expect(plan.toPost.map((f) => f.title)).toEqual(['Fresh']);
    expect(plan.alreadyPosted.map((f) => f.title)).toEqual(['Lingering']);
    expect(plan.toResolve).toEqual(['b']);
  });

  it('ignores comments that carry no marker', () => {
    const plan = planThreads([finding()], [{ threadId: 'x', body: 'a human said something', resolved: false }]);
    expect(plan.toPost).toHaveLength(1);
    expect(plan.toResolve).toEqual([]);
  });
});

describe('reading threads from GraphQL', () => {
  const res = {
    repository: {
      pullRequest: {
        reviewThreads: {
          nodes: [
            {
              id: 'ours',
              isResolved: false,
              comments: { nodes: [{ body: renderFindingBody(finding()), author: { login: 'shipit-forge[bot]' } }] },
            },
            {
              id: 'theirs',
              isResolved: false,
              comments: { nodes: [{ body: 'a human review comment', author: { login: 'octocat' } }] },
            },
          ],
        },
      },
    },
  };

  it('only considers our own threads', () => {
    // Resolving somebody else's review thread would be a genuinely rude thing
    // for a bot to do.
    const parsed = parseThreads(res, (login) => /forge|\[bot\]/i.test(login ?? ''));
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.threadId).toBe('ours');
  });

  it('carries the resolved flag through', () => {
    const parsed = parseThreads(
      {
        repository: {
          pullRequest: {
            reviewThreads: {
              nodes: [
                {
                  id: 'a',
                  isResolved: true,
                  comments: { nodes: [{ body: renderFindingBody(finding()), author: { login: 'forge[bot]' } }] },
                },
              ],
            },
          },
        },
      },
      () => true,
    );
    expect(parsed[0]!.resolved).toBe(true);
  });

  it('survives an empty or malformed response', () => {
    expect(parseThreads({}, () => true)).toEqual([]);
    expect(parseThreads({ repository: { pullRequest: {} } }, () => true)).toEqual([]);
  });
});

describe('the summary note', () => {
  it('says nothing when nothing was withheld', () => {
    expect(renderSkipped({ toPost: [], alreadyPosted: [], toResolve: [] })).toBe('');
  });

  it('reports how many were not repeated, with correct grammar', () => {
    expect(renderSkipped({ toPost: [], alreadyPosted: [finding()], toResolve: [] })).toContain('1 finding');
    expect(renderSkipped({ toPost: [], alreadyPosted: [finding(), finding()], toResolve: [] })).toContain('2 findings');
  });
});
