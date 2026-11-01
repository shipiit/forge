/**
 * Plain names for the rules Forge reports most, so a chart reads
 * "SQL injection" rather than a number someone has to look up.
 */
const NAMES: Record<string, string> = {
  'CWE-22': 'Path traversal',
  'CWE-78': 'Command injection',
  'CWE-79': 'Cross-site scripting',
  'CWE-89': 'SQL injection',
  'CWE-94': 'Code injection',
  'CWE-200': 'Information exposure',
  'CWE-209': 'Error message exposure',
  'CWE-250': 'Runs as root',
  'CWE-284': 'Improper access control',
  'CWE-285': 'Missing authorization',
  'CWE-287': 'Broken authentication',
  'CWE-321': 'Hard-coded key',
  'CWE-352': 'CSRF',
  'CWE-353': 'Missing integrity hash',
  'CWE-494': 'Unverified download',
  'CWE-502': 'Unsafe deserialization',
  'CWE-506': 'Malicious package',
  'CWE-532': 'Secret in logs',
  'CWE-601': 'Open redirect',
  'CWE-639': 'IDOR',
  'CWE-798': 'Committed secret',
  'CWE-829': 'Untrusted code included',
  'CWE-862': 'Missing authorization',
  'CWE-918': 'SSRF',
  'CWE-1321': 'Prototype pollution',
  'CWE-1327': 'Binds every interface',
  'CWE-1357': 'Mutable dependency pin',
  'CWE-1395': 'Vulnerable dependency',
};

/** "CWE-89 · SQL injection" for a known rule; the category as given otherwise; "uncategorised" for none. */
export function ruleLabel(category: string | null | undefined): string {
  const raw = (category ?? '').trim();
  if (!raw) return 'uncategorised';
  const cwe = /\bCWE-\d+\b/i.exec(raw)?.[0].toUpperCase();
  if (cwe && NAMES[cwe]) return `${cwe} · ${NAMES[cwe]}`;
  return raw;
}
