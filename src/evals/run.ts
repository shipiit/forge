import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ReviewFinding } from '../github/review.js';
import { runScanners, type Scanner } from '../scan/index.js';
import { scoreCase, scorecard } from './score.js';
import type { CaseResult, EvalCase, Scorecard } from './types.js';

/**
 * Running the corpus.
 *
 * The deterministic half runs here: no model, no network, no cost, same answer
 * every time. That is deliberate — it is the half that regresses silently,
 * because a prompt change is obvious and a regex change is not, and it is the
 * half a contributor can run on a laptop before opening a pull request.
 *
 * The model half needs a provider and a budget, so it is opt-in: pass a
 * `review` function and each case is put through it as well.
 */

/** Write a case to a temp directory so the scanners see real files. */
async function materialise(kase: EvalCase): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'forge-eval-'));
  for (const [rel, contents] of Object.entries(kase.files)) {
    const abs = path.join(dir, rel);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, contents);
  }
  return dir;
}

export interface RunOptions {
  /** Restrict to these scanners. Defaults to all of them. */
  scanners?: Scanner[];
  /**
   * The model half, when you want it.
   *
   * Given the case directory, return what the model reported. Left out, the
   * run measures the deterministic passes alone — which is the fast, free,
   * repeatable part.
   */
  review?: (dir: string, kase: EvalCase) => Promise<ReviewFinding[]>;
  /** Progress, one line per case. */
  onCase?: (result: CaseResult) => void;
}

/** Run one case and score it. */
export async function runCase(kase: EvalCase, opts: RunOptions = {}): Promise<CaseResult> {
  const dir = await materialise(kase);
  try {
    const scanned = await runScanners({ cwd: dir }, opts.scanners);
    const modelled = opts.review ? await opts.review(dir, kase) : [];
    return scoreCase(kase, [...scanned, ...modelled]);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

/**
 * Run the whole corpus.
 *
 * Sequential on purpose: these write to disk and shell out to git, and a
 * corpus that races itself produces a flaky number — which is worse than no
 * number, because people believe it.
 */
export async function runSuite(cases: EvalCase[], opts: RunOptions = {}): Promise<Scorecard> {
  const results: CaseResult[] = [];
  for (const kase of cases) {
    const result = await runCase(kase, opts);
    opts.onCase?.(result);
    results.push(result);
  }
  return scorecard(results);
}

/**
 * Expand `{{hex:32}}` and `{{alnum:20}}` into credential-shaped filler.
 *
 * A corpus for a secret scanner needs strings that look exactly like real
 * credentials, and committing those is how a repository ends up with its own
 * push protection refusing it — which is what happened here. GitHub's scanner
 * cannot tell our GitLab fixture from a real token, and it is right not to
 * try.
 *
 * So the shape lives in the case file and the entropy is generated when the
 * case is read. Deterministic, from the placeholder's own position, so the
 * corpus scores the same on every machine and every run.
 */
export function expandFixtures(text: string): string {
  let n = 0;
  return text.replace(/\{\{(hex|alnum):(\d+)\}\}/g, (_, kind: string, lenRaw: string) => {
    const alphabet =
      kind === 'hex' ? '0123456789abcdef' : 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    const length = Number(lenRaw);
    // A tiny LCG seeded by the placeholder index: no randomness at runtime, so
    // a corpus that passes here passes in CI.
    let seed = (n += 1) * 2654435761;
    let out = '';
    for (let i = 0; i < length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      out += alphabet[seed % alphabet.length];
    }
    return out;
  });
}

/** Load every `*.json` case from a directory, sorted for a stable report. */
export async function loadCases(dir: string): Promise<EvalCase[]> {
  let names: string[];
  try {
    names = (await fs.readdir(dir)).filter((n) => n.endsWith('.json')).sort();
  } catch {
    return [];
  }

  const cases: EvalCase[] = [];
  for (const name of names) {
    const raw = expandFixtures(await fs.readFile(path.join(dir, name), 'utf8'));
    const parsed = JSON.parse(raw) as EvalCase | EvalCase[];
    // A file may hold one case or several; several keeps related cases
    // together, which is how somebody reads them.
    cases.push(...(Array.isArray(parsed) ? parsed : [parsed]));
  }
  return cases;
}
