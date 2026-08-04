import { describe, it, expect } from 'vitest';
import { reviewSystemPrompt } from '../../src/agent/prompts.js';
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

describe('the review prompt guards against reviewing its own fixes', () => {
  it('tells the reviewer that a problem the diff repairs is not a finding', () => {
    // A real run reported five "findings" that were each the PR's own fix,
    // and requested changes on an improvement.
    const p = reviewSystemPrompt();
    expect(p).toMatch(/still exist/i);
    expect(p).toMatch(/not a finding/i);
  });

  it('says a suggestion is committed verbatim, so it must be code', () => {
    // The same run emitted suggestion blocks containing prose — one click
    // would have replaced working code with an English sentence.
    const p = reviewSystemPrompt();
    expect(p).toMatch(/verbatim/i);
    expect(p).toMatch(/never prose/i);
  });
})

describe('the review prompt keeps severity and lens honest', () => {
  it('reserves the security lens for untrusted actors', () => {
    // A run labelled hardcoded max-turns as security/CWE-939 with an invented
    // "attacker crafts a PR" story, in a repo where opening a PR is trusted.
    const p = reviewSystemPrompt();
    expect(p).toMatch(/not already trusted/i);
    expect(p).toMatch(/never invent an attacker narrative/i);
  });

  it('requires a suggestion to be valid where it lands', () => {
    // The same run suggested a `with:` key anchored inside the `env:` block —
    // applying it would have produced invalid YAML.
    expect(reviewSystemPrompt()).toMatch(/same block, same indentation/i);
  });
});

describe('the how-to skill', () => {
  it('ships as a built-in, so /help works with nothing committed', () => {
    const skill = BUILT_IN_SKILLS.find((s) => s.name === 'how-to');
    expect(skill).toBeDefined();
    expect(skill!.tools).toContain('search');
    // It answers questions; it must not be able to change anything.
    expect(skill!.tools).not.toContain('write_file');
    expect(skill!.tools).not.toContain('run_bash');
  });

  it('tells the model not to instruct on anything it has not read', () => {
    // The failure mode for a how-to answer is a confident instruction to set a
    // config key that does not exist.
    const skill = BUILT_IN_SKILLS.find((s) => s.name === 'how-to')!;
    expect(skill.prompt).toMatch(/have not seen in this repository/i);
    expect(skill.prompt).toMatch(/it does not exist/i);
  });
});

describe('how-to must verify before it instructs', () => {
  const prompt = () => BUILT_IN_SKILLS.find((s) => s.name === 'how-to')!.prompt;

  it('requires having seen the thing, not assumed it', () => {
    // A real /help run invented `npm run serve-usage`, `FORGE_USAGE_URL` and a
    // POST /api/usage endpoint — none of which exist — after a single search.
    expect(prompt()).toMatch(/have not seen in this repository/i);
    expect(prompt()).toMatch(/package\.json/);
  });

  it('says an empty search means the feature is absent', () => {
    // The question that produced the bad answer was about a feature the repo
    // does not have. "Not supported yet" was the correct answer.
    expect(prompt()).toMatch(/it does not exist/i);
    // Wrapped prose: the words can fall either side of a line break.
    expect(prompt()).toMatch(/not\s+supported/i);
  });

  it('asks for the defining file, so the reader can check it', () => {
    expect(prompt()).toMatch(/so the reader can check you/i);
  });
});
