import { describe, it, expect } from 'vitest';
import { isProviderId, modelReviewer, newFileDiff } from '../../src/evals/model.js';
import { loadCases, runSuite } from '../../src/evals/run.js';
import { sameCategory } from '../../src/evals/types.js';
import { parseDiffValidLines } from '../../src/github/review.js';
import { FakeLLMClient } from '../../src/providers/fake.js';
import type { ChatResult } from '../../src/providers/types.js';

const reply = (text: string): ChatResult => ({ text, toolCalls: [], usage: { inputTokens: 1, outputTokens: 1 }, stopReason: 'end' });

describe('the diff a case is reviewed as', () => {
  it('adds every line of every file, so every line is reviewable', () => {
    const diff = newFileDiff({ 'a.ts': 'one\ntwo\n', 'dir/b.py': 'x' });
    const valid = parseDiffValidLines(diff);
    expect([...valid.get('a.ts')!]).toEqual([1, 2]);
    expect([...valid.get('dir/b.py')!]).toEqual([1]);
  });

  it('is empty for a case with no files', () => {
    expect(newFileDiff({})).toBe('');
  });
});

describe('matching a model’s category to the corpus', () => {
  it.each([
    ['CWE-89', 'CWE-89 SQL Injection', true],
    ['CWE-89', 'cwe-89', true],
    ['CWE-89', 'CWE-890', false],
    ['logic', ' Logic ', true],
    ['logic', 'style', false],
  ])('%s vs %s → %s', (a, b, same) => expect(sameCategory(a, b)).toBe(same));
});

describe('provider names', () => {
  it.each([['anthropic', true], ['openai-compatible', true], ['claude', false], ['', false]])('%s → %s', (p, ok) =>
    expect(isProviderId(p)).toBe(ok),
  );
});

describe('the review corpus', () => {
  it('loads, and every case says what it expects or forbids, and why', async () => {
    const cases = await loadCases('evals/review-cases');
    expect(cases.length).toBeGreaterThanOrEqual(10);
    for (const c of cases) {
      const rules = [...(c.expect ?? []), ...(c.forbid ?? [])];
      expect(rules.length, c.name).toBeGreaterThan(0);
      for (const r of rules) expect(r.because, c.name).toBeTruthy();
      for (const e of c.expect ?? []) expect(Object.keys(c.files), c.name).toContain(e.file);
    }
  });

  it('scores a model that finds the bug and a verifier that drops the false alarm', async () => {
    const [sqli, safe] = (await loadCases('evals/review-cases')).filter((c) => c.name.includes('query'));
    const finding = (file: string) =>
      JSON.stringify([{ file, startLine: 4, endLine: 4, lens: 'security', severity: 'critical', category: 'CWE-89 SQL Injection', title: 'SQLi', body: 'x' }]);
    const client = new FakeLLMClient([
      reply(finding('src/users.ts')),
      reply('[{"id":0,"verdict":"confirmed"}]'),
      reply(finding('src/users.ts')),
      reply('[{"id":0,"verdict":"rejected","reason":"the value is bound as $1"}]'),
    ]);
    const card = await runSuite([sqli!, safe!], { scanners: [], review: modelReviewer({ client, depth: 'standard' }) });
    expect(card.cases.map((c) => c.passed)).toEqual([true, true]);
    expect(card.cases[1]!.regressions).toEqual([]);
  });

  it('fails a case when the verifier lets the false alarm through', async () => {
    const safe = (await loadCases('evals/review-cases')).find((c) => c.name === 'a parameterised query is not injection')!;
    const client = new FakeLLMClient([
      reply(JSON.stringify([{ file: 'src/users.ts', startLine: 4, endLine: 4, lens: 'security', severity: 'high', category: 'CWE-89', title: 't', body: 'b' }])),
      reply('[{"id":0,"verdict":"confirmed"}]'),
    ]);
    const card = await runSuite([safe], { scanners: [], review: modelReviewer({ client, depth: 'standard' }) });
    expect(card.cases[0]!.passed).toBe(false);
    expect(card.cases[0]!.regressions[0]!.category).toBe('CWE-89');
  });
});
