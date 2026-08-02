import { describe, it, expect } from 'vitest';
import {
  findRoutine,
  matchesEvent,
  parseRoutines,
  parseRunCommand,
  renderScheduleWorkflow,
  routinesForEvent,
  scheduledRoutines,
} from '../src/routines.js';
import { mergeConfig, defaultConfig } from '../src/config.js';
import { routeEvent } from '../src/github/router.js';

const RAW = [
  {
    name: 'nightly-digest',
    description: 'Summarize merged work',
    skill: '/commit-summary',
    prompt: 'Summarize what merged yesterday.',
    schedule: '0 9 * * *',
    events: ['pull_request.closed'],
    tools: 'read_file search',
    filters: [{ field: 'base_branch', operator: 'equals', value: 'main' }],
  },
  { name: 'docs-drift', schedule: '0 3 * * 1', write: true },
];

describe('routine parsing', () => {
  it('parses a full routine', () => {
    const [r] = parseRoutines(RAW);
    expect(r).toMatchObject({
      name: 'nightly-digest',
      skill: 'commit-summary', // leading slash stripped, lowercased
      schedule: '0 9 * * *',
      events: ['pull_request.closed'],
      tools: ['read_file', 'search'],
      manual: true, // on-demand by default
      write: false, // read-only by default
    });
    expect(r!.filters).toHaveLength(1);
  });

  it('defaults write to false so a routine cannot silently change code', () => {
    expect(parseRoutines([{ name: 'a', schedule: '@daily' }])[0]!.write).toBe(false);
    expect(parseRoutines([{ name: 'a', schedule: '@daily', write: true }])[0]!.write).toBe(true);
  });

  it('drops entries with no name or an unusable name', () => {
    expect(parseRoutines([{ schedule: '@daily' }, { name: 'bad name!', schedule: '@daily' }])).toEqual([]);
  });

  it('drops duplicates, keeping the first', () => {
    const out = parseRoutines([
      { name: 'dup', schedule: 'a', prompt: 'first' },
      { name: 'dup', schedule: 'b', prompt: 'second' },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.prompt).toBe('first');
  });

  it('drops a routine that could never start', () => {
    expect(parseRoutines([{ name: 'orphan', manual: false }])).toEqual([]);
  });

  it('returns [] for anything that is not a list', () => {
    expect(parseRoutines(undefined)).toEqual([]);
    expect(parseRoutines('nope')).toEqual([]);
  });

  it('reaches ForgeConfig through agent.yml', () => {
    const cfg = mergeConfig({ routines: RAW }, defaultConfig({} as NodeJS.ProcessEnv));
    expect(cfg.routines).toHaveLength(2);
    expect(cfg.routines[0]!.name).toBe('nightly-digest');
  });
});

describe('routine triggers', () => {
  const routines = parseRoutines(RAW);

  it('matches both the bare and the qualified event name', () => {
    const r = routines[0]!;
    expect(matchesEvent(r, 'pull_request', 'closed')).toBe(true);
    expect(matchesEvent(r, 'pull_request', 'opened')).toBe(false);
    expect(matchesEvent({ ...r, events: ['pull_request'] }, 'pull_request', 'opened')).toBe(true);
  });

  it('never matches when the routine lists no events', () => {
    expect(matchesEvent({ ...routines[1]!, events: [] }, 'push', undefined)).toBe(false);
  });

  it('applies filters on top of the event match', () => {
    expect(routinesForEvent(routines, 'pull_request', 'closed', { baseBranch: 'main' })).toHaveLength(1);
    expect(routinesForEvent(routines, 'pull_request', 'closed', { baseBranch: 'develop' })).toHaveLength(0);
  });

  it('finds a routine by name, tolerating a leading slash', () => {
    expect(findRoutine(routines, '/nightly-digest')?.name).toBe('nightly-digest');
    expect(findRoutine(routines, 'NIGHTLY-DIGEST')?.name).toBe('nightly-digest');
    expect(findRoutine(routines, 'missing')).toBeUndefined();
  });

  it('lists the scheduled ones', () => {
    expect(scheduledRoutines(routines).map((r) => r.name)).toEqual(['nightly-digest', 'docs-drift']);
  });
});

describe('/run command', () => {
  it('parses a name and an optional extra request', () => {
    expect(parseRunCommand('/run nightly-digest')).toEqual({ name: 'nightly-digest', args: '' });
    expect(parseRunCommand('/run docs-drift only the API docs')).toEqual({
      name: 'docs-drift',
      args: 'only the API docs',
    });
  });

  it('ignores prose and a bare /run', () => {
    expect(parseRunCommand('run the thing')).toBeNull();
    expect(parseRunCommand('/run')).toBeNull();
  });

  it('routes to a routine from a comment', () => {
    const r = routeEvent(
      'issue_comment',
      {
        repository: { owner: { login: 'o' }, name: 'r', default_branch: 'main' },
        action: 'created',
        issue: { number: 5 },
        comment: { body: '/run nightly-digest please' },
      },
      { triggerLabel: 'agent-fix', mentionHandle: '@f', autoFix: 'label', autoReview: 'off' },
    );
    expect(r).toMatchObject({ kind: 'routine', routine: 'nightly-digest', args: 'please', issueNumber: 5 });
  });
});

describe('generated schedule workflow', () => {
  const yml = renderScheduleWorkflow(parseRoutines(RAW));

  it('emits one cron per distinct schedule', () => {
    expect(yml).toContain("- cron: '0 9 * * *'");
    expect(yml).toContain("- cron: '0 3 * * 1'");
  });

  it('supports manual dispatch as well as the schedule', () => {
    expect(yml).toContain('workflow_dispatch');
  });

  it('grants only the permissions the routines need', () => {
    expect(yml).toContain('contents: write');
    expect(yml).toContain('pull-requests: write');
  });

  it('is empty when nothing is scheduled', () => {
    expect(renderScheduleWorkflow(parseRoutines([{ name: 'manual-only', manual: true }]))).toBe('');
  });
});
