/**
 * The hub diagram: Forge in the middle, what it reads or produces either side.
 * Every node names something the code actually does; the test beside this
 * file keeps each side the same length so the diagram stays symmetrical.
 */

export type HubIcon =
  | 'diff' | 'file' | 'callers' | 'history' | 'image'
  | 'rules' | 'context' | 'scan' | 'package' | 'thread'
  | 'key' | 'syringe' | 'folder' | 'globe' | 'lock'
  | 'skull' | 'bug' | 'script' | 'cloud' | 'workflow'
  | 'comment' | 'suggest' | 'summary' | 'check' | 'sarif'
  | 'issue' | 'pr' | 'commit' | 'doc' | 'chart'
  | 'model' | 'bolt' | 'layers' | 'plug' | 'fallback';

export interface HubNode {
  title: string;
  detail: string;
  icon: HubIcon;
  /** A brand mark in public/logos (Simple Icons, CC0), drawn in the current colour. */
  logo?: string;
}

export interface HubTab {
  id: string;
  label: string;
  /** Lucide icon for the tab itself. */
  tabIcon: 'eye' | 'shield' | 'send' | 'cpu';
  center: { title: string; detail: string };
  left: HubNode[];
  right: HubNode[];
  caption: string;
}

export const HUB_TABS: HubTab[] = [
  {
    id: 'reads',
    label: 'What it reads',
    tabIcon: 'eye',
    center: { title: 'Forge', detail: 'reads before it judges' },
    left: [
      { title: 'The diff', detail: 'every changed hunk', icon: 'diff' },
      { title: 'Changed files', detail: 'whole, not just hunks', icon: 'file' },
      { title: 'Callers & sinks', detail: 'followed across files', icon: 'callers' },
      { title: 'Git history', detail: 'why the line exists', icon: 'history' },
      { title: 'Screenshots', detail: 'images in the PR body', icon: 'image' },
    ],
    right: [
      { title: 'REVIEW.md', detail: 'from the base branch', icon: 'rules' },
      { title: 'FORGE.md · AGENTS.md', detail: 'project conventions', icon: 'context' },
      { title: 'Scanner results', detail: 'what was already found', icon: 'scan' },
      { title: 'Lockfiles', detail: 'checked against OSV.dev', icon: 'package' },
      { title: 'Earlier threads', detail: 'never repeats itself', icon: 'thread' },
    ],
    caption: 'Rules come from the branch being merged into, so a pull request cannot rewrite how it is reviewed.',
  },
  {
    id: 'checks',
    label: 'What it checks',
    tabIcon: 'shield',
    center: { title: 'Forge', detail: 'scanners, then agents' },
    left: [
      { title: 'Secrets', detail: '31 provider shapes + entropy', icon: 'key' },
      { title: 'Injection', detail: 'SQL, shell, template', icon: 'syringe' },
      { title: 'Path traversal', detail: 'files outside the root', icon: 'folder' },
      { title: 'SSRF', detail: 'requests you did not mean', icon: 'globe' },
      { title: 'Authorization', detail: 'every path, every role', icon: 'lock' },
    ],
    right: [
      { title: 'Malicious packages', detail: 'OpenSSF feed', icon: 'skull' },
      { title: 'Known CVEs', detail: 'fixed version + command', icon: 'bug' },
      { title: 'Install scripts', detail: 'new in an update', icon: 'script' },
      { title: 'Infrastructure', detail: 'Docker, k8s, Terraform', icon: 'cloud' },
      { title: 'Workflows', detail: 'pins, untrusted input', icon: 'workflow' },
    ],
    caption: 'The scanners are deterministic and free; the agents decide what is reachable and worth a comment.',
  },
  {
    id: 'posts',
    label: 'Where results go',
    tabIcon: 'send',
    center: { title: 'Forge', detail: 'one problem, one comment' },
    left: [
      { title: 'Inline comments', detail: 'on the exact line', icon: 'comment' },
      { title: 'Suggested changes', detail: 'one-click fixes', icon: 'suggest' },
      { title: 'Review summary', detail: 'verdict + what was dropped', icon: 'summary' },
      { title: 'Check run', detail: 'gates the merge if required', icon: 'check' },
      { title: 'Code scanning', detail: 'annotations per finding', icon: 'sarif' },
    ],
    right: [
      { title: 'Issues', detail: 'findings worth tracking', icon: 'issue' },
      { title: 'Fix pull requests', detail: 'from /fix or a label', icon: 'pr' },
      { title: 'CI fix commits', detail: 'bounded to two tries', icon: 'commit' },
      { title: 'Change history', detail: 'one entry per merge', icon: 'doc' },
      { title: 'Usage dashboard', detail: 'runs, tokens, findings', icon: 'chart' },
    ],
    caption: 'Nothing merges without you: every change Forge makes arrives as a pull request.',
  },
  {
    id: 'models',
    label: 'Models',
    tabIcon: 'cpu',
    center: { title: 'Forge', detail: 'your key, your choice' },
    left: [
      { title: 'Anthropic', detail: 'Claude, with caching', icon: 'model', logo: 'anthropic' },
      { title: 'OpenAI', detail: 'GPT and o-series', icon: 'model', logo: 'openai' },
      { title: 'Gemini', detail: 'API key', icon: 'model', logo: 'googlegemini' },
      { title: 'Vertex AI', detail: 'Google Cloud', icon: 'model', logo: 'googlecloud' },
      { title: 'AWS Bedrock', detail: 'in your account', icon: 'cloud' },
    ],
    right: [
      { title: 'Groq', detail: 'fast inference', icon: 'bolt' },
      { title: 'Together', detail: 'open models', icon: 'layers' },
      { title: 'Ollama', detail: 'on your own machine', icon: 'model', logo: 'ollama' },
      { title: 'OpenAI-compatible', detail: 'any endpoint', icon: 'plug' },
      { title: 'Fallback chain', detail: 'survives an outage', icon: 'fallback' },
    ],
    caption: 'Run it in your own CI or on your own server. No Forge-operated service ever holds your code or key.',
  },
];
