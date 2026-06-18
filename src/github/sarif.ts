import type { ReviewFinding } from './review.js';

/**
 * Parse a SARIF document (CodeQL, Semgrep, etc.) into our normalized
 * {@link ReviewFinding} list, so scanner output can be triaged and presented
 * alongside the LLM security lens. Tolerant of missing fields — returns whatever
 * it can and skips malformed results rather than throwing.
 */
export function parseSarif(jsonText: string): ReviewFinding[] {
  let doc: any;
  try {
    doc = JSON.parse(jsonText);
  } catch {
    return [];
  }
  const findings: ReviewFinding[] = [];
  for (const run of doc?.runs ?? []) {
    const rules: any[] = run?.tool?.driver?.rules ?? [];
    const ruleById = new Map<string, any>(rules.map((r) => [r.id, r]));
    const toolName: string = run?.tool?.driver?.name ?? 'scanner';

    for (const res of run?.results ?? []) {
      const loc = res?.locations?.[0]?.physicalLocation;
      const file: string | undefined = loc?.artifactLocation?.uri;
      const region = loc?.region ?? {};
      const startLine: number = region.startLine ?? 1;
      const endLine: number = region.endLine ?? startLine;
      if (!file) continue;

      const rule = res.ruleId ? ruleById.get(res.ruleId) : undefined;
      const secSeverity = Number(rule?.properties?.['security-severity']);
      const severity = mapSeverity(res.level, secSeverity);
      const title: string = rule?.name ?? rule?.shortDescription?.text ?? res.ruleId ?? 'Scanner finding';

      findings.push({
        file,
        startLine,
        endLine,
        lens: 'security',
        severity,
        category: `${toolName}: ${res.ruleId ?? 'rule'}`,
        title,
        body: res?.message?.text ?? rule?.fullDescription?.text ?? 'Reported by static analysis.',
      });
    }
  }
  return findings;
}

function mapSeverity(level: string | undefined, securitySeverity: number): ReviewFinding['severity'] {
  if (!Number.isNaN(securitySeverity)) {
    if (securitySeverity >= 9) return 'critical';
    if (securitySeverity >= 7) return 'high';
    if (securitySeverity >= 4) return 'medium';
    return 'low';
  }
  switch (level) {
    case 'error':
      return 'high';
    case 'warning':
      return 'medium';
    case 'note':
      return 'low';
    default:
      return 'medium';
  }
}
