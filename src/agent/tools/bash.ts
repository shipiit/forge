import { execa } from 'execa';
import { z } from 'zod';
import type { ContentPart } from '../../providers/types.js';
import { type Tool, type ToolContext, textPart } from './types.js';

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_CHARS = 30_000;

/**
 * Command substrings that are refused outright. This is a defense-in-depth guard
 * in addition to running the worker inside a container in production. It blocks
 * destructive resets and outbound network tools (sandbox runs offline by default).
 */
const DENY_PATTERNS: RegExp[] = [
  /\brm\s+-rf\s+\/(?:\s|$)/, // rm -rf /
  /\b(curl|wget)\b/,
  /\bnc\b|\bnetcat\b/,
  /\bssh\b|\bscp\b/,
  /\b(shutdown|reboot|mkfs|dd)\b/,
  /:\(\)\s*\{.*\};:/, // fork bomb
  /\bgit\s+push\b/, // pushing is done explicitly by the workspace layer, not the agent
];

export interface RunBashOptions {
  timeoutMs?: number;
}

/** Core runner reused by `run_bash` and `run_tests`. */
export async function runCommand(
  command: string,
  ctx: ToolContext,
  opts: RunBashOptions = {},
): Promise<ContentPart[]> {
  for (const pat of DENY_PATTERNS) {
    if (pat.test(command)) {
      return [{ type: 'tool_result', toolCallId: '', content: `Command refused by sandbox policy: ${command}`, isError: true }];
    }
  }

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  try {
    const result = await execa(command, {
      cwd: ctx.cwd,
      shell: true,
      timeout: timeoutMs,
      reject: false,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });
    const { stdout, stderr, exitCode } = result;
    if (result.timedOut) {
      return [{ type: 'tool_result', toolCallId: '', content: `Command timed out after ${timeoutMs}ms: ${command}`, isError: true }];
    }
    let body = [stdout, stderr].filter(Boolean).join('\n');
    if (body.length > MAX_OUTPUT_CHARS) {
      body = body.slice(0, MAX_OUTPUT_CHARS) + `\n... (output truncated at ${MAX_OUTPUT_CHARS} chars)`;
    }
    return textPart(`exit_code: ${exitCode}\n${body}`);
  } catch (err) {
    const e = err as Error & { timedOut?: boolean };
    const reason = e.timedOut ? `timed out after ${opts.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms` : e.message;
    return [{ type: 'tool_result', toolCallId: '', content: `Command failed: ${reason}`, isError: true }];
  }
}

export const runBash: Tool = {
  spec: {
    name: 'run_bash',
    description:
      'Run a shell command in the workspace. Network is disabled and destructive/outbound ' +
      'commands are blocked. Returns exit code and combined stdout/stderr.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The shell command to run.' },
        timeout_ms: { type: 'number', description: 'Optional timeout in milliseconds.' },
      },
      required: ['command'],
    },
  },
  async run(args, ctx): Promise<ContentPart[]> {
    const { command, timeout_ms } = z
      .object({ command: z.string(), timeout_ms: z.number().int().positive().optional() })
      .parse(args);
    return runCommand(command, ctx, { timeoutMs: timeout_ms });
  },
};
