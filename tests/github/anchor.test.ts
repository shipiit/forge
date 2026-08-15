import { describe, it, expect } from 'vitest';
import { anchorLine, buildReviewPayload } from '../../src/github/review.js';
import type { ReviewFinding } from '../../src/github/review.js';

/**
 * Where a finding hangs.
 *
 * A model asked for a range often ends it on a blank line or a closing brace —
 * the end of the block it was describing rather than the code. GitHub anchors
 * the comment to the last line, so a reader opens a finding about arbitrary
 * code execution and sees an empty `+`. Observed in production: "Comment on
 * lines +114 to +115" over two blank additions.
 */

const finding = (over: Partial<ReviewFinding> = {}): ReviewFinding =>
  ({
    file: 'registry.py',
    startLine: 110,
    endLine: 115,
    lens: 'security',
    severity: 'high',
    category: 'CWE-94',
    title: 'Arbitrary code execution',
    body: 'plugin.py is executed from a user directory',
    ...over,
  }) as ReviewFinding;

describe('the line a comment hangs on', () => {
  it('walks back from a blank line to the code above it', () => {
    const text = new Map([
      [112, '    spec = importlib.util.spec_from_file_location(name, path)'],
      [113, '    if spec is None:'],
      [114, ''],
      [115, '   '],
    ]);
    expect(anchorLine(finding(), undefined, text)).toBe(113);
  });

  it('skips a lone closing brace, which is code but not the point', () => {
    const text = new Map([
      [113, '    exec(compile(src, path, "exec"), module.__dict__)'],
      [114, '    )'],
      [115, '}'],
    ]);
    expect(anchorLine(finding(), undefined, text)).toBe(113);
  });

  it('leaves a good anchor alone', () => {
    const text = new Map([[115, '    exec(src, module.__dict__)']]);
    expect(anchorLine(finding(), undefined, text)).toBe(115);
  });

  it('does not move a comment when the whole range is blank', () => {
    // Somewhere arbitrary is worse than where the model meant it.
    const text = new Map([
      [113, ''],
      [114, ''],
      [115, ''],
    ]);
    expect(anchorLine(finding(), undefined, text)).toBe(115);
  });

  it('never lands on a line outside the diff', () => {
    const text = new Map([
      [113, '    real_code()'],
      [114, ''],
      [115, ''],
    ]);
    // 113 carries code but is not commentable; the anchor must not pick it.
    expect(anchorLine(finding(), new Set([114, 115]), text)).toBe(115);
  });
});

describe('the comment that gets posted', () => {
  it('anchors on the code, not the blank line the range ended on', () => {
    const payload = buildReviewPayload([finding()], {
      validLines: new Map([['registry.py', new Set([110, 111, 112, 113, 114, 115])]]),
      lineText: new Map([
        [
          'registry.py',
          new Map([
            [113, '    exec(src, module.__dict__)'],
            [114, ''],
            [115, ''],
          ]),
        ],
      ]),
    });
    expect(payload.comments[0]!.line).toBe(113);
    // The range must still make sense once the end has moved.
    expect(payload.comments[0]!.start_line).toBe(110);
  });

  it('drops a start_line that would now sit after the anchor', () => {
    // GitHub rejects a multi-line comment whose start is past its end.
    const payload = buildReviewPayload([finding({ startLine: 114, endLine: 115 })], {
      validLines: new Map([['registry.py', new Set([114, 115])]]),
      lineText: new Map([['registry.py', new Map([[114, '    exec(src)'], [115, '']])]]),
    });
    expect(payload.comments[0]!.line).toBe(114);
    expect(payload.comments[0]!.start_line).toBeUndefined();
  });
});
