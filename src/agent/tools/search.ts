import { execa } from 'execa';
import { z } from 'zod';
import type { ContentPart } from '../../providers/types.js';
import { type Tool, textPart } from './types.js';

const DEFAULT_MAX = 200;

/** True if a real ripgrep binary is on PATH (not the shell-function wrapper). */
async function hasRipgrep(): Promise<boolean> {
  try {
    await execa('rg', ['--version'], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

export const search: Tool = {
  spec: {
    name: 'search',
    description:
      'Search the workspace for a regular-expression pattern. Returns matching lines as ' +
      '"path:line:text". Use this to locate code before reading files.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Regex pattern to search for.' },
        max_results: { type: 'number', description: `Max matches to return (default ${DEFAULT_MAX}).` },
      },
      required: ['pattern'],
    },
  },
  async run(args, ctx): Promise<ContentPart[]> {
    const { pattern, max_results } = z
      .object({ pattern: z.string(), max_results: z.number().int().positive().optional() })
      .parse(args);
    const cap = max_results ?? DEFAULT_MAX;

    const useRg = await hasRipgrep();
    const [cmd, cmdArgs] = useRg
      ? ([
          'rg',
          [
            '--line-number',
            '--no-heading',
            '--color=never',
            '--glob',
            '!.git',
            '--glob',
            '!node_modules',
            '--glob',
            '!dist',
            pattern,
            '.',
          ],
        ] as const)
      : ([
          'grep',
          ['-rnI', '--exclude-dir=.git', '--exclude-dir=node_modules', '--exclude-dir=dist', '--', pattern, '.'],
        ] as const);

    try {
      const { stdout } = await execa(cmd, [...cmdArgs], {
        cwd: ctx.cwd,
        timeout: 30_000,
        reject: false,
        maxBuffer: 10 * 1024 * 1024,
      });
      const lines = stdout.split('\n').filter(Boolean);
      if (lines.length === 0) return textPart('(no matches)');
      const shown = lines.slice(0, cap);
      const suffix = lines.length > cap ? `\n... (${lines.length - cap} more matches truncated)` : '';
      return textPart(shown.join('\n') + suffix);
    } catch (err) {
      return textPart(`search failed: ${(err as Error).message}`);
    }
  },
};
