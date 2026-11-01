import type { WorkflowConfig } from './generateWorkflow';
import { block } from './yaml';

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
