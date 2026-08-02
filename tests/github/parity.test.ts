import { describe, it, expect } from 'vitest';
import { matchesFilter, matchesAllFilters, parseFilters } from '../../src/github/filters.js';
import { resolveHost, octokitOptions, cloneUrl } from '../../src/github/host.js';
import { buildCheckRunOutput, buildCheckRunRequest, countSeverities, toAnnotations } from '../../src/github/checkrun.js';
import { capNits, chooseEvent, type ReviewFinding } from '../../src/github/review.js';
import { routeEvent, parseReviewCommand } from '../../src/github/router.js';
import { composeReviewSystemPrompt, renderProjectContextBlock } from '../../src/github/conventions.js';

const SUBJECT = {
  author: 'octocat',
  title: 'Add hotfix for auth',
  body: 'closes #12',
  baseBranch: 'main',
  headBranch: 'feat/auth-provider',
  labels: ['bug', 'needs-backport'],
  isDraft: false,
  isMerged: true,
};

describe('trigger filters', () => {
  it('matches equals / contains / starts_with', () => {
    expect(matchesFilter({ field: 'author', operator: 'equals', value: 'octocat' }, SUBJECT)).toBe(true);
    expect(matchesFilter({ field: 'title', operator: 'contains', value: 'HOTFIX' }, SUBJECT)).toBe(true);
    expect(matchesFilter({ field: 'head_branch', operator: 'starts_with', value: 'feat/' }, SUBJECT)).toBe(true);
    expect(matchesFilter({ field: 'author', operator: 'equals', value: 'someone' }, SUBJECT)).toBe(false);
  });

  it('matches labels as a multi-valued field', () => {
    expect(matchesFilter({ field: 'labels', operator: 'is_one_of', value: ['needs-backport'] }, SUBJECT)).toBe(true);
    expect(matchesFilter({ field: 'labels', operator: 'contains', value: 'backport' }, SUBJECT)).toBe(true);
    expect(matchesFilter({ field: 'labels', operator: 'is_not_one_of', value: ['bug'] }, SUBJECT)).toBe(false);
    expect(matchesFilter({ field: 'labels', operator: 'is_not_one_of', value: ['wontfix'] }, SUBJECT)).toBe(true);
  });

  it('treats matches_regex as a WHOLE-field match, not a substring', () => {
    // The documented footgun: bare `hotfix` must NOT match "Add hotfix for auth".
    expect(matchesFilter({ field: 'title', operator: 'matches_regex', value: 'hotfix' }, SUBJECT)).toBe(false);
    expect(matchesFilter({ field: 'title', operator: 'matches_regex', value: '.*hotfix.*' }, SUBJECT)).toBe(true);
  });

  it('never throws on an invalid regex from config', () => {
    expect(matchesFilter({ field: 'title', operator: 'matches_regex', value: '([' }, SUBJECT)).toBe(false);
  });

  it('handles boolean fields', () => {
    expect(matchesFilter({ field: 'is_draft', operator: 'equals', value: false }, SUBJECT)).toBe(true);
    expect(matchesFilter({ field: 'is_merged', operator: 'equals', value: true }, SUBJECT)).toBe(true);
    expect(matchesFilter({ field: 'is_draft', operator: 'equals', value: true }, SUBJECT)).toBe(false);
  });

  it('requires ALL filters to match', () => {
    expect(
      matchesAllFilters(
        [
          { field: 'base_branch', operator: 'equals', value: 'main' },
          { field: 'head_branch', operator: 'contains', value: 'auth-provider' },
        ],
        SUBJECT,
      ),
    ).toBe(true);
    expect(
      matchesAllFilters(
        [
          { field: 'base_branch', operator: 'equals', value: 'main' },
          { field: 'author', operator: 'equals', value: 'nobody' },
        ],
        SUBJECT,
      ),
    ).toBe(false);
  });

  it('an empty filter list matches everything', () => {
    expect(matchesAllFilters([], SUBJECT)).toBe(true);
  });

  it('drops malformed filters from untrusted config instead of throwing', () => {
    const parsed = parseFilters([
      { field: 'author', operator: 'equals', value: 'x' },
      { field: 'not_a_field', operator: 'equals', value: 'x' },
      { field: 'title', operator: 'nonsense', value: 'x' },
      { field: 'title' },
      'garbage',
    ]);
    expect(parsed).toHaveLength(1);
    expect(parseFilters('nope')).toEqual([]);
  });
});

