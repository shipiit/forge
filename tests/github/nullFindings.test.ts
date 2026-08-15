import { describe, it, expect } from 'vitest';
import { parseFindings, buildReviewPayload, suggestionFits } from '../../src/github/review.js';

/**
 * The model writes this JSON, so it decides the shape.
 *
 * Told that suggestions matter, it starts emitting `"suggestion": null` on the
 * findings that do not have one — an explicit null rather than an absent key.
 * That passes a `!== undefined` guard, reaches `.split`, and takes down a
 * review the model has already been paid for. Fifteen files seeded, one turn,
 * 57k tokens spent, and nothing posted.
 */

const one = (extra: string) =>
  `[{"file":"registry.py","startLine":110,"endLine":115,"severity":"high","title":"Arbitrary code execution"${extra}}]`;

describe('a finding whose optional fields are null', () => {
  it('survives a null suggestion', () => {
    const [f] = parseFindings(one(',"suggestion":null'));
    expect(f).toBeDefined();
    expect(f!.suggestion).toBeUndefined();
    expect(() => suggestionFits(f!, 'code()')).not.toThrow();
    expect(suggestionFits(f!, 'code()')).toBe(false);
  });

  it('survives a null body, category and lens', () => {
    const [f] = parseFindings(one(',"body":null,"category":null,"lens":null'));
    expect(f!.body).toBe('');
    expect(f!.category).toBe('');
    expect(f!.lens).toBe('quality');
  });

  it('builds a review payload from it without throwing', () => {
    // The end-to-end shape of the crash: parse, then render.
    const findings = parseFindings(one(',"suggestion":null,"body":null'));
    expect(() =>
      buildReviewPayload(findings, {
        validLines: new Map([['registry.py', new Set([110, 115])]]),
        lineText: new Map([['registry.py', new Map([[115, '    exec(src)']])]]),
      }),
    ).not.toThrow();
  });

  it('treats an empty-string suggestion as no suggestion', () => {
    // A suggestion block containing nothing offers to delete the line.
    const [f] = parseFindings(one(',"suggestion":""'));
    expect(f!.suggestion).toBeUndefined();
  });

  it('repairs a start line that sits after the end', () => {
    // GitHub rejects the comment outright, so the finding is lost rather than
    // misplaced — the worst of both.
    const [f] = parseFindings(
      '[{"file":"a.py","startLine":200,"endLine":115,"severity":"low","title":"t"}]',
    );
    expect(f!.startLine).toBe(115);
  });
});
