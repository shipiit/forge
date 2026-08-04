import { describe, it, expect } from 'vitest';
import { costFooter } from '../../src/github/handlers.js';
import {
  buildReviewPayload,
  chooseEvent,
  parseFindings,
  parseDiffValidLines,
  renderFindingBody,
  renderAuditReport,
  type ReviewFinding,
} from '../../src/github/review.js';

const ssrf: ReviewFinding = {
  file: 'app/views.py',
  startLine: 68,
  endLine: 71,
  lens: 'security',
  severity: 'critical',
  category: 'CWE-918 SSRF',
  title: 'Full server-side request forgery',
  body: 'The full URL of this request depends on a user-provided value.',
  suggestion: 'resp = requests.post(validate_url(req.callback_url), ...)',
};

const nit: ReviewFinding = {
  file: 'app/util.py',
  startLine: 10,
  endLine: 10,
  lens: 'quality',
  severity: 'low',
  category: 'style',
  title: 'Unused import',
  body: 'Remove the unused import.',
};

describe('review payload', () => {
  it('renders a finding body with severity, lens, category and a suggestion block', () => {
    const body = renderFindingBody(ssrf);
    expect(body).toContain('Critical');
    expect(body).toContain('🛡️ Security');
    expect(body).toContain('CWE-918 SSRF');
    expect(body).toContain('```suggestion');
    expect(body).toContain('validate_url');
  });

  it('chooses REQUEST_CHANGES when a high/critical finding exists', () => {
    expect(chooseEvent([ssrf, nit])).toBe('REQUEST_CHANGES');
    expect(chooseEvent([nit])).toBe('COMMENT');
    expect(chooseEvent([])).toBe('COMMENT'); // never APPROVE
  });

  it('builds inline comments at the right lines with multi-line ranges', () => {
    const payload = buildReviewPayload([ssrf, nit], { displayName: 'ShipIT Forge' });
    expect(payload.event).toBe('REQUEST_CHANGES');
    expect(payload.comments).toHaveLength(2);
    const c0 = payload.comments[0];
    expect(c0).toMatchObject({ path: 'app/views.py', line: 71, start_line: 68 });
    // single-line finding omits start_line
    expect(payload.comments[1].start_line).toBeUndefined();
    expect(payload.body).toContain('1 security');
  });

  it('securityOnly filters out quality findings', () => {
    const payload = buildReviewPayload([ssrf, nit], { securityOnly: true });
    expect(payload.comments).toHaveLength(1);
    expect(payload.comments[0].path).toBe('app/views.py');
  });

  it('routes findings outside the diff into the summary instead of inline comments', () => {
    // Only line 71 is valid in the diff for app/views.py; nit at util.py:10 is not in the diff.
    const validLines = new Map([['app/views.py', new Set([68, 69, 70, 71])]]);
    const payload = buildReviewPayload([ssrf, nit], { validLines });
    expect(payload.comments).toHaveLength(1); // only the ssrf finding is inline-able
    expect(payload.comments[0].path).toBe('app/views.py');
    expect(payload.body).toContain('Additional findings (outside the diff)');
    expect(payload.body).toContain('app/util.py:10');
  });
});

describe('renderAuditReport', () => {
  it('groups findings by severity, highest first, with suggestions', () => {
    const report = renderAuditReport([nit, ssrf], 'ShipIT Forge');
    expect(report).toContain('security audit');
    expect(report).toContain('Found **2**');
    // critical (ssrf) should appear before low (nit)
    expect(report.indexOf('Full server-side request forgery')).toBeLessThan(report.indexOf('Unused import'));
    expect(report).toContain('```suggestion');
  });

  it('reports a clean repo', () => {
    expect(renderAuditReport([], 'ShipIT Forge')).toContain('No vulnerabilities found');
  });
});

describe('parseDiffValidLines', () => {
  const diff = [
    'diff --git a/app/views.py b/app/views.py',
    '--- a/app/views.py',
    '+++ b/app/views.py',
    '@@ -10,3 +10,4 @@ def handler():',
    ' context_line',
    '+added_line_11',
    '+added_line_12',
    ' context_line_13',
  ].join('\n');

  it('marks added and context lines on the new side as commentable', () => {
    const map = parseDiffValidLines(diff);
    const lines = map.get('app/views.py')!;
    expect(lines.has(10)).toBe(true); // context
    expect(lines.has(11)).toBe(true); // added
    expect(lines.has(12)).toBe(true); // added
    expect(lines.has(13)).toBe(true); // context
    expect(lines.has(99)).toBe(false);
  });

  it('does not count removed lines and ignores /dev/null', () => {
    const d = ['--- a/x', '+++ /dev/null', '@@ -1,2 +0,0 @@', '-gone', '-gone2'].join('\n');
    const map = parseDiffValidLines(d);
    expect(map.size).toBe(0);
  });
});

