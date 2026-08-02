import { matchesAllFilters, parseFilters, type FilterSubject, type TriggerFilter } from './github/filters.js';

/**
 * Routines — a saved agent configuration plus the triggers that start it.
 *
 * One routine can carry several triggers at once, exactly like Claude Code's:
 * a nightly schedule, an on-demand `/run` command, and a reaction to repository
 * events. The routine itself is just "which skill, with what extra instructions,
 * using which tools" — the triggers decide when.
 *
 * Defined in `.github/agent.yml`:
 *
 *   routines:
 *     - name: nightly-digest
 *       skill: commit-summary
 *       prompt: Summarize what merged yesterday and post it as an issue comment.
 *       schedule: "0 9 * * *"
 *       manual: true
 *       events: [pull_request.closed]
 *       filters:
 *         - { field: base_branch, operator: equals, value: main }
 *
 * Parsing is total: anything malformed is dropped rather than throwing, because
 * a typo in repository config must never take down the webhook handler.
 */

export interface Routine {
  name: string;
  description?: string;
  /** Skill to run (built-in or repo-committed). */
  skill?: string;
  /** Extra instructions for this routine. */
  prompt?: string;
  /** Cron expression for scheduled runs. Executed by a workflow `schedule:`. */
  schedule?: string;
  /** Whether `/run <name>` may start it from a comment. Defaults to true. */
  manual: boolean;
  /** Repository events that start it, e.g. "pull_request.opened", "push". */
  events: string[];
  /** Conditions the event must satisfy. */
  filters: TriggerFilter[];
  /** Tool allowlist for this routine. */
  tools: string[];
  /** Whether the routine may modify files. Read-only by default. */
  write: boolean;
}

const NAME_RE = /^[a-z0-9][a-z0-9_-]*$/i;

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function strList(v: unknown): string[] {
  if (typeof v === 'string') return v.split(/[,\s]+/).filter(Boolean);
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  return [];
}

/** Parse the `routines:` block from untrusted repo config. */
export function parseRoutines(raw: unknown): Routine[] {
  if (!Array.isArray(raw)) return [];
  const out: Routine[] = [];
  const seen = new Set<string>();

  for (const item of raw) {
    const r = (item ?? {}) as Record<string, unknown>;
    const name = str(r.name)?.toLowerCase();
    if (!name || !NAME_RE.test(name) || seen.has(name)) continue;

    // A routine that can never start is a config mistake worth ignoring.
    const schedule = str(r.schedule);
    const events = strList(r.events);
    const manual = typeof r.manual === 'boolean' ? r.manual : true;
    if (!schedule && events.length === 0 && !manual) continue;

    seen.add(name);
    out.push({
      name,
      ...(str(r.description) ? { description: str(r.description)! } : {}),
      ...(str(r.skill) ? { skill: str(r.skill)!.replace(/^\//, '').toLowerCase() } : {}),
      ...(str(r.prompt) ? { prompt: str(r.prompt)! } : {}),
      ...(schedule ? { schedule } : {}),
      manual,
      events,
      filters: parseFilters(r.filters),
      tools: strList(r.tools),
      write: r.write === true,
    });
  }
  return out;
}

/** Look up a routine by name, tolerating a leading slash. */
export function findRoutine(routines: Routine[], name: string): Routine | undefined {
  const wanted = name.replace(/^\//, '').toLowerCase();
  return routines.find((r) => r.name === wanted);
}

/**
 * Does this routine's event list cover `eventName.action`?
 * Both the bare event ("pull_request") and the qualified form
 * ("pull_request.opened") match, so a routine can be as broad or narrow as it likes.
 */
export function matchesEvent(routine: Routine, eventName: string, action?: string): boolean {
  if (routine.events.length === 0) return false;
  const qualified = action ? `${eventName}.${action}` : eventName;
  return routine.events.some((e) => {
    const want = e.trim().toLowerCase();
    return want === eventName.toLowerCase() || want === qualified.toLowerCase();
  });
}

/** Every routine that should run for this event, filters included. */
export function routinesForEvent(
  routines: Routine[],
  eventName: string,
  action: string | undefined,
  subject: FilterSubject = {},
): Routine[] {
  return routines.filter((r) => matchesEvent(r, eventName, action) && matchesAllFilters(r.filters, subject));
}

/** Parse a `/run <name> [extra request]` comment command. */
export function parseRunCommand(body: string): { name: string; args: string } | null {
  const m = (body ?? '').trim().match(/^\/run[ \t]+([a-z0-9][a-z0-9_-]*)\b[ \t]*([\s\S]*)$/i);
  if (!m) return null;
  return { name: m[1]!.toLowerCase(), args: (m[2] ?? '').trim() };
}

/** Routines with a schedule, for rendering a workflow or a status comment. */
export function scheduledRoutines(routines: Routine[]): Routine[] {
  return routines.filter((r) => Boolean(r.schedule));
}

/**
 * Render a ready-to-commit workflow that runs the scheduled routines. Forge has
 * no scheduler of its own by design — GitHub already has one, and using it keeps
 * the runs inside the customer's own CI, on their own credentials.
 */
export function renderScheduleWorkflow(routines: Routine[]): string {
  const scheduled = scheduledRoutines(routines);
  if (scheduled.length === 0) return '';
  const crons = [...new Set(scheduled.map((r) => r.schedule!))]
    .map((c) => `    - cron: '${c.replace(/'/g, "")}'`)
    .join('\n');
  const steps = scheduled
    .map(
      (r) =>
        `      - name: ${r.name}\n` +
        `        uses: shipiit/forge@v1\n` +
        `        with:\n` +
        `          routine: ${r.name}\n` +
        `          anthropic-api-key: \${{ secrets.ANTHROPIC_API_KEY }}`,
    )
    .join('\n');

  return (
    `name: Forge routines\n\n` +
    `on:\n  schedule:\n${crons}\n  workflow_dispatch:\n    inputs:\n      routine:\n` +
    `        description: 'Routine to run now'\n        required: false\n\n` +
    `jobs:\n  routines:\n    runs-on: ubuntu-latest\n    permissions:\n` +
    `      contents: write\n      pull-requests: write\n      issues: write\n    steps:\n${steps}\n`
  );
}
