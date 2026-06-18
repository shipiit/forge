import { describe, it, expect } from 'vitest';
import {
  buildReviewPayload,
  chooseEvent,
  parseFindings,
  parseDiffValidLines,
  renderFindingBody,
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
    expect(chooseEvent([])).toBe('APPROVE');
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