describe('parseFindings', () => {
  it('parses a fenced json array', () => {
    const text = 'Here are the findings:\n```json\n[{"file":"a.py","startLine":1,"endLine":1,"lens":"security","severity":"high","category":"x","title":"t","body":"b"}]\n```';
    const findings = parseFindings(text);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ file: 'a.py', severity: 'high' });
  });

  it('parses a bare json array', () => {
    const text = '[{"file":"a","startLine":2,"endLine":2,"lens":"quality","severity":"low","category":"c","title":"t","body":"b"}]';
    expect(parseFindings(text)).toHaveLength(1);
  });

  it('returns [] for malformed or empty output', () => {
    expect(parseFindings('no findings here')).toEqual([]);
    expect(parseFindings('```json\n{bad json}\n```')).toEqual([]);
  });

  it('drops entries missing required fields', () => {
    const text = '[{"file":"a","severity":"nope"},{"file":"b","startLine":1,"endLine":1,"lens":"security","severity":"medium","category":"c","title":"t","body":"x"}]';
    expect(parseFindings(text)).toHaveLength(1);
  });
});

describe('the cost footer', () => {
  it('is omitted when the run says not to show it', () => {
    expect(costFooter({ inputTokens: 100, outputTokens: 20 }, 'gemini-2.5-flash', false)).toBe('');
  });

  it('is omitted when nothing says otherwise', () => {
    // Off by default: what a run cost is business information, and it was
    // being printed under every comment on every public repository.
    expect(costFooter({ inputTokens: 100, outputTokens: 20 }, 'gemini-2.5-flash')).toBe('');
  });

  it('prints when it is explicitly asked for', () => {
    expect(costFooter({ inputTokens: 100, outputTokens: 20 }, 'gemini-2.5-flash', true)).toContain('🧮');
  });
});

describe('the shape of an inline comment', () => {
  const finding = (over: Record<string, unknown> = {}) =>
    ({
      file: 'a.ts',
      startLine: 3,
      endLine: 3,
      lens: 'security',
      severity: 'critical',
      category: 'CWE-78',
      title: 'Command injection via a tag name',
      body: 'A tag name reaches a shell unescaped. Anyone who can push a tag can run code on the runner, with the token in the environment.',
      ...over,
    }) as never;

  it('leads with the title and the severity, on one line', () => {
    // What someone scanning a diff has room for. The old shape opened with
    // badges and buried the title under them.
    const first = renderFindingBody(finding()).split('\n')[0]!;
    expect(first).toContain('**Command injection via a tag name**');
    expect(first).toContain('Critical');
  });

  it('shows one sentence, and folds the rest away', () => {
    const body = renderFindingBody(finding());
    expect(body).toContain('A tag name reaches a shell unescaped.');
    expect(body).toContain('<details><summary>Why this matters</summary>');
    // Six of these on one screen should still leave the code visible.
    expect(body.indexOf('Anyone who can push a tag')).toBeGreaterThan(body.indexOf('<details>'));
  });

  it('leaves a one-sentence finding uncollapsed', () => {
    const body = renderFindingBody(finding({ body: 'Short and complete.' }));
    expect(body).toContain('Short and complete.');
    expect(body).not.toContain('<details>');
  });

  it('keeps the suggestion outside the fold, where GitHub can offer it', () => {
    // Inside <details>, "Commit suggestion" is not rendered until expanded.
    const body = renderFindingBody(finding({ suggestion: 'const x = 1;' }));
    expect(body).toContain('```suggestion\nconst x = 1;\n```');
    const details = body.lastIndexOf('</details>');
    expect(body.indexOf('```suggestion')).toBeGreaterThan(details);
  });

  it('still carries the fingerprint, so a re-review can find it', () => {
    expect(renderFindingBody(finding())).toMatch(/<!-- forge-f: [0-9a-f]+ -->/);
  });
});

describe('telling people how to dismiss it', () => {
  const f = {
    file: 'a.ts',
    startLine: 3,
    endLine: 3,
    lens: 'security',
    severity: 'high',
    category: 'CWE-798',
    title: 'Key committed',
    body: 'A key is in the source.',
  } as never;

  it('offers both routes, because neither was discoverable', () => {
    // Resolving already dismissed a finding and nobody was told; the code
    // marker dismisses it everywhere. A comment with no way to disagree with
    // it leaves people arguing in a reply.
    const body = renderFindingBody(f);
    expect(body).toContain('Resolve this conversation to dismiss it');
    expect(body).toContain('forge-ignore: security');
  });

  it('keeps it quiet, and after the substance', () => {
    const body = renderFindingBody(f);
    expect(body).toContain('<sub>');
    // It must come after the substance, not before it.
    expect(body.indexOf('Resolve this conversation')).toBeGreaterThan(body.indexOf('A key is in the source.'));
  });
});

