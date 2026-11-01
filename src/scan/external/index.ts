import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execa } from 'execa';
import type { ReviewFinding } from '../../github/review.js';
import { parseBandit, parseCheckov, parseGitleaks, parseOsvScanner, parseSemgrep, parseTrivy } from './parsers.js';

/**
 * Third-party scanners, run when they are installed.
 *
 * The Action image ships them pinned; a self-hosted server uses whatever is on
 * its PATH. Each runs on the repository with a stripped environment — no
 * GitHub token, no model key — because they read untrusted code, and a scanner
 * plugin or config file in that code should find nothing worth stealing.
 */

export interface ExternalTool {
  name: string;
  /** argv for the tool; `out` is a file outside the repository it may write to. */
  args(cwd: string, out: string): string[];
  /** Where the JSON lands: the `out` file, or stdout. */
  output: 'file' | 'stdout';
  parse(json: unknown, root: string): ReviewFinding[];
}

const SKIP = ['node_modules', '.git', 'dist', 'build', 'vendor', '.venv', 'venv', 'coverage', '.next', 'target'];

export const EXTERNAL_TOOLS: ExternalTool[] = [
  {
    name: 'semgrep',
    output: 'file',
    args: (cwd, out) => [
      'scan', '--metrics=off', '--quiet', '--json', '--output', out,
      '--config', 'p/owasp-top-ten', '--config', 'p/secrets', '--config', 'p/default',
      ...SKIP.flatMap((d) => ['--exclude', d]), cwd,
    ],
    parse: parseSemgrep,
  },
  {
    name: 'gitleaks',
    output: 'file',
    args: (cwd, out) => ['dir', '--redact', '--no-banner', '--log-level', 'error', '--report-format', 'json', '--report-path', out, '--exit-code', '0', cwd],
    parse: parseGitleaks,
  },
  {
    name: 'trivy',
    output: 'file',
    args: (cwd, out) => [
      'fs', '--quiet', '--scanners', 'misconfig,secret', '--severity', 'MEDIUM,HIGH,CRITICAL', '--format', 'json', '--output', out,
      ...SKIP.flatMap((d) => ['--skip-dirs', d]), cwd,
    ],
    parse: parseTrivy,
  },
  {
    name: 'osv-scanner',
    output: 'file',
    args: (cwd, out) => ['scan', 'source', '--recursive', '--format', 'json', '--output', out, cwd],
    parse: parseOsvScanner,
  },
  {
    name: 'bandit',
    output: 'file',
    args: (cwd, out) => ['-r', cwd, '-f', 'json', '-o', out, '-q', '-x', SKIP.map((d) => path.join(cwd, d)).join(',')],
    parse: parseBandit,
  },
  {
    name: 'checkov',
    output: 'stdout',
    args: (cwd) => ['-d', cwd, '--output', 'json', '--quiet', '--compact', '--framework', 'dockerfile,github_actions,terraform,kubernetes,helm'],
    parse: parseCheckov,
  },
];

export interface ToolRun {
  name: string;
  status: 'ran' | 'missing' | 'failed';
  findings: number;
  detail?: string;
}

/** The environment a scanner sees: enough to run, nothing worth taking. */
export function scannerEnv(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const keep = ['PATH', 'HOME', 'TMPDIR', 'LANG', 'SSL_CERT_FILE', 'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY'];
  const out: Record<string, string> = { SEMGREP_SEND_METRICS: 'off', SEMGREP_ENABLE_VERSION_CHECK: '0', TRIVY_DISABLE_VEX_NOTICE: '1' };
  for (const k of keep) if (env[k]) out[k] = env[k]!;
  return out;
}

export interface RunExternalOptions {
  tools?: ExternalTool[];
  timeoutMs?: number;
  log?: (msg: string) => void;
  /** Injectable for tests: run a command and return its stdout. */
  exec?: (cmd: string, args: string[], opts: { cwd: string; timeout: number; env: Record<string, string> }) => Promise<string>;
}

/**
 * Exit 0 is clean and exit 1 is "found something" for osv-scanner, bandit and
 * checkov alike; anything else, a timeout, or a missing binary is a failure.
 */
const defaultExec: NonNullable<RunExternalOptions['exec']> = async (cmd, args, opts) => {
  const r = await execa(cmd, args, { cwd: opts.cwd, timeout: opts.timeout, env: opts.env, extendEnv: false, reject: false });
  if (r.timedOut || r.exitCode === undefined || r.exitCode > 1) {
    const err = new Error(r.timedOut ? `${cmd} timed out` : r.shortMessage ?? `${cmd} failed`);
    const code: unknown = typeof r.cause === 'object' && r.cause !== null ? Reflect.get(r.cause, 'code') : undefined;
    if (typeof code === 'string') Object.assign(err, { code });
    throw err;
  }
  return r.stdout;
};

/** Run every installed tool over `cwd`. Never throws; reports what ran, what was missing, what failed. */
export async function runExternalScanners(cwd: string, opts: RunExternalOptions = {}): Promise<{ findings: ReviewFinding[]; runs: ToolRun[] }> {
  const tools = opts.tools ?? EXTERNAL_TOOLS;
  const exec = opts.exec ?? defaultExec;
  const log = opts.log ?? (() => {});
  const env = scannerEnv();
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'forge-ext-'));
  const findings: ReviewFinding[] = [];
  const runs: ToolRun[] = [];
  try {
    for (const tool of tools) {
      const out = path.join(tmp, `${tool.name}.json`);
      let stdout: string;
      try {
        stdout = await exec(tool.name, tool.args(cwd, out), { cwd, timeout: opts.timeoutMs ?? 600_000, env });
      } catch (err) {
        const missing = typeof err === 'object' && err !== null && Reflect.get(err, 'code') === 'ENOENT';
        runs.push({ name: tool.name, status: missing ? 'missing' : 'failed', findings: 0, ...(missing ? {} : { detail: err instanceof Error ? err.message.split('\n')[0]!.slice(0, 160) : 'failed' }) });
        if (!missing) log(`scanner ${tool.name} failed`);
        continue;
      }
      try {
        const text = tool.output === 'stdout' ? stdout : await fs.readFile(out, 'utf8');
        const parsed = tool.parse(text.trim() ? JSON.parse(text) : [], cwd);
        findings.push(...parsed);
        runs.push({ name: tool.name, status: 'ran', findings: parsed.length });
        log(`scanner ${tool.name}: ${parsed.length} finding(s)`);
      } catch (err) {
        runs.push({ name: tool.name, status: 'failed', findings: 0, detail: `unreadable output (${err instanceof Error ? err.message.slice(0, 80) : 'parse error'})` });
      }
    }
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
  return { findings, runs };
}

/** One line per tool for the report, so "nothing found" is never confused with "never ran". */
export function renderToolRuns(runs: ToolRun[]): string {
  if (runs.length === 0) return '';
  const word = { ran: '✅', missing: '➖ not installed', failed: '⚠️ failed' } as const;
  return [
    '<details><summary><strong>Scanners</strong> — ' + runs.filter((r) => r.status === 'ran').length + ` of ${runs.length} ran</summary>`,
    '',
    '| Tool | Result |',
    '|---|---|',
    ...runs.map((r) => `| ${r.name} | ${r.status === 'ran' ? `${word.ran} ${r.findings} finding(s)` : `${word[r.status]}${r.detail ? ` — ${r.detail.replace(/\|/g, '/')}` : ''}`} |`),
    '',
    '</details>',
  ].join('\n');
}
