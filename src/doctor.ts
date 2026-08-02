import { SUPPORTED_PROVIDERS, checkProvider, PROVIDER_REQUIREMENTS, type CheckResult } from './providers/index.js';
import type { ProviderId } from './providers/types.js';

/**
 * Environment diagnostics for `forge doctor`. Reports which providers are ready
 * to run and exactly what is missing for the rest, without making a single
 * network call — so it is safe to run anywhere and fast enough to run always.
 *
 * Only env var NAMES are ever printed; values (which are credentials) are not.
 */

export interface DoctorReport {
  /** The provider that would actually be used right now. */
  active: ProviderId;
  activeOk: boolean;
  results: CheckResult[];
  /** Configured fallback chain, in order. */
  fallbacks: ProviderId[];
  /** Non-credential settings worth surfacing. */
  settings: Array<{ name: string; value: string }>;
}

export function buildDoctorReport(env: NodeJS.ProcessEnv = process.env): DoctorReport {
  const active = (env.LLM_PROVIDER || 'anthropic') as ProviderId;
  const results = SUPPORTED_PROVIDERS.filter((p) => p !== 'fake').map((p) => checkProvider(p, env));
  const fallbacks = (env.FORGE_FALLBACK_PROVIDERS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean) as ProviderId[];

  const settings = [
    { name: 'FORGE_MAX_OUTPUT_TOKENS', value: env.FORGE_MAX_OUTPUT_TOKENS || '16384 (default)' },
    { name: 'MAX_ITERATIONS', value: env.MAX_ITERATIONS || '25 (default)' },
    { name: 'FORGE_PROMPT_CACHE', value: env.FORGE_PROMPT_CACHE === '0' ? 'off' : 'on (default)' },
    { name: 'FORGE_THINKING_BUDGET', value: env.FORGE_THINKING_BUDGET || 'off (default)' },
    { name: 'FORGE_REASONING_EFFORT', value: env.FORGE_REASONING_EFFORT || 'auto (default)' },
  ];

  return {
    active,
    activeOk: checkProvider(active, env).ok,
    results,
    fallbacks,
    settings,
  };
}

/** Render the report as plain text for the terminal. */
export function renderDoctorReport(report: DoctorReport): string {
  const lines: string[] = ['', '🩺 ShipIT Forge — environment check', ''];

  const activeReq = PROVIDER_REQUIREMENTS[report.active];
  lines.push(
    `Active provider: ${report.active}${activeReq ? ` (${activeReq.label})` : ''} — ${
      report.activeOk ? '✅ ready' : '❌ not configured'
    }`,
  );
  if (report.fallbacks.length) lines.push(`Fallback chain: ${report.fallbacks.join(' → ')}`);
  lines.push('');

  lines.push('Providers:');
  for (const r of report.results) {
    const mark = r.ok ? '✅' : '  ';
    const detail = r.ok
      ? r.satisfied.length
        ? `via ${r.satisfied.join(', ')}`
        : 'no credentials required'
      : r.problems.join(' ');
    lines.push(`  ${mark} ${r.provider.padEnd(19)} ${detail}`);
  }

  lines.push('', 'Settings:');
  for (const s of report.settings) lines.push(`     ${s.name.padEnd(24)} ${s.value}`);

  const ready = report.results.filter((r) => r.ok).length;
  lines.push('', `${ready} of ${report.results.length} providers ready.`);
  if (!report.activeOk) {
    lines.push(`⚠️  LLM_PROVIDER is set to "${report.active}", which is not configured — runs will fail.`);
  }
  lines.push('');
  return lines.join('\n');
}