describe('findings on lines the pull request did not touch', () => {
  const f = (file: string, line: number) => ({
    file,
    startLine: line,
    endLine: line,
    lens: 'security' as const,
    severity: 'medium' as const,
    category: 'CWE-494',
    title: 'Action pinned to a mutable ref',
    body: 'A tag can be moved. Whoever controls it controls what runs with your token.\n\nPin the action to the commit SHA instead, so what ran yesterday is what runs today.',
  });

  it('gives them the body an inline comment would have had', () => {
    // GitHub refuses an inline comment outside the diff, so the summary is the
    // only place these can live — and one line naming a file is the one form
    // of finding nobody can act on.
    const payload = buildReviewPayload([f('.github/workflows/ci.yml', 17)], {
      validLines: new Map([['src/other.ts', new Set([1])]]),
      repoUrl: 'https://github.com/o/r',
      ref: 'main',
    });
    expect(payload.comments).toHaveLength(0);
    expect(payload.body).toContain('Additional findings (outside the diff)');
    expect(payload.body).toContain('Whoever controls it controls what runs');
    expect(payload.body).toContain('Pin the action to the commit SHA');
    // HTML, not markdown: GitHub does not parse markdown inside a <summary>,
    // so the badge and the link have to be tags or they render as source.
    expect(payload.body).toContain('<a href="https://github.com/o/r/blob/main/.github/workflows/ci.yml#L17">');
    expect(payload.body).toContain('🟡 <strong>Medium</strong>');
    expect(payload.body).not.toMatch(/<summary>[^<]*\*\*/);
  });

  it('collapses each one so ten do not bury what is in the diff', () => {
    const payload = buildReviewPayload([f('a.yml', 1), f('b.yml', 2)], {
      validLines: new Map(),
    });
    // Each finding also nests a "Why this matters" block, so count the outer
    // summaries — the ones carrying a file:line.
    expect(payload.body.match(/<summary>.*?Action pinned/g) ?? []).toHaveLength(2);
  });
});

describe('a title cannot break out of the summary tag', () => {
  it('escapes markup a model put in a finding title', () => {
    const payload = buildReviewPayload(
      [
        {
          file: 'a.ts',
          startLine: 1,
          endLine: 1,
          lens: 'security',
          severity: 'high',
          category: 'CWE-79',
          title: '</summary><img src=x onerror=alert(1)>',
          body: 'b',
        } as never,
      ],
      { validLines: new Map() },
    );
    // The summary is raw HTML we build, so a title that closes the tag would
    // break the block open. Inside the details body it stays markdown, which
    // GitHub sanitises on render.
    const summary = payload.body.match(/<summary>.*?<\/summary>/)![0];
    expect(summary).toContain('&lt;/summary&gt;&lt;img');
    expect(summary.match(/<\/summary>/g)).toHaveLength(1);
  });
});

describe('a suggestion that would replace the wrong line', () => {
  const finding = (suggestion: string) => ({
    file: 'examples/forge.yml',
    startLine: 30,
    endLine: 30,
    lens: 'security' as const,
    severity: 'medium' as const,
    category: 'CWE-494',
    title: 'Action pinned to a mutable ref',
    body: 'A tag can be moved.',
    suggestion,
  });

  const onComment = new Map([['examples/forge.yml', new Map([[30, '  # write on the repository.']])]]);

  it('is not offered as a commit when it would turn a comment into code', () => {
    // This shipped: a suggestion anchored on a comment line, offering to
    // replace the explanation with `- uses: actions/checkout@<sha>`. GitHub
    // puts a "Commit suggestion" button under that.
    const payload = buildReviewPayload([finding('      - uses: actions/checkout@abc123')], {
      validLines: new Map([['examples/forge.yml', new Set([30])]]),
      lineText: onComment,
    });
    expect(payload.comments[0]!.body).not.toContain('```suggestion');
    // The finding itself survives — it is the fix that was in the wrong place.
    expect(payload.comments[0]!.body).toContain('Action pinned to a mutable ref');
  });

  it('is still offered when a comment is being rewritten as a comment', () => {
    const payload = buildReviewPayload([finding('  # write on the repo.')], {
      validLines: new Map([['examples/forge.yml', new Set([30])]]),
      lineText: onComment,
    });
    expect(payload.comments[0]!.body).toContain('```suggestion');
  });

  it('is offered normally on an ordinary line', () => {
    const payload = buildReviewPayload([finding('      - uses: actions/checkout@abc123')], {
      validLines: new Map([['examples/forge.yml', new Set([30])]]),
      lineText: new Map([['examples/forge.yml', new Map([[30, '      - uses: actions/checkout@v4']])]]),
    });
    expect(payload.comments[0]!.body).toContain('```suggestion');
  });

  it('is never offered outside the diff, where there is no button to press', () => {
    const payload = buildReviewPayload([finding('      - uses: actions/checkout@abc123')], {
      validLines: new Map(),
    });
    expect(payload.body).not.toContain('```suggestion');
  });
});
