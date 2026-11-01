import { providerMeta } from './providers';
import { block } from './yaml';

export { validate, type ValidationIssue } from './validate';
import { branchList } from './agentYml';

export { branchList, generateAgentYml, needsAgentYml } from './agentYml';

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
  /** light: one pass · standard: find, then verify · deep: three reviewers, then verify. */
  reviewDepth: 'light' | 'standard' | 'deep';
  /** Check changed lockfiles against OSV.dev. */
  depScan: boolean;
  /** Run the bundled third-party scanners on /audit. */
  externalScanners: boolean;
  /** /audit slices from owner/repo@<full commit SHA>; empty uses the built-ins. */
  auditSkills: string;
  /** Lowest severity that fails the scan's check run. */
  scanBlockOn: 'critical' | 'high' | 'medium' | 'low' | 'none';
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
  reviewDepth: 'standard',
  depScan: true,
  externalScanners: true,
  auditSkills: '',
  scanBlockOn: 'high',
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
  // Review and scanning: emitted only when they differ from the Action's defaults.
  if (c.reviewDepth !== 'standard') lines.push(`          review-depth: ${c.reviewDepth}`);
  if (!c.depScan) lines.push('          dep-scan: "0"');
  if (!c.externalScanners) lines.push('          external-scanners: "0"');
  if (c.scanBlockOn !== 'high') lines.push(`          scan-block-on: ${c.scanBlockOn}`);
  if (c.auditSkills.trim()) lines.push(`          audit-skills: ${c.auditSkills.trim()}`);
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