describe('GitHub Enterprise Server host resolution', () => {
  it('defaults to github.com', () => {
    const h = resolveHost({} as NodeJS.ProcessEnv);
    expect(h).toEqual({ apiBaseUrl: 'https://api.github.com', host: 'github.com', isEnterprise: false });
    expect(octokitOptions(h)).toEqual({});
  });

  it('treats an explicit api.github.com as dotcom', () => {
    expect(resolveHost({ GITHUB_API_URL: 'https://api.github.com' } as NodeJS.ProcessEnv).isEnterprise).toBe(false);
  });

  it('uses GITHUB_API_URL when GitHub Actions sets it on GHES', () => {
    const h = resolveHost({ GITHUB_API_URL: 'https://github.example.com/api/v3' } as NodeJS.ProcessEnv);
    expect(h).toEqual({ apiBaseUrl: 'https://github.example.com/api/v3', host: 'github.example.com', isEnterprise: true });
    expect(octokitOptions(h)).toEqual({ baseUrl: 'https://github.example.com/api/v3' });
  });

  it('derives the /api/v3 base from a bare hostname', () => {
    const h = resolveHost({ GHES_HOSTNAME: 'github.example.com' } as NodeJS.ProcessEnv);
    expect(h.apiBaseUrl).toBe('https://github.example.com/api/v3');
    expect(h.isEnterprise).toBe(true);
  });

  it('tolerates a scheme and trailing slash in the hostname', () => {
    expect(resolveHost({ GHES_HOSTNAME: 'https://github.example.com/' } as NodeJS.ProcessEnv).host).toBe(
      'github.example.com',
    );
  });

  it('falls back to dotcom on an unparseable URL', () => {
    expect(resolveHost({ GITHUB_API_URL: ':::' } as NodeJS.ProcessEnv).isEnterprise).toBe(false);
  });

  it('builds a clone URL for the active host', () => {
    const ghes = resolveHost({ GHES_HOSTNAME: 'github.example.com' } as NodeJS.ProcessEnv);
    expect(cloneUrl('o', 'r', 'tok', ghes)).toBe('https://x-access-token:tok@github.example.com/o/r.git');
    expect(cloneUrl('o', 'r', 'tok', resolveHost({} as NodeJS.ProcessEnv))).toContain('@github.com/');
  });
});

const finding = (over: Partial<ReviewFinding> = {}): ReviewFinding => ({
  file: 'src/a.ts',
  startLine: 10,
  endLine: 12,
  lens: 'quality',
  severity: 'high',
  category: 'CWE-89',
  title: 'SQL injection',
  body: 'unscoped query',
  ...over,
});

