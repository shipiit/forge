/**
 * Forge beside the two managed reviewers people compare it with.
 *
 * Every cell for another product comes from its public documentation (Claude
 * Code Review docs; Cursor's "Building a better Bugbot"). Where a page says
 * nothing, the cell says "Not documented" — never "No". Being wrong about a
 * competitor in public costs more than any row could win.
 */

export type Cell = { kind: 'yes'; text?: string } | { kind: 'text'; text: string } | { kind: 'unknown' };

export interface ComparisonRow {
  feature: string;
  forge: Cell;
  claude: Cell;
  bugbot: Cell;
}

const yes = (text?: string): Cell => ({ kind: 'yes', text });
const text = (t: string): Cell => ({ kind: 'text', text: t });
const unknown: Cell = { kind: 'unknown' };

export const PRODUCTS = [
  { key: 'forge', name: 'ShipIT Forge' },
  { key: 'claude', name: 'Claude Code Review' },
  { key: 'bugbot', name: 'Cursor Bugbot' },
] as const;

export const COMPARISON: ComparisonRow[] = [
  {
    feature: 'Separate verification before posting',
    forge: yes('Second agent re-reads every finding'),
    claude: yes('Verification step filters false positives'),
    bugbot: yes('Validator model (launch design)'),
  },
  {
    feature: 'Several reviewers on one change',
    forge: yes('Three focused reviewers at deep'),
    claude: yes('Several agents in parallel'),
    bugbot: text('One agent that decides where to dig'),
  },
  {
    feature: 'Thoroughness levels',
    forge: yes('light · standard · deep'),
    claude: yes('Quick · Standard · Deep'),
    bugbot: unknown,
  },
  {
    feature: 'Inline comments, summary and check run',
    forge: yes(),
    claude: yes(),
    bugbot: text('Comments on the pull request'),
  },
  {
    feature: 'Repository rules for the reviewer',
    forge: yes('REVIEW.md, FORGE.md, AGENTS.md, skills'),
    claude: yes('REVIEW.md and CLAUDE.md'),
    bugbot: yes('Bugbot rules'),
  },
  {
    feature: 'Rules read from the base branch, not the PR',
    forge: yes(),
    claude: yes(),
    bugbot: unknown,
  },
  {
    feature: 'Comment commands limited to write access',
    forge: yes(),
    claude: yes(),
    bugbot: unknown,
  },
  {
    feature: 'Deterministic secret, code and infrastructure scanners',
    forge: yes('Free, before any model call'),
    claude: unknown,
    bugbot: unknown,
  },
  {
    feature: 'Malicious packages and CVEs in changed lockfiles',
    forge: yes('OSV.dev, install scripts, sources'),
    claude: unknown,
    bugbot: unknown,
  },
  {
    feature: 'Fixes, not just findings',
    forge: yes('One-click suggestions, @mention commits, CI fixes, issue → PR'),
    claude: text('Review is read-only; fixes via the Claude GitHub Action'),
    bugbot: yes('Autofix (beta)'),
  },
  {
    feature: 'Model choice',
    forge: yes('Nine providers, with a fallback chain'),
    claude: text('Claude models, chosen by the service'),
    bugbot: unknown,
  },
  {
    feature: 'Where it runs',
    forge: text('Your CI or your server'),
    claude: text('Anthropic infrastructure'),
    bugbot: unknown,
  },
  {
    feature: 'How you pay',
    forge: text('Open source · your own API key'),
    claude: text('Team & Enterprise plans · token-billed'),
    bugbot: unknown,
  },
];
