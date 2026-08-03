import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * Skills — named, reusable prompt packs.
 *
 * A skill bundles an instruction block with an optional tool allowlist, so a
 * team can say `/code-review` (in a comment, or as an Action `prompt:`) and get
 * exactly the behaviour they defined, every time.
 *
 * Forge ships sensible built-ins; a repository overrides or extends them by
 * committing `.forge/skills/<name>.md`. A repo skill with the same name as a
 * built-in wins — the repo always has the last word about its own standards.
 */

export interface Skill {
  name: string;
  description: string;
  /** Instruction block appended to the system prompt. */
  prompt: string;
  /** Optional tool allowlist. Fewer tools = fewer tokens and better tool choice. */
  tools?: string[];
  /** True for skills that ship with forge rather than the repository. */
  builtIn?: boolean;
  /**
   * `findings` means this skill answers with structured findings rather than
   * prose, so callers can parse, count, file and chart what it reported instead
   * of storing a paragraph.
   */
  reports?: 'findings';
}

const READ_ONLY_TOOLS = ['read_file', 'list_dir', 'glob', 'search', 'git_history', 'read_image'];

export const BUILT_IN_SKILLS: Skill[] = [
  {
    name: 'code-review',
    description: 'Review a change for correctness bugs, regressions, and security issues.',
    builtIn: true,
    reports: 'findings',
    tools: READ_ONLY_TOOLS,
    prompt: `Review ONLY the code this change touches. Read surrounding code freely to judge whether an
issue is real, but do not report problems in files the change did not modify.

Prioritise, in order: correctness bugs that would break production, security vulnerabilities with a
concrete exploit path, missing error handling on a path that can actually fail, and absent tests for
newly added behaviour. Do not report formatting, naming, or stylistic preference.

For every finding, state the concrete failure: the input or state that triggers it and the resulting
wrong behaviour. If you cannot describe that, the finding is speculation — drop it.`,
  },
  {
    name: 'fix-issue',
    description: 'Investigate an issue, implement the fix, add tests, and verify.',
    builtIn: true,
    prompt: `Work the issue end to end. Reproduce or confirm the root cause by reading the code before
changing anything, then make the smallest change that actually fixes the cause rather than the symptom.

Add or update tests that fail without your change and pass with it. Run the suite and make it pass.
Do not weaken or delete an existing test to make things green — if a test now fails, either the test
encodes a real requirement you broke, or the requirement changed and you should say so explicitly.`,
  },
  {
    name: 'pr-description',
    description: 'Write a reviewer-focused pull request description from a diff.',
    builtIn: true,
    tools: READ_ONLY_TOOLS,
    prompt: `Write a PR description for the change under review, aimed at the person who has to approve it.

Structure: what changed and why (two or three sentences), then the specific things a reviewer should
look at closely, then how it was verified. Name the risk if there is one. Do not narrate the diff
file by file — the reviewer can read the diff; they cannot read your reasoning.`,
  },
  {
    name: 'commit-summary',
    description: 'Summarize a single commit or push for a change-history document.',
    builtIn: true,
    tools: READ_ONLY_TOOLS,
    prompt: `Summarize ONLY the change in the diff you were given. Do not describe the repository, its
architecture, or code the diff does not touch.

Say what behaviour changed and why it changed. Call out anything a consumer of this code would notice:
changed defaults, new required configuration, altered error handling, performance characteristics.
If the change is purely internal with no observable effect, say that plainly in one line.`,
  },
  {
    name: 'document',
    description: 'Write or update documentation for code that changed.',
    builtIn: true,
    prompt: `Document the behaviour as it actually is, verified by reading the code — never as you assume
it to be. Follow the documentation conventions already present in the repository.

Prefer updating an existing document over creating a new one. Cover what it does, how to use it, and
the failure modes a user will actually hit. Skip anything the signature already makes obvious.`,
  },
  {
    name: 'security-audit',
    description: 'Hunt for exploitable vulnerabilities and report them with CWE and severity.',
    builtIn: true,
    reports: 'findings',
    tools: READ_ONLY_TOOLS,
    prompt: `Trace untrusted input from every entry point to every dangerous sink: HTTP handlers, CLI
arguments, webhooks, queue consumers, and file uploads.

Report a finding only when you can name the source, the sink, and the path between them. Assign a CWE
and a severity, and describe the exploit concretely. An unvalidated guess costs the team a round trip
and erodes trust in every other finding — when uncertain, lower the severity and say why.`,
  },
  {
    name: 'triage',
    description: 'Diagnose an issue without changing any code.',
    builtIn: true,
    tools: READ_ONLY_TOOLS,
    prompt: `Diagnose, do not fix. Read the code until you can point at the exact lines responsible, then
report: the root cause with file and line references, the change you would make, the files it would
touch, and what could break. Be specific enough that someone else could implement it from your notes.`,
  },
];