describe('check run', () => {
  it('always uses a neutral conclusion so it can never block a merge', () => {
    const req = buildCheckRunRequest('o', 'r', 'sha', [finding({ severity: 'critical' })]);
    expect(req.conclusion).toBe('neutral');
    expect(req.status).toBe('completed');
  });

  it('counts blocking, nit and pre-existing separately', () => {
    expect(
      countSeverities([
        finding({ severity: 'critical' }),
        finding({ severity: 'high' }),
        finding({ severity: 'low' }),
        finding({ severity: 'high', preExisting: true }),
      ]),
    ).toEqual({ blocking: 2, nit: 1, pre_existing: 1 });
  });

  it('emits a machine-readable severity footer CI can parse', () => {
    const out = buildCheckRunOutput([finding({ severity: 'high' }), finding({ severity: 'low' })]);
    const json = out.text.split('forge-severity: ')[1]!.split(' -->')[0]!;
    expect(JSON.parse(json)).toEqual({ blocking: 1, nit: 1, pre_existing: 0 });
  });

  it('reports cleanly when there are no findings', () => {
    const out = buildCheckRunOutput([]);
    expect(out.title).toBe('No issues found');
    expect(out.annotations).toEqual([]);
    expect(out.text).toContain('forge-severity');
  });

  it('maps severity to annotation levels, with pre-existing as a notice', () => {
    const [a, b, c] = toAnnotations([
      finding({ severity: 'critical' }),
      finding({ severity: 'low' }),
      finding({ severity: 'critical', preExisting: true }),
    ]);
    expect(a!.annotation_level).toBe('failure');
    expect(b!.annotation_level).toBe('warning');
    expect(c!.annotation_level).toBe('notice');
  });

  it('never emits line 0 or an inverted range', () => {
    const [a] = toAnnotations([finding({ startLine: 0, endLine: 0 })]);
    expect(a!.start_line).toBe(1);
    expect(a!.end_line).toBe(1);
    const [b] = toAnnotations([finding({ startLine: 40, endLine: 10 })]);
    expect(b!.start_line).toBeLessThanOrEqual(b!.end_line);
  });

  it('caps annotations at the GitHub limit', () => {
    expect(toAnnotations(Array.from({ length: 80 }, () => finding()))).toHaveLength(50);
  });

  it('escapes pipes so a title cannot break the table', () => {
    const out = buildCheckRunOutput([finding({ title: 'a | b' })]);
    expect(out.text).toContain('a \\| b');
  });
});

describe('severity parity', () => {
  it('does not block a PR on a pre-existing bug', () => {
    expect(chooseEvent([finding({ severity: 'critical', preExisting: true })])).toBe('COMMENT');
    expect(chooseEvent([finding({ severity: 'critical' })])).toBe('REQUEST_CHANGES');
  });

  it('caps nits but keeps every important finding', () => {
    const findings = [
      ...Array.from({ length: 10 }, () => finding({ severity: 'low' })),
      finding({ severity: 'critical' }),
    ];
    const { kept, dropped } = capNits(findings, 3);
    expect(dropped).toBe(7);
    expect(kept.filter((f) => f.severity === 'low')).toHaveLength(3);
    expect(kept.filter((f) => f.severity === 'critical')).toHaveLength(1);
  });

  it('treats a negative cap as unlimited', () => {
    const findings = Array.from({ length: 10 }, () => finding({ severity: 'low' }));
    expect(capNits(findings, -1).dropped).toBe(0);
  });
});

describe('review commands', () => {
  it('parses once / always / bare', () => {
    expect(parseReviewCommand('review')).toEqual({ securityOnly: false, subscribe: false });
    expect(parseReviewCommand('review once')).toEqual({ securityOnly: false, subscribe: false });
    expect(parseReviewCommand('review always')).toEqual({ securityOnly: false, subscribe: true });
    expect(parseReviewCommand('/security')).toEqual({ securityOnly: true, subscribe: false });
    expect(parseReviewCommand('please review this')).toBeNull();
  });
});

const OPTS = {
  triggerLabel: 'agent-fix',
  mentionHandle: '@shipit-forge',
  autoFix: 'label' as const,
  autoReview: 'always' as const,
};

const repo = { repository: { owner: { login: 'o' }, name: 'r', default_branch: 'main' } };

