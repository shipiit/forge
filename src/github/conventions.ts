import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * Repository instruction files, the way Claude Code reads them.
 *
 * Two kinds, with deliberately different weight:
 *
 * - **Project context** (`CLAUDE.md`, `AGENTS.md`, `.github/FORGE.md`) — shared
 *   conventions used by every flow. In review, a newly introduced violation is a
 *   *nit*, not a blocker.
 * - **Review instructions** (`REVIEW.md`) — review-only, injected as the highest
 *   priority block so it overrides the default review guidance. Pasted verbatim:
 *   no import syntax, no file expansion.
 *
 * Both are capped: a long instruction file dilutes the rules that matter, and an
 * unbounded one would blow out the context of every single call.
 */

/** Files read as general project context, in priority order. */
export const PROJECT_CONTEXT_FILES = ['CLAUDE.md', 'AGENTS.md', '.github/FORGE.md'];

/** Review-only instruction file. */
export const REVIEW_INSTRUCTIONS_FILE = 'REVIEW.md';

/** Combined cap for project context, matching Claude Code's 8 KB guidance budget. */
export const MAX_CONTEXT_BYTES = 8 * 1024;

/** Cap for review instructions on their own. */
export const MAX_REVIEW_BYTES = 8 * 1024;

export interface RepoInstructions {
  /** Concatenated project context, empty when no file is present. */
  projectContext: string;
  /** Review-only instructions, empty when REVIEW.md is absent. */
  reviewInstructions: string;
  /** Which files were actually found (repo-relative), for logging. */
  found: string[];
}

async function readCapped(dir: string, rel: string, cap: number): Promise<string | null> {
  try {
    const body = await fs.readFile(path.join(dir, rel), 'utf8');
    const trimmed = body.trim();
    if (!trimmed) return null;
    return trimmed.length > cap ? `${trimmed.slice(0, cap)}\n\n… (truncated at ${cap} bytes)` : trimmed;
  } catch {
    return null;
  }
}

/** Read every instruction file present in the workspace. Never throws. */
export async function loadRepoInstructions(cwd: string): Promise<RepoInstructions> {
  const found: string[] = [];
  const parts: string[] = [];
  let budget = MAX_CONTEXT_BYTES;

  for (const rel of PROJECT_CONTEXT_FILES) {
    if (budget <= 0) break;
    const body = await readCapped(cwd, rel, budget);
    if (body === null) continue;
    found.push(rel);
    parts.push(`--- ${rel} ---\n${body}`);
    budget -= body.length;
  }

  const review = await readCapped(cwd, REVIEW_INSTRUCTIONS_FILE, MAX_REVIEW_BYTES);
  if (review !== null) found.push(REVIEW_INSTRUCTIONS_FILE);

  return {
    projectContext: parts.join('\n\n'),
    reviewInstructions: review ?? '',
    found,
  };
}

/**
 * Render project context as a prompt block. Used by every flow so the agent
 * follows the repo's own standards instead of generic defaults.
 */
export function renderProjectContextBlock(instructions: RepoInstructions): string {
  if (!instructions.projectContext) return '';
  return (
    `# Project conventions (from this repository)\n\n` +
    `Follow these when reading, changing, or reviewing this codebase. They come from the ` +
    `repository itself and take precedence over your general habits.\n\n` +
    instructions.projectContext
  );
}

/**
 * Build the system prompt for a review, layering repo instructions over the base
 * prompt. REVIEW.md goes LAST and is labelled highest priority, because that is
 * what makes it override the default guidance rather than blend into it.
 */
export function composeReviewSystemPrompt(base: string, instructions: RepoInstructions): string {
  let out = base;
  if (instructions.projectContext) {
    out +=
      `\n\n# Repository conventions\n\n` +
      `The project documents the conventions below. A change that NEWLY VIOLATES one of them is a ` +
      `"nit" severity finding — report it, but do not treat it as blocking. If a change makes one of ` +
      `these statements out of date, say the documentation needs updating.\n\n` +
      instructions.projectContext;
  }
  if (instructions.reviewInstructions) {
    out +=
      `\n\n# HIGHEST PRIORITY — review instructions from REVIEW.md\n\n` +
      `The repository maintainers wrote the block below specifically to control this review. It ` +
      `overrides the default review guidance above wherever the two disagree — including what counts ` +
      `as each severity, what to skip, and how many findings to report.\n\n` +
      instructions.reviewInstructions;
  }
  return out;
}
