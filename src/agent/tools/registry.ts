import type { Tool } from './types.js';
import { readFile, writeFile, editFile, listDir, readImage } from './fs.js';
import { search } from './search.js';
import { runBash } from './bash.js';
import { makeRunTestsTool } from './tests.js';
import { multiEdit, glob, gitHistory } from './advanced.js';

/** Tools available when the agent is allowed to modify code (fix / mention-with-commit). */
export function editToolset(opts: { testCommand?: string } = {}): Tool[] {
  return [
    readFile,
    writeFile,
    editFile,
    multiEdit,
    listDir,
    glob,
    readImage,
    search,
    gitHistory,
    runBash,
    makeRunTestsTool(opts.testCommand),
  ];
}

/** Read-only tools for reviewing a PR (no writes, no arbitrary shell). */
export function reviewToolset(): Tool[] {
  return [readFile, readImage, listDir, glob, search, gitHistory];
}

/** Index tools by name for quick lookup inside the loop. */
export function indexTools(tools: Tool[]): Map<string, Tool> {
  return new Map(tools.map((t) => [t.spec.name, t]));
}

export interface ToolSelection {
  /** Only these tools are offered. Empty/absent means "all of them". */
  allowed?: string[];
  /** These tools are removed. Applied after `allowed`. */
  disallowed?: string[];
}

/**
 * Narrow a toolset to what a run actually needs.
 *
 * Two reasons this matters. Every tool schema is resent on every turn, so an
 * unused tool is pure token overhead for the whole run. And a smaller, relevant
 * toolset measurably improves tool choice — the model isn't picking from a menu
 * of things that don't apply to the task.
 *
 * Unknown names are ignored rather than throwing: a typo in a workflow file
 * should not take down the run.
 */
export function selectTools(tools: Tool[], selection: ToolSelection = {}): Tool[] {
  const allowed = (selection.allowed ?? []).filter(Boolean);
  const disallowed = new Set((selection.disallowed ?? []).filter(Boolean));

  let out = tools;
  if (allowed.length > 0) {
    const wanted = new Set(allowed);
    const narrowed = tools.filter((t) => wanted.has(t.spec.name));
    // An allowlist that matches nothing is almost certainly a mistake; falling
    // back to the full set keeps the run useful instead of silently toolless.
    if (narrowed.length > 0) out = narrowed;
  }
  return out.filter((t) => !disallowed.has(t.spec.name));
}

/** Parse a comma/space-separated tool list from workflow input. */
export function parseToolList(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
