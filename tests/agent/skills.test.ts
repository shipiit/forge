import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  BUILT_IN_SKILLS,
  applySkill,
  loadRepoSkills,
  parseSkillFile,
  parseSkillInvocation,
  renderSkillList,
  resolveSkills,
} from '../../src/agent/skills.js';

const tmp = () => fs.mkdtemp(path.join(os.tmpdir(), 'forge-skills-'));

async function writeSkill(dir: string, name: string, body: string) {
  await fs.mkdir(path.join(dir, '.forge/skills'), { recursive: true });
  await fs.writeFile(path.join(dir, '.forge/skills', `${name}.md`), body);
}

describe('built-in skills', () => {
  it('ships the core set', () => {
    const names = BUILT_IN_SKILLS.map((s) => s.name);
    for (const expected of ['code-review', 'fix-issue', 'pr-description', 'commit-summary', 'document', 'security-audit', 'triage']) {
      expect(names).toContain(expected);
    }
  });

  it('gives every skill a description and a non-empty prompt', () => {
    for (const s of BUILT_IN_SKILLS) {
      expect(s.description.length).toBeGreaterThan(10);
      expect(s.prompt.trim().length).toBeGreaterThan(50);
    }
  });

  it('restricts read-only skills to read-only tools', () => {
    const review = BUILT_IN_SKILLS.find((s) => s.name === 'code-review')!;
    expect(review.tools).toBeDefined();
    expect(review.tools).not.toContain('write_file');
    expect(review.tools).not.toContain('run_bash');
  });

  it('leaves fix-issue unrestricted so it can actually edit', () => {
    expect(BUILT_IN_SKILLS.find((s) => s.name === 'fix-issue')!.tools).toBeUndefined();
  });

  it('scopes commit-summary to the given diff only', () => {
    const s = BUILT_IN_SKILLS.find((s) => s.name === 'commit-summary')!;
    expect(s.prompt).toMatch(/ONLY the change/);
  });
});

describe('skill files', () => {
  it('parses frontmatter and body', () => {
    const skill = parseSkillFile('x', `---\nname: my-review\ndescription: Our review\ntools: read_file, search\n---\nDo the thing.`);
    expect(skill).toMatchObject({
      name: 'my-review',
      description: 'Our review',
      tools: ['read_file', 'search'],
      prompt: 'Do the thing.',
    });
  });

  it('falls back to the filename when no name is given', () => {
    expect(parseSkillFile('from-file', 'Just a body.')!.name).toBe('from-file');
  });

  it('rejects an empty skill', () => {
    expect(parseSkillFile('x', '---\nname: y\n---\n   ')).toBeNull();
  });

  it('loads skills from the repo directory', async () => {
    const dir = await tmp();
    await writeSkill(dir, 'house-style', '---\ndescription: House style\n---\nUse tabs.');
    const skills = await loadRepoSkills(dir);
    expect(skills).toHaveLength(1);
    expect(skills[0]!.name).toBe('house-style');
  });

  it('returns [] when the repo has no skills directory', async () => {
    expect(await loadRepoSkills(await tmp())).toEqual([]);
  });

  it('ignores non-markdown files', async () => {
    const dir = await tmp();
    await fs.mkdir(path.join(dir, '.forge/skills'), { recursive: true });
    await fs.writeFile(path.join(dir, '.forge/skills/notes.txt'), 'nope');
    expect(await loadRepoSkills(dir)).toEqual([]);
  });

  it('lets a repo skill override a built-in of the same name', async () => {
    const dir = await tmp();
    await writeSkill(dir, 'code-review', '---\ndescription: Ours\n---\nOnly flag security.');
    const skills = await resolveSkills(dir);
    expect(skills.get('code-review')!.prompt).toBe('Only flag security.');
    expect(skills.get('code-review')!.builtIn).toBe(false);
    // The other built-ins survive.
    expect(skills.get('fix-issue')!.builtIn).toBe(true);
  });
});

describe('skill invocation', () => {
  it('parses /name with and without arguments', () => {
    expect(parseSkillInvocation('/code-review')).toEqual({ name: 'code-review', args: '' });
    expect(parseSkillInvocation('/code-review focus on the auth path')).toEqual({
      name: 'code-review',
      args: 'focus on the auth path',
    });
  });

  it('lowercases the name', () => {
    expect(parseSkillInvocation('/Code-Review')!.name).toBe('code-review');
  });

  it('returns null for ordinary prose', () => {
    expect(parseSkillInvocation('please review this')).toBeNull();
    expect(parseSkillInvocation('')).toBeNull();
  });

  it('appends the skill after the base prompt, with args last', () => {
    const out = applySkill('BASE', { name: 's', description: 'd', prompt: 'SKILL' }, 'ARGS');
    expect(out.indexOf('BASE')).toBeLessThan(out.indexOf('SKILL'));
    expect(out.indexOf('SKILL')).toBeLessThan(out.indexOf('ARGS'));
  });

  it('omits the request section when there are no args', () => {
    expect(applySkill('BASE', { name: 's', description: 'd', prompt: 'SKILL' })).not.toContain("This run's specific request");
  });

  it('renders a listing that marks repo skills', async () => {
    const dir = await tmp();
    await writeSkill(dir, 'ours', '---\ndescription: Ours\n---\nbody');
    const listing = renderSkillList(await resolveSkills(dir));
    expect(listing).toContain('`/code-review`');
    expect(listing).toContain('_(from this repo)_');
  });
});

describe('committed skills that report findings', () => {
  it('reads the reports field, so a repo skill can answer like the built-ins', () => {
    const skill = parseSkillFile(
      'deep-review',
      ['---', 'description: Deep review', 'reports: findings', 'tools: read_file search', '---', 'Body.'].join('\n'),
    );
    expect(skill?.reports).toBe('findings');
    expect(skill?.tools).toEqual(['read_file', 'search']);
  });

  it('leaves it unset for an ordinary skill, which answers in prose', () => {
    const skill = parseSkillFile('notes', ['---', 'description: Notes', '---', 'Body.'].join('\n'));
    expect(skill?.reports).toBeUndefined();
  });
});

describe('the skills a repository commits', () => {
  it('ships deep-review and issue-analysis, and both parse', async () => {
    // These are committed configuration, not local state — the Action loads
    // them from the checkout, so a broken front matter block means the
    // workflow silently reviews with the default prompt instead.
    for (const name of ['deep-review', 'issue-analysis']) {
      const text = await fs.readFile(`.forge/skills/${name}.md`, 'utf8');
      const skill = parseSkillFile(name, text);
      expect(skill, name).not.toBeNull();
      expect(skill!.name).toBe(name);
      expect(skill!.description.length).toBeGreaterThan(20);
      expect(skill!.tools).toContain('read_file');
      // Read-only: a review or a diagnosis must not be able to edit the repo.
      expect(skill!.tools).not.toContain('write_file');
      expect(skill!.tools).not.toContain('run_bash');
    }
  });

  it('marks deep-review as reporting findings, so they are counted and filed', async () => {
    const text = await fs.readFile('.forge/skills/deep-review.md', 'utf8');
    expect(parseSkillFile('deep-review', text)?.reports).toBe('findings');
  });
});