/** Frontmatter + body. Deliberately a tiny parser — no YAML dependency. */
export function parseSkillFile(name: string, text: string): Skill | null {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  const meta: Record<string, string> = {};
  let body = text;

  if (match) {
    body = match[2] ?? '';
    for (const line of (match[1] ?? '').split(/\r?\n/)) {
      const kv = line.match(/^([A-Za-z_-]+)\s*:\s*(.*)$/);
      if (kv) meta[kv[1]!.toLowerCase()] = kv[2]!.trim();
    }
  }

  const prompt = body.trim();
  if (!prompt) return null;
  return {
    name: (meta.name || name).trim().toLowerCase(),
    description: meta.description || `Skill: ${name}`,
    prompt,
    ...(meta.tools ? { tools: meta.tools.split(/[,\s]+/).filter(Boolean) } : {}),
    // A committed skill can declare that it answers with structured findings,
    // the same way the built-ins do — otherwise a repository's own review skill
    // returns prose that nothing downstream can count, file or chart.
    ...(meta.reports === 'findings' ? { reports: 'findings' as const } : {}),
  };
}

export const SKILL_DIRS = ['.forge/skills', '.github/forge/skills'];

/** Load repository-committed skills. Never throws; returns [] when none exist. */
export async function loadRepoSkills(cwd: string, extraDir?: string): Promise<Skill[]> {
  const out: Skill[] = [];
  for (const dir of [...SKILL_DIRS, ...(extraDir ? [extraDir] : [])]) {
    let entries: string[];
    try {
      entries = await fs.readdir(path.join(cwd, dir));
    } catch {
      continue;
    }
    for (const file of entries) {
      if (!file.endsWith('.md')) continue;
      try {
        const text = await fs.readFile(path.join(cwd, dir, file), 'utf8');
        const skill = parseSkillFile(file.replace(/\.md$/, ''), text);
        if (skill) out.push(skill);
      } catch {
        /* skip an unreadable skill rather than failing the run */
      }
    }
  }
  return out;
}

/**
 * Built-ins overlaid with repository skills, keyed by name. A repo skill with a
 * built-in's name replaces it entirely.
 */
export async function resolveSkills(
  cwd: string,
  opts: { extraDir?: string; inline?: Skill } = {},
): Promise<Map<string, Skill>> {
  const map = new Map<string, Skill>();
  for (const s of BUILT_IN_SKILLS) map.set(s.name, s);
  for (const s of await loadRepoSkills(cwd, opts.extraDir)) map.set(s.name, { ...s, builtIn: false });
  // A skill defined in the workflow file wins over everything: it is the most
  // specific statement of intent for this particular run.
  if (opts.inline) map.set(opts.inline.name, { ...opts.inline, builtIn: false });
  return map;
}

/** Detect a `/skill-name rest of the request` invocation. */
export function parseSkillInvocation(body: string): { name: string; args: string } | null {
  const m = (body ?? '').trim().match(/^\/([a-z0-9][a-z0-9_-]*)\b[ \t]*([\s\S]*)$/i);
  if (!m) return null;
  return { name: m[1]!.toLowerCase(), args: (m[2] ?? '').trim() };
}

/** Append a skill's instructions (and the caller's extra request) to a prompt. */
export function applySkill(base: string, skill: Skill, args = ''): string {
  let out = `${base}\n\n# Skill: ${skill.name}\n\n${skill.prompt}`;
  if (args) out += `\n\n## This run's specific request\n\n${args}`;
  return out;
}

/** One-line-per-skill listing, for a help comment. */
export function renderSkillList(skills: Map<string, Skill>): string {
  return [...skills.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((s) => `- \`/${s.name}\` — ${s.description}${s.builtIn ? '' : ' _(from this repo)_'}`)
    .join('\n');
}
