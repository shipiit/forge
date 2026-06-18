import type { ReviewFinding } from './review.js';
import type { OctokitLike } from './pr.js';

/**
 * Map GitHub Dependabot alerts (live data from the GitHub Advisory Database) to
 * our normalized findings. Pure + testable.
 */
/**
 * Neutralize Markdown control chars so untrusted API text can't break or inject
 * into the rendered comment. Escapes the full set of GFM specials (incl. () # + ! .)
 * for defense-in-depth, and flattens newlines.
 */
function md(s: unknown): string {
  return String(s ?? '')
    .replace(/[\\`*_{}[\]()#+.!~<>|=-]/g, '\\$&')
    .replace(/\r?\n/g, ' ');
}

export function mapAlertsToFindings(alerts: unknown[]): ReviewFinding[] {
  const out: ReviewFinding[] = [];
  for (const raw of alerts) {
    const a = raw as any;
    if (a?.state && a.state !== 'open') continue;
    const adv = a?.security_advisory ?? {};
    const vuln = a?.security_vulnerability ?? {};
    const pkg = a?.dependency?.package ?? {};
    const sev = (adv.severity as string)?.toLowerCase();
    const severity: ReviewFinding['severity'] =
      sev === 'critical' || sev === 'high' || sev === 'medium' || sev === 'low' ? sev : 'medium';
    const id = adv.cve_id || adv.ghsa_id || 'advisory';
    const patched = vuln?.first_patched_version?.identifier;
    out.push({
      file: a?.dependency?.manifest_path || 'dependencies',
      startLine: 1,
      endLine: 1,
      lens: 'security',
      severity,
      category: `Dependabot: ${id}`,
      title: `Vulnerable dependency: ${md(pkg.name) || 'unknown'}`,
      body:
        `${md(adv.summary) || 'Known vulnerability in a dependency.'}\n\n` +
        `Package: \`${md(pkg.name) || '?'}\` (${md(pkg.ecosystem) || '?'}). ` +
        `Affected: ${md(vuln?.vulnerable_version_range) || '?'}. ` +
        (patched ? `Fixed in **${md(patched)}** — upgrade to it or later.` : 'No patched version yet.') +
        (typeof a?.html_url === 'string' ? `\n\n${a.html_url}` : ''),
    });
  }
  return out;
}

/**
 * Fetch open Dependabot alerts for the repo (best-effort). Returns [] if the
 * feature is disabled, not permitted, or unavailable — never throws.
 */
export async function fetchDependabotFindings(
  octokit: OctokitLike,
  owner: string,
  repo: string,
  log: (msg: string) => void = () => {},
): Promise<ReviewFinding[]> {
  try {
    if (!octokit.rest.dependabot?.listAlertsForRepo) return [];
    const res = await octokit.rest.dependabot.listAlertsForRepo({ owner, repo, state: 'open', per_page: 50 });
    const findings = mapAlertsToFindings(res.data);
    if (findings.length) log(`ingested ${findings.length} Dependabot alert(s)`);
    return findings;
  } catch (err) {
    log(`Dependabot alerts unavailable: ${(err as Error).message}`);
    return [];
  }
}