describe('router: new triggers', () => {
  it('reviews an opened PR but skips drafts', () => {
    const open = routeEvent('pull_request', { ...repo, action: 'opened', pull_request: { number: 1, draft: false } }, OPTS);
    expect(open.kind).toBe('review');
    const draft = routeEvent('pull_request', { ...repo, action: 'opened', pull_request: { number: 1, draft: true } }, OPTS);
    expect(draft.kind).toBe('none');
  });

  it('honours review_behavior for pushes to a PR', () => {
    const payload = { ...repo, action: 'synchronize', pull_request: { number: 1 } };
    expect(routeEvent('pull_request', payload, { ...OPTS, reviewBehavior: 'every_push' }).kind).toBe('review');
    expect(routeEvent('pull_request', payload, { ...OPTS, reviewBehavior: 'opened' }).kind).toBe('none');
    expect(routeEvent('pull_request', payload, { ...OPTS, reviewBehavior: 'manual' }).kind).toBe('none');
  });

  it('applies filters before starting a review', () => {
    const payload = { ...repo, action: 'opened', pull_request: { number: 1, base: { ref: 'main' }, user: { login: 'bot' } } };
    expect(
      routeEvent('pull_request', payload, {
        ...OPTS,
        filters: [{ field: 'author', operator: 'is_not_one_of', value: ['bot'] }],
      }).kind,
    ).toBe('none');
    expect(
      routeEvent('pull_request', payload, {
        ...OPTS,
        filters: [{ field: 'base_branch', operator: 'equals', value: 'main' }],
      }).kind,
    ).toBe('review');
  });

  it('routes a merged PR to the change-history flow when enabled', () => {
    const payload = { ...repo, action: 'closed', pull_request: { number: 7, merged: true, title: 'Add cache' } };
    expect(routeEvent('pull_request', payload, OPTS).kind).toBe('none');
    const r = routeEvent('pull_request', payload, { ...OPTS, historyEnabled: true });
    expect(r).toMatchObject({ kind: 'history', pullNumber: 7, title: 'Add cache' });
  });

  it('routes a push to the default branch, ignoring merge commits', () => {
    const opts = { ...OPTS, historyEnabled: true };
    const merged = routeEvent(
      'push',
      { ...repo, ref: 'refs/heads/main', commits: [{ message: 'Merge pull request #3 from x' }] },
      opts,
    );
    expect(merged.kind).toBe('none');

    const real = routeEvent('push', { ...repo, ref: 'refs/heads/main', commits: [{ message: 'feat: add cache' }] }, opts);
    expect(real).toMatchObject({ kind: 'history', title: 'feat: add cache' });

    const sideBranch = routeEvent(
      'push',
      { ...repo, ref: 'refs/heads/feature', commits: [{ message: 'wip' }] },
      opts,
    );
    expect(sideBranch.kind).toBe('none');
  });

  it('routes release events', () => {
    const r = routeEvent('release', { ...repo, action: 'published', release: { tag_name: 'v1.2.0', id: 99 } }, OPTS);
    expect(r).toMatchObject({ kind: 'release', tag: 'v1.2.0', releaseId: 99 });
    expect(routeEvent('release', { ...repo, action: 'deleted', release: {} }, OPTS).kind).toBe('none');
  });

  it('routes /audit', () => {
    expect(
      routeEvent('issue_comment', { ...repo, action: 'created', issue: { number: 4 }, comment: { body: '/audit' } }, OPTS)
        .kind,
    ).toBe('audit');
  });

  it('carries the subscribe flag from "review always"', () => {
    const r = routeEvent(
      'issue_comment',
      { ...repo, action: 'created', issue: { number: 5, pull_request: {} }, comment: { body: '@shipit-forge review always' } },
      OPTS,
    );
    expect(r).toMatchObject({ kind: 'review', subscribe: true });
  });
});

describe('repo instruction files', () => {
  it('renders nothing when the repo has no conventions', () => {
    expect(renderProjectContextBlock({ projectContext: '', reviewInstructions: '', found: [] })).toBe('');
  });

  it('puts REVIEW.md last and labels it highest priority', () => {
    const prompt = composeReviewSystemPrompt('BASE', {
      projectContext: 'use tabs',
      reviewInstructions: 'only report security',
      found: ['FORGE.md', 'REVIEW.md'],
    });
    expect(prompt.indexOf('BASE')).toBeLessThan(prompt.indexOf('use tabs'));
    expect(prompt.indexOf('use tabs')).toBeLessThan(prompt.indexOf('only report security'));
    expect(prompt).toContain('HIGHEST PRIORITY');
  });

  it('marks convention violations as nit severity, not blocking', () => {
    const prompt = composeReviewSystemPrompt('BASE', {
      projectContext: 'use tabs',
      reviewInstructions: '',
      found: ['FORGE.md'],
    });
    expect(prompt).toContain('nit');
  });
});
