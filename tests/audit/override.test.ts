import { describe, it, expect } from 'vitest';
import { loadAuditSlices, parseSkillsSpec, parseSlicesMarkdown } from '../../src/audit/override.js';
import type { OctokitLike } from '../../src/github/pr.js';

const SHA = 'a'.repeat(40);

const SLICES_MD = `# Specialist slices

Intro text that is not a slice.

## 1. Authentication & identity

Enumerate every way a principal is authenticated.

## 2–4. Authorization by app group (endpoint matrices)

Split the routes and build a matrix.

## 7. LLM / agent surface

Inventory every tool.

## 10–11. Frontends (staff app, customer app)

Token storage and flags.

## 12. Scanner triage

Input: the summarised scanner outputs.

## 13. Empty heading
`;

describe('parseSkillsSpec', () => {
  it('accepts owner/repo at a full commit', () => {
    expect(parseSkillsSpec(`shipiit/pentest-skills@${SHA}`)).toEqual({ owner: 'shipiit', repo: 'pentest-skills', sha: SHA });
  });

  it.each([
    'shipiit/pentest-skills',
    'shipiit/pentest-skills@main',
    'shipiit/pentest-skills@v1.2.0',
    `shipiit/pentest-skills@${'a'.repeat(39)}`,
    `../etc@${SHA}`,
    `shipiit/..@${SHA}`,
    `a/b/c@${SHA}`,
    '',
  ])('refuses %j', (raw) => {
    expect(typeof parseSkillsSpec(raw)).toBe('string');
  });
});

describe('parseSlicesMarkdown', () => {
  it('makes one slice per section, classifies it, and drops scanner triage and empty sections', () => {
    const slices = parseSlicesMarkdown(SLICES_MD, 'CHECKLIST');
    expect(slices.map((s) => [s.title, s.rows, s.needs])).toEqual([
      ['Authentication & identity', [2, 3], 'always'],
      ['Authorization by app group (endpoint matrices)', [4, 12], 'always'],
      ['LLM / agent surface', [15], 'llm'],
      ['Frontends (staff app, customer app)', [14], 'frontend'],
    ]);
    expect(slices[0]!.prompt).toContain('CHECKLIST');
    expect(new Set(slices.map((s) => s.id)).size).toBe(slices.length);
  });

  it('returns nothing for a file with no sections', () => {
    expect(parseSlicesMarkdown('just text')).toEqual([]);
  });
});

describe('loadAuditSlices', () => {
  function octokit(files: Record<string, string>) {
    const asked: Array<Record<string, unknown>> = [];
    const o = {
      async request(_route: string, params: Record<string, unknown>) {
        asked.push(params);
        const body = files[String(params.path)];
        if (body === undefined) throw new Error('Not Found');
        return { data: body };
      },
    } as unknown as OctokitLike;
    return { o, asked };
  }

  it('reads the pentest-skills layout at the pinned commit', async () => {
    const { o, asked } = octokit({
      'deep-security-audit/references/slices.md': SLICES_MD,
      'deep-security-audit/references/checklists.md': 'Q?',
    });
    const slices = await loadAuditSlices(o, `shipiit/pentest-skills@${SHA}`, () => {});
    expect(slices).toHaveLength(4);
    expect(asked.every((p) => p.ref === SHA && p.owner === 'shipiit')).toBe(true);
  });

  it('falls back to the built-ins when the spec is bad or nothing is readable', async () => {
    const logs: string[] = [];
    expect(await loadAuditSlices(octokit({}).o, 'shipiit/pentest-skills@main', (m) => logs.push(m))).toBeUndefined();
    expect(await loadAuditSlices(octokit({}).o, `shipiit/pentest-skills@${SHA}`, (m) => logs.push(m))).toBeUndefined();
    expect(logs.join('\n')).toContain('full 40-character commit SHA');
    expect(logs.join('\n')).toContain('is the token allowed to read it');
  });

  it('decodes the base64 JSON shape too', async () => {
    const o = {
      async request(_r: string, p: Record<string, unknown>) {
        if (p.path !== 'audit/slices.md') throw new Error('404');
        return { data: { content: Buffer.from(SLICES_MD).toString('base64') } };
      },
    } as unknown as OctokitLike;
    expect(await loadAuditSlices(o, `o/r@${SHA}`, () => {})).toHaveLength(4);
  });
});
