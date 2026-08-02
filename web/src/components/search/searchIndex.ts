/**
 * The documentation search index.
 *
 * Hand-maintained rather than scraped from the DOM: the pages are React
 * components, so there is no build-time text to crawl, and a hand-written index
 * lets each entry carry the words people actually search for (`cron`, `SSRF`,
 * `webhook secret`) even when the page phrases it differently.
 */

export interface SearchEntry {
  /** Route + anchor to navigate to. */
  path: string;
  /** Section this belongs to, shown as a breadcrumb. */
  section: string;
  title: string;
  summary: string;
  /** Extra terms that should match, beyond title and summary. */
  keywords: string[];
}

export const SEARCH_INDEX: SearchEntry[] = [
  {
    path: '/builder',
    section: 'Get started',
    title: 'Generate a workflow file',
    summary: 'Answer a few questions and download a ready-to-commit workflow, with a live preview you can edit.',
    keywords: ['builder', 'generator', 'yaml', 'download', 'create', 'wizard', 'form', 'get the code'],
  },
  {
    path: '/github#quickstart',
    section: 'Get started',
    title: 'Quick start',
    summary: 'Run it locally with the fake provider — no keys, about two minutes. Then add a real key.',
    keywords: ['install', 'cli', 'local', 'try', 'fake', 'npm', 'clone', 'forge setup', 'forge doctor'],
  },
  {
    path: '/github#install',
    section: 'Get started',
    title: 'Install as a GitHub App',
    summary: 'Permissions, the webhook secret, deploying the server, and verifying it end to end.',
    keywords: ['app', 'permissions', 'webhook', 'secret', 'private key', 'org-wide', 'install', 'smee', 'probot'],
  },
  {
    path: '/github#action',
    section: 'Get started',
    title: 'GitHub Action — every input',
    summary: 'Run it in your own CI with no server. Every input grouped by what it controls, plus recipes.',
    keywords: ['action', 'workflow', 'inputs', 'ci', 'yml', 'recipes', 'claude_args', 'max-turns'],
  },
  {
    path: '/github#providers',
    section: 'Models',
    title: 'Providers',
    summary: 'Nine providers behind one contract: Anthropic, OpenAI, Gemini, Vertex, Bedrock, Groq, Together, Ollama, or any compatible endpoint.',
    keywords: ['anthropic', 'openai', 'gemini', 'vertex', 'bedrock', 'groq', 'together', 'ollama', 'api key', 'model', 'fallback'],
  },
  {
    path: '/github#fix',
    section: 'Capabilities',
    title: 'Fix an issue',
    summary: 'Investigates, edits, adds a regression test, runs your suite, and opens a PR that closes the issue.',
    keywords: ['fix', 'issue', 'pr', 'tests', 'agent-fix', 'label', 'root cause', 'draft'],
  },
  {
    path: '/github#review',
    section: 'Capabilities',
    title: 'Review a pull request',
    summary: 'Inline findings scoped strictly to the changed files, with severity and a check run.',
    keywords: ['review', 'pr', 'inline', 'severity', 'nit', 'pre-existing', 'check run', 'review always', 'gate'],
  },
  {
    path: '/github#security',
    section: 'Capabilities',
    title: 'Security review',
    summary: 'CWE-tagged findings with suggested fixes, plus live Dependabot CVEs and SARIF ingestion.',
    keywords: ['security', 'cwe', 'ssrf', 'injection', 'secrets', 'dependabot', 'sarif', 'codeql', 'vulnerability'],
  },
  {
    path: '/github#audit',
    section: 'Capabilities',
    title: 'Whole-repository audit',
    summary: 'Maps entry points and follows untrusted input to dangerous sinks across the whole codebase.',
    keywords: ['audit', 'scan', 'repository', 'entry points', 'sinks', 'owasp'],
  },
  {
    path: '/github#history',
    section: 'Capabilities',
    title: 'Change history document',
    summary: 'One documented entry per merged change, written from that diff alone and opened as a PR.',
    keywords: ['history', 'changelog', 'commit', 'document', 'merge', 'record', 'CHANGE-HISTORY'],
  },
  {
    path: '/schedules',
    section: 'Capabilities',
    title: 'Schedules & routines',
    summary: 'Cron, on-demand, or event-driven saved configurations. Nightly digests, docs sweeps, standing audits.',
    keywords: ['schedule', 'cron', 'routine', 'nightly', 'digest', 'run', 'workflow_dispatch', 'automation', 'weekly'],
  },
  {
    path: '/github#ci',
    section: 'Capabilities',
    title: 'Auto-fix failing CI',
    summary: 'Reads the failing logs, corrects the code, re-runs the suite — bounded to two attempts.',
    keywords: ['ci', 'red', 'failing', 'build', 'checks', 'ci-fix', 'retry'],
  },
  {
    path: '/github#mentions',
    section: 'Capabilities',
    title: '@mentions',
    summary: 'Ask it anything in a thread; on a PR it can push a follow-up commit to that branch.',
    keywords: ['mention', 'comment', 'ask', 'trigger phrase', 'follow-up', 'commit'],
  },
  {
    path: '/github#skills',
    section: 'Configure',
    title: 'Skills',
    summary: 'Seven built-in prompt packs with enforced tool allowlists. Override from your repo or the workflow.',
    keywords: ['skill', 'prompt', 'code-review', 'triage', 'document', 'allowlist', 'custom', 'forge/skills'],
  },
  {
    path: '/github#config',
    section: 'Configure',
    title: 'Configuration',
    summary: 'agent.yml, environment variables, trigger filters, and the FORGE.md / REVIEW.md instruction files.',
    keywords: ['config', 'agent.yml', 'env', 'filters', 'regex', 'FORGE.md', 'REVIEW.md', 'trigger_phrase', 'max_nits'],
  },
  {
    path: '/github#commands',
    section: 'Configure',
    title: 'Commands',
    summary: 'Every comment command in one table: /fix, /review, /security, /audit, /run, and skills.',
    keywords: ['commands', 'slash', '/fix', '/review', '/audit', '/run', '/security', 'reference'],
  },
  {
    path: '/github#org',
    section: 'For teams',
    title: 'Whole-organization setup',
    summary: 'Roll it out across every repository — App org-wide, or the Action from a template repo.',
    keywords: ['organization', 'org', 'team', 'rollout', 'secrets', 'defaults', 'standards', 'enterprise'],
  },
  {
    path: '/github#deploy',
    section: 'For teams',
    title: 'Hosting the server',
    summary: 'Render, Cloud Run, or any Docker host. No database, no queue, no volume.',
    keywords: ['deploy', 'host', 'render', 'cloud run', 'docker', 'server', 'webhook'],
  },
  {
    path: '/github#ghes',
    section: 'For teams',
    title: 'GitHub Enterprise Server',
    summary: 'Self-hosted GitHub works identically — only the API base URL and clone host differ.',
    keywords: ['ghes', 'enterprise', 'self-hosted', 'on-prem', 'GHES_HOSTNAME', 'GITHUB_API_URL'],
  },
  {
    path: '/github#cost',
    section: 'For teams',
    title: 'Cost control',
    summary: 'Prompt caching, tool allowlists, compaction, and bounded loops — with spend on every comment.',
    keywords: ['cost', 'price', 'tokens', 'cache', 'caching', 'budget', 'cheap', 'spend', 'billing'],
  },
  {
    path: '/github#faq',
    section: 'Questions',
    title: 'FAQ',
    summary: 'Cost, safety, where your code goes, and whether it can merge anything.',
    keywords: ['faq', 'questions', 'safe', 'privacy', 'merge', 'approve', 'data'],
  },
  {
    path: '/examples',
    section: 'Questions',
    title: 'Live examples',
    summary: 'Real reviews, fixes, and findings produced on live repositories.',
    keywords: ['examples', 'demo', 'real', 'proof', 'showcase'],
  },
];

/**
 * Rank entries against a query. Title matches outrank keyword matches, which
 * outrank summary matches, so typing "cron" surfaces Schedules rather than
 * whichever page happens to mention it in passing.
 */
export function searchDocs(query: string, limit = 8): SearchEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const terms = q.split(/\s+/);

  const scored = SEARCH_INDEX.map((entry) => {
    const title = entry.title.toLowerCase();
    const keywords = entry.keywords.join(' ').toLowerCase();
    const summary = entry.summary.toLowerCase();

    let score = 0;
    for (const t of terms) {
      if (title.startsWith(t)) score += 12;
      else if (title.includes(t)) score += 8;
      if (keywords.includes(t)) score += 5;
      if (summary.includes(t)) score += 2;
      if (entry.section.toLowerCase().includes(t)) score += 1;
    }
    // Every term must land somewhere, or the entry is not a match at all.
    const allMatched = terms.every(
      (t) => title.includes(t) || keywords.includes(t) || summary.includes(t) || entry.section.toLowerCase().includes(t),
    );
    return { entry, score: allMatched ? score : 0 };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.entry);
}
