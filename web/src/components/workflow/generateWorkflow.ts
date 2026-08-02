import { providerMeta } from './providers';

/**
 * Turn the builder's answers into a workflow file.
 *
 * Pure and side-effect free so the preview, the copy button, and the download
 * all render byte-identical output from one source of truth.
 */

export interface WorkflowConfig {
  name: string;
  provider: string;
  model: string;
  secretName: string;
  /** Provider-specific environment values, keyed by env var name. */
  env: Record<string, string>;
  events: string[];
  skill: string;
  prompt: string;
  allowedTools: string[];
  maxTurns: string;
  maxOutputTokens: string;
  maxNits: string;
  triggerPhrase: string;
  schedule: string;
  /** Routine name, used when a schedule is set. */
  routineName: string;
  /** Maintain a change-history document from merged work. */
  history: boolean;
  /** Where that document lives — a file, or a directory in per_commit mode. */
  historyPath: string;
  /** One running document, or a new file named after each change. */
  historyMode: 'single' | 'per_commit';
  /** Branches whose commits are documented, e.g. "main, develop". */
  historyBranches: string;
  /** Only act on pull requests targeting these branches. Empty means all. */
  baseBranches: string;
  promptCache: boolean;
  useApp: boolean;
  timeout: string;
  concurrency: boolean;
  /** Which published ref of the Action to call, e.g. v1 or main. */
  actionRef: string;
}

export const DEFAULT_CONFIG: WorkflowConfig = {
  name: 'ShipIT Forge',
  provider: 'anthropic',
  model: '',
  secretName: 'ANTHROPIC_API_KEY',
  env: {},
  events: ['issues', 'issue_comment', 'pull_request', 'pull_request_review_comment'],
  skill: '',
  prompt: '',
  allowedTools: [],
  maxTurns: '',
  maxOutputTokens: '',
  maxNits: '',
  triggerPhrase: '',
  schedule: '',
  routineName: 'nightly-digest',
  history: false,
  historyPath: 'docs/CHANGE-HISTORY.md',
  historyMode: 'single',
  historyBranches: 'main',
  baseBranches: '',
  promptCache: true,
  useApp: false,
  timeout: '30',
  concurrency: true,
  actionRef: 'v2',
};

const EVENT_TYPES: Record<string, string> = {
  issues: '{ types: [opened, labeled] }',
  issue_comment: '{ types: [created] }',
  pull_request: '{ types: [opened, synchronize, closed] }',
  pull_request_review_comment: '{ types: [created] }',
  check_suite: '{ types: [completed] }',
  release: '{ types: [published] }',
};

/** Permissions implied by the selected events. */
export function permissionsFor(events: string[]): string[] {
  const perms = ['contents: write', 'pull-requests: write', 'issues: write'];
  if (events.includes('pull_request')) perms.push('checks: write');
  return perms;
}

export interface ValidationIssue {
  field: string;
  message: string;
}

/** Required fields, checked as the user types. */
export function validate(c: WorkflowConfig): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const meta = providerMeta(c.provider);

  if (!c.name.trim()) issues.push({ field: 'name', message: 'The workflow needs a name.' });
  if (!c.provider) issues.push({ field: 'provider', message: 'Pick a provider.' });

  if (meta.secretInput && !c.secretName.trim()) {
    issues.push({ field: 'secretName', message: `Name the secret holding your ${meta.label} credential.` });
  }
  for (const e of meta.extraEnv) {
    if (e.required && !(c.env[e.name] ?? '').trim()) {
      issues.push({ field: e.name, message: `${meta.label} needs ${e.label} (${e.name}).` });
    }
  }

  if (c.events.length === 0 && !c.schedule.trim()) {
    issues.push({ field: 'events', message: 'Choose at least one event, or set a schedule.' });
  }
  if (c.maxTurns && !/^\d+$/.test(c.maxTurns)) {
    issues.push({ field: 'maxTurns', message: 'Max turns must be a whole number.' });
  }
  if (c.maxOutputTokens && !/^\d+$/.test(c.maxOutputTokens)) {
    issues.push({ field: 'maxOutputTokens', message: 'Token budget must be a whole number.' });
  }
  if (c.history) {
    if (!c.historyPath.trim()) {
      issues.push({ field: 'historyPath', message: 'The change-history document needs a path.' });
    }
    if (branchList(c.historyBranches).length === 0) {
      issues.push({ field: 'historyBranches', message: 'Name at least one branch to document.' });
    }
  }
  if (c.schedule && c.schedule.trim().split(/\s+/).length !== 5) {
    issues.push({ field: 'schedule', message: 'A cron expression has five fields, e.g. 0 9 * * *' });
  }
  return issues;
}

