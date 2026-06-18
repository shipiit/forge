import type { Tool } from './types.js';
import { readFile, writeFile, editFile, listDir, readImage } from './fs.js';
import { search } from './search.js';
import { runBash } from './bash.js';
import { makeRunTestsTool } from './tests.js';

/** Tools available when the agent is allowed to modify code (fix / mention-with-commit). */
export function editToolset(opts: { testCommand?: string } = {}): Tool[] {
  return [readFile, writeFile, editFile, listDir, readImage, search, runBash, makeRunTestsTool(opts.testCommand)];
}

/** Read-only tools for reviewing a PR (no writes, no arbitrary shell). */
export function reviewToolset(): Tool[] {
  return [readFile, readImage, listDir, search];
}

/** Index tools by name for quick lookup inside the loop. */
export function indexTools(tools: Tool[]): Map<string, Tool> {
  return new Map(tools.map((t) => [t.spec.name, t]));
}
