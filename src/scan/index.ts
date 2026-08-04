import { promises as fs } from 'node:fs';
import path from 'node:path';
import { execa } from 'execa';
import type { ReviewFinding } from '../github/review.js';
import { secretsScanner } from './secrets.js';
import { iacScanner } from './iac.js';
import { applySuppressions } from './suppress.js';
import { dedupe, type ScanContext, type Scanner } from './types.js';

export { dedupe, findingKey, type Scanner, type ScanContext } from './types.js';
export { secretsScanner, entropy, looksRandom } from './secrets.js';
export { iacScanner } from './iac.js';
export { applySuppressions, parseSuppressions, type Suppression } from './suppress.js';

/**
 * The deterministic half of a review.
 *
 * These run before the model and cost nothing. Their findings join the model's
 * and are deduplicated with them, so one weakness that three sources notice
 * arrives as one comment rather than three.
 */
export const SCANNERS: Scanner[] = [secretsScanner, iacScanner];

/** Directories never worth walking: not ours, or not source. */
const SKIP_DIR = /^(?:node_modules|\.git|dist|build|coverage|vendor|\.next|target|__pycache__)$/;

/** Files too large to be hand-written, so not worth scanning line by line. */
const MAX_BYTES = 512 * 1024;

/**
 * Walk a repository, bounded.
 *
 * The cap exists because an audit runs against whatever somebody points it at,
 * and a repository with a checked-in dataset would otherwise turn a review into
 * a filesystem crawl.
 */
export async function collectFiles(cwd: string, only?: Set<string>, limit = 4000): Promise<string[]> {
  if (only?.size) return [...only];

  // Ask git what is actually in the repository: tracked files, plus untracked
  // ones that are not ignored. Walking the filesystem instead reports things
  // that were deliberately kept out of it — a local .pem, a scratch dump — as
  // though they had been committed, which is both wrong and the fastest way to
  // teach somebody to ignore this scanner.
  try {
    const { stdout } = await execa('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd });
    const tracked = stdout.split('\n').filter(Boolean);
    if (tracked.length) return tracked.slice(0, limit);
  } catch {
    /* not a git repository, or git is unavailable — fall back to the walk */
  }

  const out: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    if (out.length >= limit) return;
    let entries: import('node:fs').Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return; // unreadable directory is not a reason to fail a review
    }
    for (const e of entries) {
      if (out.length >= limit) return;
      if (e.isDirectory()) {
        if (!SKIP_DIR.test(e.name)) await walk(path.join(dir, e.name));
      } else if (e.isFile()) {
        out.push(path.relative(cwd, path.join(dir, e.name)));
      }
    }
  };
  await walk(cwd);
  return out;
}

/**
 * Run every scanner over every file it handles.
 *
 * Never throws: a scanner that trips over one unusual file must not take the
 * review down with it, so a failure costs that file's findings and nothing else.
 */
export async function runScanners(ctx: ScanContext, scanners: Scanner[] = SCANNERS): Promise<ReviewFinding[]> {
  const files = await collectFiles(ctx.cwd, ctx.only);
  const findings: ReviewFinding[] = [];

  for (const rel of files) {
    const applicable = scanners.filter((s) => s.handles(rel));
    if (applicable.length === 0) continue;

    let text: string;
    try {
      const abs = path.join(ctx.cwd, rel);
      const stat = await fs.stat(abs);
      if (!stat.isFile() || stat.size > MAX_BYTES) continue;
      text = await fs.readFile(abs, 'utf8');
    } catch {
      continue; // deleted, binary, or unreadable
    }

    for (const scanner of applicable) {
      try {
        // The file gets to dismiss its own findings, in writing, on the line.
        findings.push(...applySuppressions(scanner.scan({ path: rel, text }, ctx), text, scanner.name));
      } catch {
        /* one scanner, one file — not the whole review */
      }
    }
  }

  return dedupe(findings);
}

/**
 * Merge scanner findings into the model's, keeping one comment per problem.
 *
 * Order matters: the model's findings come first so that when a scanner and the
 * model both describe the same weakness, the surviving body is whichever is
 * longer — which is nearly always the one with the reasoning in it.
 */
export function mergeFindings(fromModel: ReviewFinding[], fromScanners: ReviewFinding[]): ReviewFinding[] {
  return dedupe([...fromModel, ...fromScanners]);
}
