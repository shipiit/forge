import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { ContentPart } from '../../providers/types.js';
import { type Tool, type ToolContext, textPart } from './types.js';
import { runCommand } from './bash.js';

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Detect the project's test command. An explicit override always wins; otherwise
 * we sniff common project markers. Returns null when nothing is detected.
 */
export async function detectTestCommand(cwd: string, override?: string): Promise<string | null> {
  if (override) return override;

  const pkgPath = path.join(cwd, 'package.json');
  if (await exists(pkgPath)) {
    try {
      const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8')) as { scripts?: Record<string, string> };
      if (pkg.scripts?.test) return 'npm test';
    } catch {
      /* fall through */
    }
  }
  if ((await exists(path.join(cwd, 'pyproject.toml'))) || (await exists(path.join(cwd, 'pytest.ini')))) {
    return 'pytest -q';
  }
  if (await exists(path.join(cwd, 'go.mod'))) return 'go test ./...';
  if (await exists(path.join(cwd, 'Cargo.toml'))) return 'cargo test';
  if (await exists(path.join(cwd, 'Makefile'))) {
    const mk = await fs.readFile(path.join(cwd, 'Makefile'), 'utf8').catch(() => '');
    if (/^test:/m.test(mk)) return 'make test';
  }
  return null;
}

/**
 * Detect the command that installs the project's dependencies, so tests can
 * actually run in a fresh clone (which has no node_modules / venv). Returns null
 * when nothing is detected.
 */
export async function detectInstallCommand(cwd: string): Promise<string | null> {
  if (await exists(path.join(cwd, 'pnpm-lock.yaml'))) return 'pnpm install --frozen-lockfile';
  if (await exists(path.join(cwd, 'yarn.lock'))) return 'yarn install --frozen-lockfile';
  if (await exists(path.join(cwd, 'package-lock.json'))) return 'npm ci';
  if (await exists(path.join(cwd, 'package.json'))) return 'npm install';
  if (await exists(path.join(cwd, 'requirements.txt'))) return 'pip install -r requirements.txt';
  if (await exists(path.join(cwd, 'pyproject.toml'))) return 'pip install -e . || pip install .';
  if (await exists(path.join(cwd, 'go.mod'))) return 'go mod download';
  return null;
}

export function makeRunTestsTool(override?: string): Tool {
  return {
    spec: {
      name: 'run_tests',
      description:
        "Run the project's test suite (auto-detected, or a configured command). " +
        'Use this to verify a fix before finishing. Returns exit code and output.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Optional explicit test command to run.' },
        },
      },
    },
    async run(args, ctx: ToolContext): Promise<ContentPart[]> {
      const { command } = z.object({ command: z.string().optional() }).parse(args ?? {});
      const cmd = await detectTestCommand(ctx.cwd, command ?? override);
      if (!cmd) {
        return textPart('No test command detected. Specify one via the "command" argument.');
      }
      const out = await runCommand(cmd, ctx, { timeoutMs: 300_000 });
      const head = textPart(`$ ${cmd}`);
      return [...head, ...out];
    },
  };
}
