/**
 * What the landing page says Forge checks.
 *
 * Kept as data, beside a test that holds it to the backend: a page advertising
 * a scanner that does not run is the kind of wrong nobody notices until a
 * customer does.
 */

export interface CheckGroup {
  /** The backend scanner this group describes, or 'model' for the agent review. */
  source: 'secrets' | 'iac' | 'code' | 'deps' | 'model' | 'audit';
  title: string;
  cost: 'free' | 'tokens';
  items: Array<{ name: string; cwe?: string }>;
}

export const CHECK_GROUPS: CheckGroup[] = [
  {
    source: 'deps',
    title: 'Dependencies & supply chain',
    cost: 'free',
    items: [
      { name: 'Releases on the OpenSSF malicious-packages list', cwe: 'CWE-506' },
      { name: 'Known CVEs from OSV.dev, with the fixed version and the upgrade command', cwe: 'CWE-1395' },
      { name: 'An install script that appears in an update', cwe: 'CWE-829' },
      { name: 'Packages from git, plain HTTP or arbitrary URLs', cwe: 'CWE-494' },
      { name: 'Lockfile entries with no integrity hash', cwe: 'CWE-353' },
    ],
  },
  {
    source: 'secrets',
    title: 'Committed credentials',
    cost: 'free',
    items: [
      { name: 'Thirty-one provider key shapes: GitHub, AWS, Anthropic, OpenAI, Stripe…', cwe: 'CWE-798' },
      { name: 'Generic secrets by variable name and entropy', cwe: 'CWE-798' },
      { name: 'Private keys and database URLs with passwords', cwe: 'CWE-321' },
    ],
  },
  {
    source: 'code',
    title: 'Source code',
    cost: 'free',
    items: [
      { name: 'Command injection', cwe: 'CWE-78' },
      { name: 'Path traversal', cwe: 'CWE-22' },
      { name: 'Unsafe deserialization', cwe: 'CWE-502' },
      { name: 'Credentials written to logs', cwe: 'CWE-532' },
      { name: 'Open redirect', cwe: 'CWE-601' },
    ],
  },
  {
    source: 'iac',
    title: 'Infrastructure & workflows',
    cost: 'free',
    items: [
      { name: 'Untrusted event text reaching a workflow shell', cwe: 'CWE-78' },
      { name: 'Actions pinned to a mutable tag', cwe: 'CWE-829' },
      { name: 'Containers running as root, privileged pods', cwe: 'CWE-250' },
      { name: 'Public buckets and 0.0.0.0/0 in Terraform', cwe: 'CWE-284' },
    ],
  },
  {
    source: 'model',
    title: 'The agent review',
    cost: 'tokens',
    items: [
      { name: 'Logic errors and behaviour that changed for existing callers' },
      { name: 'SSRF, SQL injection, XSS and broken authorization, followed across files', cwe: 'CWE-918' },
      { name: 'Error handling, null and empty inputs, races and leaks' },
      { name: 'Each finding verified against the code before it is posted' },
    ],
  },
  {
    source: 'audit',
    title: 'Whole-repository audit',
    cost: 'tokens',
    items: [
      { name: 'Up to eight specialists: auth, access control, injection, config & CI, logic, data, frontend, LLM' },
      { name: 'semgrep, gitleaks, trivy, osv-scanner, bandit and checkov, bundled' },
      { name: 'A coverage map: what passed, failed, and was not tested' },
      { name: 'Your own slices from a repository, pinned to a commit' },
    ],
  },
];

export interface DepthRow {
  depth: 'light' | 'standard' | 'deep';
  finders: number;
  verified: boolean;
  bestFor: string;
}

export const DEPTHS: DepthRow[] = [
  { depth: 'light', finders: 1, verified: false, bestFor: 'Docs, config, small routine changes' },
  { depth: 'standard', finders: 1, verified: true, bestFor: 'Every pull request — the default' },
  { depth: 'deep', finders: 3, verified: true, bestFor: 'Auth, payments, anything you would page someone over' },
];
