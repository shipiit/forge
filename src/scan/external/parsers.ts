import type { ReviewFinding } from '../../github/review.js';

/**
 * Each external scanner's JSON, as Forge findings.
 *
 * Pure and defensive: a tool upgrade that renames a field costs that tool's
 * findings, never the audit. Categories reuse the built-in scanners' where
 * the meaning is the same (a gitleaks key and a Forge key are both CWE-798 on
 * the same line), so dedupe turns two reports of one secret into one comment.
 */

type Severity = ReviewFinding['severity'];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function num(v: unknown, fallback = 1): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
}

/** One line, no markup: scanner messages end up in a comment and a prompt. */
function plain(s: string, max = 300): string {
  const flat = s.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/[`<>]/g, '').replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** Repository-relative, forward slashes, never escaping the root. */
export function relPath(p: string, root: string): string {
  let out = p.replace(/\\/g, '/');
  const r = root.replace(/\\/g, '/').replace(/\/$/, '');
  if (out.startsWith(`${r}/`)) out = out.slice(r.length + 1);
  out = out.replace(/^\.\//, '').replace(/^\/+/, '');
  return out.split('/').includes('..') ? '' : out;
}

function cweOf(v: unknown): string | undefined {
  const all = (Array.isArray(v) ? v : [v]).map((x) => (typeof x === 'string' || typeof x === 'number' ? String(x) : ''));
  for (const s of all) {
    const m = /CWE-?(\d+)/i.exec(s) ?? (/^\d+$/.test(s) ? [s, s] : null);
    if (m) return `CWE-${m[1]}`;
  }
  return undefined;
}

function finding(tool: string, f: Omit<ReviewFinding, 'lens' | 'body'> & { body: string }): ReviewFinding {
  return { lens: 'security', ...f, title: plain(f.title, 160), body: `${plain(f.body, 600)}\n\n<sub>Reported by ${tool}.</sub>` };
}

const SEMGREP: Record<string, Severity> = { ERROR: 'high', WARNING: 'medium', INFO: 'low' };

export function parseSemgrep(json: unknown, root: string): ReviewFinding[] {
  if (!isRecord(json)) return [];
  return arr(json.results).flatMap((r) => {
    if (!isRecord(r) || !isRecord(r.extra)) return [];
    const file = relPath(str(r.path), root);
    const start = isRecord(r.start) ? num(r.start.line) : 1;
    const end = isRecord(r.end) ? num(r.end.line, start) : start;
    const meta = isRecord(r.extra.metadata) ? r.extra.metadata : {};
    const id = str(r.check_id);
    if (!file || !id) return [];
    return [finding('semgrep', {
      file, startLine: start, endLine: end,
      severity: SEMGREP[str(r.extra.severity).toUpperCase()] ?? 'medium',
      category: cweOf(meta.cwe) ?? `semgrep:${id.split('.').pop()}`,
      title: str(meta.message_title) || id.split('.').pop()?.replace(/[-_]/g, ' ') || 'semgrep finding',
      body: str(r.extra.message),
    })];
  });
}

export function parseGitleaks(json: unknown, root: string): ReviewFinding[] {
  return arr(json).flatMap((r) => {
    if (!isRecord(r)) return [];
    const file = relPath(str(r.File), root);
    if (!file) return [];
    const start = num(r.StartLine);
    return [finding('gitleaks', {
      file, startLine: start, endLine: num(r.EndLine, start), severity: 'high', category: 'CWE-798',
      title: `${str(r.Description) || str(r.RuleID) || 'Secret'} committed to the repository`,
      body: `gitleaks rule ${str(r.RuleID)} matched here (value redacted). Treat it as compromised: rotate it, then remove it.`,
    })];
  });
}

const LEVEL: Record<string, Severity> = { CRITICAL: 'critical', HIGH: 'high', MEDIUM: 'medium', LOW: 'low', INFO: 'info', UNKNOWN: 'medium' };

export function parseTrivy(json: unknown, root: string): ReviewFinding[] {
  if (!isRecord(json)) return [];
  return arr(json.Results).flatMap((res) => {
    if (!isRecord(res)) return [];
    const file = relPath(str(res.Target), root);
    if (!file) return [];
    const mis = arr(res.Misconfigurations).flatMap((m) => {
      if (!isRecord(m) || str(m.Status) === 'PASS') return [];
      const cause = isRecord(m.CauseMetadata) ? m.CauseMetadata : {};
      const start = num(cause.StartLine);
      return [finding('trivy', {
        file, startLine: start, endLine: num(cause.EndLine, start),
        severity: LEVEL[str(m.Severity).toUpperCase()] ?? 'medium',
        category: `trivy:${str(m.ID) || str(m.AVDID) || 'misconfig'}`,
        title: str(m.Title) || 'Misconfiguration',
        body: `${str(m.Message)} ${str(m.Resolution)}`,
      })];
    });
    const sec = arr(res.Secrets).flatMap((s) => {
      if (!isRecord(s)) return [];
      const start = num(s.StartLine);
      return [finding('trivy', {
        file, startLine: start, endLine: num(s.EndLine, start), severity: LEVEL[str(s.Severity).toUpperCase()] ?? 'high',
        category: 'CWE-798', title: `${str(s.Title) || 'Secret'} committed to the repository`,
        body: `trivy secret rule ${str(s.RuleID)} matched here (value redacted).`,
      })];
    });
    return [...mis, ...sec];
  });
}

const BANDIT: Record<string, Severity> = { HIGH: 'high', MEDIUM: 'medium', LOW: 'low' };
const DOWN: Record<Severity, Severity> = { critical: 'high', high: 'medium', medium: 'low', low: 'info', info: 'info' };

export function parseBandit(json: unknown, root: string): ReviewFinding[] {
  if (!isRecord(json)) return [];
  return arr(json.results).flatMap((r) => {
    if (!isRecord(r)) return [];
    const file = relPath(str(r.filename), root);
    if (!file) return [];
    const line = num(r.line_number);
    const base = BANDIT[str(r.issue_severity).toUpperCase()] ?? 'medium';
    // Bandit's own confidence: a low-confidence high is a medium until a person looks.
    const severity = str(r.issue_confidence).toUpperCase() === 'LOW' ? DOWN[base] : base;
    const cwe = isRecord(r.issue_cwe) ? cweOf(r.issue_cwe.id) : undefined;
    return [finding('bandit', {
      file, startLine: line, endLine: line, severity,
      category: cwe ?? `bandit:${str(r.test_id)}`,
      title: str(r.issue_text) || str(r.test_name) || 'bandit finding',
      body: `${str(r.test_id)} ${str(r.test_name)}: ${str(r.issue_text)}`,
    })];
  });
}

export function parseCheckov(json: unknown, root: string): ReviewFinding[] {
  return (Array.isArray(json) ? json : [json]).flatMap((block) => {
    if (!isRecord(block) || !isRecord(block.results)) return [];
    return arr(block.results.failed_checks).flatMap((c) => {
      if (!isRecord(c)) return [];
      const file = relPath(str(c.file_path), root);
      if (!file) return [];
      const range = arr(c.file_line_range);
      const start = num(range[0]);
      return [finding('checkov', {
        file, startLine: start, endLine: num(range[1], start),
        severity: LEVEL[str(c.severity).toUpperCase()] ?? 'medium',
        category: `checkov:${str(c.check_id)}`, title: str(c.check_name) || str(c.check_id),
        body: `${str(c.check_id)}: ${str(c.check_name)}. ${str(c.guideline)}`,
      })];
    });
  });
}

/** Ecosystems the in-process dependency scanner already checks; osv-scanner adds the rest. */
const COVERED = new Set(['npm', 'PyPI', 'crates.io']);

export function parseOsvScanner(json: unknown, root: string): ReviewFinding[] {
  if (!isRecord(json)) return [];
  return arr(json.results).flatMap((res) => {
    if (!isRecord(res) || !isRecord(res.source)) return [];
    const file = relPath(str(res.source.path), root);
    if (!file) return [];
    return arr(res.packages).flatMap((p) => {
      if (!isRecord(p) || !isRecord(p.package)) return [];
      const eco = str(p.package.ecosystem);
      const vulns = arr(p.vulnerabilities).filter(isRecord);
      if (COVERED.has(eco) || vulns.length === 0) return [];
      const ids = vulns.map((v) => str(v.id)).filter(Boolean);
      const malicious = ids.some((id) => id.startsWith('MAL-'));
      const max = arr(p.groups).filter(isRecord).map((g) => Number(str(g.max_severity))).filter(Number.isFinite);
      const cvss = max.length ? Math.max(...max) : 0;
      const severity: Severity = malicious ? 'critical' : cvss >= 9 ? 'critical' : cvss >= 7 ? 'high' : cvss >= 4 ? 'medium' : 'medium';
      const name = `${str(p.package.name)}@${str(p.package.version)}`;
      return [finding('osv-scanner', {
        file, startLine: 1, endLine: 1, severity,
        category: malicious ? 'CWE-506' : 'CWE-1395',
        title: `${malicious ? 'Malicious package' : 'Vulnerable dependency'}: ${name} (${eco})`,
        body: `${name} is affected by ${ids.slice(0, 8).join(', ')}${ids.length > 8 ? '…' : ''}. See https://osv.dev/vulnerability/${ids[0]}.`,
      })];
    });
  });
}
