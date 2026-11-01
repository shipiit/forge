import type { ScriptLine } from '../player/ScriptPlayer';

/**
 * The built-in skills as the landing page shows them. Names and tool access
 * mirror src/agent/skills.ts — the test beside this file checks both.
 */

export const READ_ONLY = ['read_file', 'list_dir', 'glob', 'search', 'git_history', 'read_image'];
export const WRITE = ['write_file', 'edit_file', 'multi_edit', 'run_tests', 'run_bash'];

export interface SkillDemo {
  name: string;
  blurb: string;
  access: 'read-only' | 'read & write';
  invoke: string;
  run: ScriptLine[];
}

export const SKILL_DEMOS: SkillDemo[] = [
  {
    name: 'security-audit',
    blurb: 'Source-to-sink hunt, reported with CWE and severity.',
    access: 'read-only',
    invoke: '@shipit-forge /security-audit the upload API',
    run: [
      { kind: 'step', text: 'entry points: POST /upload, POST /avatar' },
      { kind: 'step', text: 'follow req.body.url → fetch() in src/avatar.ts:10' },
      { kind: 'note', text: 'high · CWE-918 · server-side request forgery' },
      { kind: 'result', text: 'findings returned in the review format: file, line, fix' },
    ],
  },
  {
    name: 'code-review',
    blurb: 'Correctness and security, scoped to the change.',
    access: 'read-only',
    invoke: '@shipit-forge /code-review',
    run: [
      { kind: 'step', text: 'read only the files the change touches, plus their callers' },
      { kind: 'step', text: 'drop anything without a concrete failing input' },
      { kind: 'result', text: '2 findings, each with the input that breaks it' },
    ],
  },
  {
    name: 'fix-issue',
    blurb: 'Investigate, fix, test, verify.',
    access: 'read & write',
    invoke: '@shipit-forge /fix-issue',
    run: [
      { kind: 'step', text: 'confirm the root cause before editing' },
      { kind: 'step', text: 'add a test that fails without the fix' },
      { kind: 'step', text: 'smallest change that fixes the cause · suite passes' },
      { kind: 'result', text: 'pull request opened' },
    ],
  },
  {
    name: 'triage',
    blurb: 'Diagnose, change nothing.',
    access: 'read-only',
    invoke: '@shipit-forge /triage',
    run: [
      { kind: 'step', text: 'point at the exact lines responsible' },
      { kind: 'result', text: 'root cause, the change to make, files it touches, what could break' },
    ],
  },
  {
    name: 'how-to',
    blurb: 'Answer “how do I…?” from the code.',
    access: 'read-only',
    invoke: '/help how do I add a provider?',
    run: [
      { kind: 'step', text: 'read the code that answers it, not the docs that might be stale' },
      { kind: 'result', text: 'numbered steps, real paths, how to check it worked' },
    ],
  },
  {
    name: 'pr-description',
    blurb: 'A reviewer-focused pull-request body.',
    access: 'read-only',
    invoke: '@shipit-forge /pr-description',
    run: [
      { kind: 'step', text: 'read the diff and the files around it' },
      { kind: 'result', text: 'why, what changed, how to test, what to look at first' },
    ],
  },
  {
    name: 'commit-summary',
    blurb: 'One commit, summarised for the change history.',
    access: 'read-only',
    invoke: '@shipit-forge /commit-summary 3f2a9c1',
    run: [{ kind: 'result', text: 'what changed, why, areas touched, risk' }],
  },
  {
    name: 'document',
    blurb: 'Write or update the docs for what changed.',
    access: 'read & write',
    invoke: '@shipit-forge /document src/cache',
    run: [
      { kind: 'step', text: 'compare the code with the docs that describe it' },
      { kind: 'result', text: 'docs updated in a pull request' },
    ],
  },
];