/** Split a comma/space separated branch list. */
export function branchList(raw: string): string[] {
  return raw
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** True when the configuration warrants a second file. */
export function needsAgentYml(c: WorkflowConfig): boolean {
  return Boolean(c.schedule.trim()) || c.history || branchList(c.baseBranches).length > 0;
}

/**
 * The companion `.github/agent.yml`, generated when a schedule is set.
 *
 * The workflow says *when* to run; the routine says *what* to run and makes it
 * addressable by name, so the same job can also be started on demand with
 * `/run <name>` from any thread.
 */
export function generateAgentYml(c: WorkflowConfig): string {
  if (!needsAgentYml(c)) return '';
  const lines: string[] = ['# .github/agent.yml'];

  // Change history — one documented entry per merged change.
  if (c.history) {
    lines.push(
      '# One documented entry per merged change, written from that diff',
      '# alone and opened as a pull request — never pushed directly.',
      'history: true',
      `history_path: ${c.historyPath.trim() || 'docs/CHANGE-HISTORY.md'}`,
      `history_mode: ${c.historyMode}` +
        (c.historyMode === 'per_commit'
          ? '   # a new file per change, named after it'
          : '        # one running document'),
      '',
    );
  }

  // Only act on pull requests targeting these branches.
  const bases = branchList(c.baseBranches);
  if (bases.length === 1) {
    lines.push('filters:', `  - { field: base_branch, operator: equals, value: ${bases[0]} }`, '');
  } else if (bases.length > 1) {
    lines.push(
      'filters:',
      `  - { field: base_branch, operator: is_one_of, value: [${bases.join(', ')}] }`,
      '',
    );
  }

  if (c.schedule.trim()) {
    const name = (c.routineName.trim() || 'scheduled-run').toLowerCase().replace(/[^a-z0-9_-]/g, '-');
    lines.push('routines:', `  - name: ${name}`);
    if (c.skill) lines.push(`    skill: ${c.skill}`);
    if (c.prompt.trim()) {
      lines.push('    prompt: |');
      lines.push(block(c.prompt.trim(), '      '));
    }
    lines.push(`    schedule: "${c.schedule.trim()}"`);
    lines.push(`    manual: true                # also: /run ${name}`);
    if (c.allowedTools.length) lines.push(`    tools: [${c.allowedTools.join(', ')}]`);
    lines.push('    write: false                # set true to let it edit files (opens a PR)');
  }

  return `${lines.join('\n').replace(/\n+$/, '')}\n`;
}

/** Indent a multi-line block for a YAML literal scalar. */
function block(text: string, indent: string): string {
  return text
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => `${indent}${l}`)
    .join('\n');
}

export function generateWorkflow(c: WorkflowConfig): string {
  const meta = providerMeta(c.provider);
  const lines: string[] = [];
  const q = (s: string) => (/[:#{}[\],&*?|<>=!%@`]/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s);

  lines.push(`name: ${q(c.name || 'ShipIT Forge')}`, '');

  lines.push('on:');
  for (const e of c.events) lines.push(`  ${e}: ${EVENT_TYPES[e] ?? '{}'}`);
  // Documenting commits needs the push event on the branches being documented.
  if (c.history) {
    const branches = branchList(c.historyBranches);
    lines.push(`  push: { branches: [${(branches.length ? branches : ['main']).join(', ')}] }`);
  }
  if (c.schedule.trim()) {
    lines.push('  schedule:', `    - cron: '${c.schedule.trim()}'`, '  workflow_dispatch:');
  }
  lines.push('');

  lines.push('permissions:');
  for (const p of permissionsFor(c.events)) lines.push(`  ${p}`);
  // OIDC providers need a token to exchange for cloud credentials.
  if (c.provider === 'bedrock') lines.push('  id-token: write');
  lines.push('');

  if (c.concurrency) {
    lines.push(
      'concurrency:',
      '  group: forge-${{ github.event.issue.number || github.event.pull_request.number || github.ref }}',
      '  cancel-in-progress: false',
      '',
    );
  }

  lines.push('jobs:', '  forge:', '    runs-on: ubuntu-latest');
  if (c.timeout.trim()) lines.push(`    timeout-minutes: ${c.timeout.trim()}`);
  lines.push('    steps:');

  if (meta.preSteps?.length) {
    const region = (c.env.AWS_REGION ?? '').trim() || 'us-east-1';
    for (const s of meta.preSteps) lines.push(s.replace('${AWS_REGION}', region));
    lines.push('');
  }

  if (c.useApp) {
    lines.push(
      '      - name: Generate a token for the App',
      '        id: app-token',
      '        uses: actions/create-github-app-token@v2',
      '        with:',
      '          app-id: ${{ secrets.APP_ID }}',
      '          private-key: ${{ secrets.APP_PRIVATE_KEY }}',
      '',
    );
  }

  lines.push(`      - uses: shipiit/forge@${c.actionRef.trim() || 'v2'}`, '        with:');
  lines.push(`          provider: ${c.provider}`);
  if (c.model.trim()) lines.push(`          model: ${c.model.trim()}`);
  if (meta.secretInput) lines.push(`          ${meta.secretInput}: \${{ secrets.${c.secretName.trim()} }}`);
  if (c.useApp) lines.push('          github-token: ${{ steps.app-token.outputs.token }}');

  if (c.skill) lines.push(`          skill: ${c.skill}`);
  if (c.allowedTools.length) lines.push(`          allowed-tools: ${c.allowedTools.join(' ')}`);
  if (c.maxTurns.trim()) lines.push(`          max-turns: "${c.maxTurns.trim()}"`);
  if (c.maxOutputTokens.trim()) lines.push(`          max-output-tokens: "${c.maxOutputTokens.trim()}"`);
  if (c.maxNits.trim()) lines.push(`          max-nits: "${c.maxNits.trim()}"`);
  if (c.triggerPhrase.trim()) lines.push(`          trigger-phrase: "${c.triggerPhrase.trim()}"`);
  if (!c.promptCache) lines.push('          prompt-cache: "0"');
  if (c.prompt.trim()) {
    lines.push('          prompt: |');
    lines.push(block(c.prompt.trim(), '            '));
  }

  // Provider-specific environment, emitted only when the user filled it in.
  const envEntries = meta.extraEnv
    .map((e) => [e.name, (c.env[e.name] ?? '').trim()] as const)
    .filter(([, v]) => v !== '');
  if (envEntries.length > 0) {
    lines.push('        env:');
    for (const [k, v] of envEntries) lines.push(`          ${k}: ${v}`);
  }

  return `${lines.join('\n')}\n`;
}
