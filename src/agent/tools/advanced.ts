import { promises as fs } from 'node:fs';
import { execa } from 'execa';
import { z } from 'zod';
import type { ContentPart } from '../../providers/types.js';
import { type Tool, safeResolve, textPart } from './types.js';

/**
 * Apply several exact-string edits to one file in a single call. Each edit must
 * match a unique occurrence. Edits apply in order; the whole call fails (no file
 * change) if any edit cannot be applied — so the file is never left half-edited.
 */
export const multiEdit: Tool = {
  spec: {
    name: 'multi_edit',
    description:
      'Apply multiple exact-string replacements to one file atomically. Each edit\'s old_string ' +
      'must be unique at the time it is applied. If any edit fails, no changes are written.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path relative to the workspace root.' },
        edits: {
          type: 'array',
          description: 'Ordered list of {old_string, new_string} replacements.',
          items: {
            type: 'object',
            properties: { old_string: { type: 'string' }, new_string: { type: 'string' } },
            required: ['old_string', 'new_string'],
          },
        },
      },
      required: ['path', 'edits'],
    },
  },
  async run(args, ctx): Promise<ContentPart[]> {
    const { path: rel, edits } = z
      .object({
        path: z.string(),
        edits: z.array(z.object({ old_string: z.string(), new_string: z.string() })).min(1),
      })
      .parse(args);
    const abs = safeResolve(ctx.cwd, rel);
    let body = await fs.readFile(abs, 'utf8');
    edits.forEach((e, i) => {
      const first = body.indexOf(e.old_string);
      if (first === -1) throw new Error(`edit #${i + 1}: old_string not found.`);
      if (body.indexOf(e.old_string, first + 1) !== -1) {
        throw new Error(`edit #${i + 1}: old_string is not unique; add more context.`);
      }
      body = body.replace(e.old_string, e.new_string);
    });
    await fs.writeFile(abs, body, 'utf8');
    return textPart(`Applied ${edits.length} edits to ${rel}.`);
  },
};

/** Find files by glob pattern (e.g. "src/**\/*.ts"), sorted, capped. */
export const glob: Tool = {
  spec: {
    name: 'glob',
    description: 'Find files matching a glob pattern (e.g. "src/**/*.ts"). Returns matching paths.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob pattern relative to the workspace root.' },
        max_results: { type: 'number', description: 'Max paths to return (default 200).' },
      },
      required: ['pattern'],
    },
  },
  async run(args, ctx): Promise<ContentPart[]> {
    const { pattern, max_results } = z
      .object({ pattern: z.string(), max_results: z.number().int().positive().optional() })
      .parse(args);
    const cap = max_results ?? 200;
    // Node 22 supports fs.glob; fall back to listing if unavailable.
    const out: string[] = [];
    try {
      for await (const entry of fs.glob(pattern, { cwd: ctx.cwd })) {
        out.push(entry as string);
        if (out.length >= cap) break;
      }
    } catch (err) {
      return textPart(`glob failed: ${(err as Error).message}`);
    }
    out.sort();
    return textPart(out.length ? out.join('\n') : '(no matching files)');
  },
};

/** Inspect recent git history or blame for context on why code is the way it is. */
export const gitHistory: Tool = {
  spec: {
    name: 'git_history',
    description:
      'Inspect git history for context: recent commits (mode "log"), or line-by-line authorship ' +
      'of a file (mode "blame"). Useful to understand why code exists before changing it.',
    parameters: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['log', 'blame'], description: 'log or blame' },
        path: { type: 'string', description: 'File path (required for blame, optional for log).' },
        limit: { type: 'number', description: 'Number of log entries (default 15).' },
      },
      required: ['mode'],
    },
  },
  async run(args, ctx): Promise<ContentPart[]> {
    const { mode, path: rel, limit } = z
      .object({ mode: z.enum(['log', 'blame']), path: z.string().optional(), limit: z.number().int().positive().optional() })
      .parse(args);
    try {
      if (mode === 'blame') {
        if (!rel) throw new Error('blame requires a path.');
        safeResolve(ctx.cwd, rel);
        const { stdout } = await execa('git', ['blame', '--date=short', '-L', '1,120', rel], { cwd: ctx.cwd, reject: false });
        return textPart(stdout.slice(0, 20_000) || '(no blame output)');
      }
      const logArgs = ['log', `-n${limit ?? 15}`, '--pretty=format:%h %ad %an: %s', '--date=short'];
      if (rel) logArgs.push('--', rel);
      const { stdout } = await execa('git', logArgs, { cwd: ctx.cwd, reject: false });
      return textPart(stdout || '(no history)');
    } catch (err) {
      return textPart(`git_history failed: ${(err as Error).message}`);
    }
  },
};
