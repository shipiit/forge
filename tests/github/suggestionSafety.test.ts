import { describe, it, expect } from 'vitest';
import { suggestionFits, renderFindingBody } from '../../src/github/review.js';
import type { ReviewFinding } from '../../src/github/review.js';

/**
 * "Apply suggestion" is one click and it commits.
 *
 * Observed in production, on a Python file: a suggestion anchored across lines
 * 104–107 — two blank lines, a `def` signature, and the opening line of its
 * docstring — replacing all four with statements lifted from the function's
 * body. One click from a file with no signature, an unterminated docstring,
 * and a name that is not in scope. The button looked exactly as trustworthy as
 * a correct one.
 *
 * Pushing harder for suggestions made the model produce them where it should
 * not, so the guard has to be on this side.
 */

const finding = (suggestion: string): ReviewFinding =>
  ({
    file: 'registry.py',
    startLine: 104,
    endLine: 107,
    lens: 'quality',
    severity: 'medium',
    category: 'CWE-440',
    title: 'Cache key collision',
    body: 'the cache key can collide',
    suggestion,
  }) as ReviewFinding;

const THE_REAL_CASE = [
  '',
  '',
  'def filter_available(tools: list[Any]) -> tuple[list[Any], list[tuple[str, str]]]:',
  '    """Split tools into ``(available, skipped)``.',
];

describe('a suggestion that would break the file', () => {
  it('refuses to delete a function signature', () => {
    const s = ['    check = getattr(tool, "check_fn", None)', '    if callable(check):', '        check_id = id(check)'].join('\n');
    expect(suggestionFits(finding(s), undefined, THE_REAL_CASE)).toBe(false);
  });

  it('allows one that writes the signature back', () => {
    // Rewriting a function including its own `def` line is legitimate — as
    // long as the range it replaces does not leave half a docstring behind.
    const replaced = [
      'def filter_available(tools: list[Any]) -> tuple[list[Any], list[tuple[str, str]]]:',
      '    probe_key = f"fn:{name}"',
    ];
    const s = [
      'def filter_available(tools: list[Any]) -> tuple[list[Any], list[tuple[str, str]]]:',
      '    probe_key = f"fn:{name}_{id(check)}"',
    ].join('\n');
    expect(suggestionFits(finding(s), undefined, replaced)).toBe(true);
  });

  it('refuses even a tidy replacement that reopens a docstring it cannot close', () => {
    // THE_REAL_CASE ends on the opening line of a docstring, so any
    // replacement orphans the closing quotes further down the file.
    const s = [
      'def filter_available(tools: list[Any]) -> tuple[list[Any], list[tuple[str, str]]]:',
      '    """Split tools into two lists.',
      '    """',
    ].join('\n');
    expect(suggestionFits(finding(s), undefined, THE_REAL_CASE)).toBe(false);
  });

  it('refuses to cut a docstring in half', () => {
    const replaced = ['    """Split tools into two lists.', '    Returns available and skipped.'];
    expect(suggestionFits(finding('    x = 1'), undefined, replaced)).toBe(false);
  });

  it('refuses indented code in place of top-level code', () => {
    // A fragment anchored at the wrong depth.
    expect(suggestionFits(finding('        return None'), undefined, ['CONFIG = load()'])).toBe(false);
  });

  it('still allows an ordinary same-depth replacement', () => {
    expect(suggestionFits(finding('    probe_key = f"fn:{name}_{id(check)}"'), undefined, ['    probe_key = f"fn:{name}"'])).toBe(true);
  });

  it('does not block every suggestion when the diff text is unavailable', () => {
    expect(suggestionFits(finding('x = 1'), undefined, undefined)).toBe(true);
  });
});

describe('what the reader gets when it is refused', () => {
  it('keeps the code, without the commit button', () => {
    // Dropping it silently would lose the one thing the reviewer asked for.
    const body = renderFindingBody(finding('    check = getattr(tool, "check_fn", None)'), {
      withSuggestion: false,
    });
    expect(body).not.toContain('```suggestion');
    expect(body).toContain('check_fn');
    expect(body).toContain('check placement');
  });
});
