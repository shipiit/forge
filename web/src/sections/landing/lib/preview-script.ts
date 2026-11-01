/**
 * The hero's review, as data: one pull request, the four stages a Forge review
 * goes through, and when each thing appears. Pure, so the timing is testable
 * and the components only render what `frameAt` says is on screen.
 */

export type Stage = 'scan' | 'find' | 'verify' | 'post' | 'fixed';

export const STAGES: Array<{ id: Stage; label: string; ms: number }> = [
  { id: 'scan', label: 'Scan', ms: 2200 },
  { id: 'find', label: 'Find', ms: 3000 },
  { id: 'verify', label: 'Verify', ms: 3200 },
  { id: 'post', label: 'Post', ms: 4600 },
  { id: 'fixed', label: 'Fixed', ms: 4400 },
];

export const LOOP_MS = STAGES.reduce((n, s) => n + s.ms, 0);

export interface DiffLine {
  n: number | null;
  kind: 'ctx' | 'add' | 'del';
  text: string;
}

export const PR = {
  number: 214,
  title: 'Import a profile picture from a URL',
  branch: 'feat/avatar-url',
  file: 'src/avatar.ts',
};

export const DIFF: DiffLine[] = [
  { n: 8, kind: 'ctx', text: 'export async function importAvatar(req, res) {' },
  { n: null, kind: 'del', text: '  const url = allowlisted(req.body.url);' },
  { n: 9, kind: 'add', text: '  const url = req.body.url;' },
  { n: 10, kind: 'add', text: '  const img = await fetch(url);' },
  { n: 11, kind: 'ctx', text: '  await store(req.user.id, await img.arrayBuffer());' },
  { n: 12, kind: 'ctx', text: '  res.sendStatus(204);' },
];

/** The same file once the author commits the suggestion: only the fetch is new. */
export const DIFF_FIXED: DiffLine[] = [
  { n: 8, kind: 'ctx', text: 'export async function importAvatar(req, res) {' },
  { n: 9, kind: 'ctx', text: '  const url = allowlisted(req.body.url);' },
  { n: 10, kind: 'add', text: '  const img = await fetch(url);' },
  { n: 11, kind: 'ctx', text: '  await store(req.user.id, await img.arrayBuffer());' },
  { n: 12, kind: 'ctx', text: '  res.sendStatus(204);' },
];

/** The line the confirmed finding lands on. */
export const FINDING_LINE = 10;

export interface Candidate {
  id: number;
  title: string;
  where: string;
  severity: 'high' | 'medium';
  verdict: 'confirmed' | 'rejected';
  reason: string;
}

export const CANDIDATES: Candidate[] = [
  {
    id: 0,
    title: 'Server-side request forgery',
    where: 'src/avatar.ts:10',
    severity: 'high',
    verdict: 'confirmed',
    reason: 'req.body.url reaches fetch() unchecked; the allowlist was removed on line 9.',
  },
  {
    id: 1,
    title: 'req.user may be undefined',
    where: 'src/avatar.ts:11',
    severity: 'medium',
    verdict: 'rejected',
    reason: 'The route is mounted behind requireAuth (src/routes.ts:12).',
  },
];

export const SUGGESTION = '  const url = allowlisted(req.body.url);';

/** The commit that applied the suggestion. */
export const FIX_COMMIT = '3f2a9c1';

export const SCANNERS = ['secrets', 'code', 'iac', 'deps'];

export interface Frame {
  stage: Stage;
  /** 0–1 through the current stage. */
  progress: number;
  /** How many scanners have reported. */
  scannersDone: number;
  /** How many candidates the finders have reported. */
  candidatesShown: number;
  /** How many candidates have a verdict. */
  verdictsShown: number;
  /** The inline comment, the summary and the check run. */
  commentShown: boolean;
  checkShown: boolean;
  /** The author committed the suggestion; the diff shows the fixed line. */
  fixApplied: boolean;
  /** Forge re-reviewed the new commit and resolved its own thread. */
  resolved: boolean;
}

/** What is on screen `t` milliseconds into the loop. */
export function frameAt(t: number): Frame {
  const clamped = ((t % LOOP_MS) + LOOP_MS) % LOOP_MS;
  let start = 0;
  let index = 0;
  for (; index < STAGES.length - 1; index++) {
    if (clamped < start + STAGES[index]!.ms) break;
    start += STAGES[index]!.ms;
  }
  const stage = STAGES[index]!;
  const progress = Math.min(1, (clamped - start) / stage.ms);
  const reached = (s: Stage) => STAGES.findIndex((x) => x.id === s) <= index;
  const within = (s: Stage, count: number) =>
    stage.id === s ? Math.min(count, Math.floor(progress * (count + 1))) : reached(s) ? count : 0;

  return {
    stage: stage.id,
    progress,
    scannersDone: within('scan', SCANNERS.length),
    candidatesShown: within('find', CANDIDATES.length),
    verdictsShown: within('verify', CANDIDATES.length),
    commentShown: (stage.id === 'post' && progress > 0.08) || stage.id === 'fixed',
    checkShown: (stage.id === 'post' && progress > 0.3) || stage.id === 'fixed',
    fixApplied: stage.id === 'fixed' && progress > 0.15,
    resolved: stage.id === 'fixed' && progress > 0.5,
  };
}

/** The last frame of the loop: everything posted. Used when motion is reduced. */
export const FINAL_FRAME: Frame = frameAt(LOOP_MS - 1);
