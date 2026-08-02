import { Link } from 'react-router-dom';
import {
  Wrench, Search, ShieldAlert, ScanSearch, RefreshCw, MessageSquare,
  Blocks, CalendarClock, History, Github, Server, Gauge, BookOpen, Rocket, Building2, SlidersHorizontal,
} from 'lucide-react';
import { LogoMark } from './Logo';
import { NavMenu, type NavGroup } from './NavMenu';

const GITHUB = 'https://github.com/shipiit/forge';
const ext = { target: '_blank', rel: 'noopener noreferrer' } as const;

const CAPABILITIES: NavGroup[] = [
  {
    heading: 'On your issues & PRs',
    items: [
      { label: 'Fix an issue', to: '/github#fix', desc: 'Root cause, code change, tests, and a PR that closes it.', Icon: Wrench },
      { label: 'Review a pull request', to: '/github#review', desc: 'Inline findings scoped strictly to the changed lines.', Icon: Search },
      { label: 'Security review', to: '/github#security', desc: 'CWE-tagged findings with suggested fixes and live CVEs.', Icon: ShieldAlert },
      { label: 'Whole-repo audit', to: '/github#audit', desc: 'Follow untrusted input to dangerous sinks, repo-wide.', Icon: ScanSearch },
    ],
  },
  {
    heading: 'Running continuously',
    items: [
      { label: 'Change history', to: '/github#history', desc: 'A documented entry per commit, opened as a PR.', Icon: History },
      { label: 'Schedules & routines', to: '/schedules', desc: 'Cron, on-demand, or on any repository event.', Icon: CalendarClock },
      { label: 'Auto-fix failing CI', to: '/github#ci', desc: 'Reads the logs, pushes a fix, bounded to 2 tries.', Icon: RefreshCw },
      { label: 'Answer @mentions', to: '/github#mentions', desc: 'Explains code, or pushes a follow-up commit.', Icon: MessageSquare },
    ],
  },
];

const SETUP: NavGroup[] = [
  {
    heading: 'Get started',
    items: [
      { label: 'Quickstart', to: '/docs', desc: 'One workflow file and a key. Running in minutes.', Icon: Rocket },
      { label: 'Install as a GitHub App', to: '/github#install', desc: 'Permissions, webhook, deploy — every step.', Icon: Github },
      { label: 'GitHub Action', to: '/docs#action', desc: 'No server. Every input, with copyable recipes.', Icon: Rocket },
      { label: 'Configuration', to: '/docs#config', desc: 'agent.yml, env vars, filters, instruction files.', Icon: SlidersHorizontal },
      { label: 'Skills', to: '/docs#skills', desc: 'Built-in prompt packs, or define your own.', Icon: Blocks },
    ],
  },
  {
    heading: 'For teams',
    items: [
      { label: 'Whole-organization setup', to: '/github#org', desc: 'Roll out across every repo at once.', Icon: Building2 },
      { label: 'Enterprise Server', to: '/github#ghes', desc: 'Self-hosted GitHub, same features.', Icon: Server },
      { label: 'Cost control', to: '/github#cost', desc: 'Prompt caching, budgets, and what a run really costs.', Icon: Gauge },
      { label: 'Examples', to: '/examples', desc: 'Real output from live repositories.', Icon: BookOpen },
    ],
  },
];

export function Header({ onLanding = false }: { onLanding?: boolean }) {
  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.07] bg-[rgb(7_7_9)]/70 backdrop-blur-xl">
      <div className="mx-auto flex h-[72px] max-w-7xl items-center px-7">
        <Link to="/" className="flex items-center gap-2.5 text-[17px] font-bold tracking-tight">
          <LogoMark size={26} />
          <span>SHIPIT&nbsp;<span className="dim font-medium">FORGE</span></span>
        </Link>
        <nav className="mx-auto hidden items-center gap-9 text-[13px] font-medium uppercase tracking-[0.12em] text-muted md:flex">
          <NavMenu label="Capabilities" groups={CAPABILITIES} />
          <NavMenu label="Setup" groups={SETUP} />
          {onLanding && <a href="#how" className="hover:text-text">How it works</a>}
          <Link to="/docs" className="hover:text-text">Docs</Link>
        </nav>
        <a className="btn btn-white !rounded-none !uppercase !tracking-[0.12em]" href={GITHUB} {...ext}>
          Get it on GitHub
        </a>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-white/[0.07] pt-12">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-7 text-sm text-muted">
        <span className="text-base font-bold tracking-tight">SHIPIT <span className="dim font-medium">FORGE</span></span>
        <span>Autonomous GitHub coding agent · MIT</span>
        <span className="ml-auto flex gap-6 uppercase tracking-[0.12em] text-xs">
          <Link to="/docs" className="hover:text-text">Docs</Link>
          <a href={GITHUB} {...ext} className="hover:text-text">GitHub</a>
        </span>
      </div>
      <div aria-hidden className="select-none overflow-hidden px-7 text-center leading-[0.78]"
        style={{ fontSize: 'clamp(64px,20vw,260px)', fontWeight: 800, letterSpacing: '-0.06em', color: 'rgba(255,255,255,0.04)', marginTop: 12 }}>
        FORGE
      </div>
    </footer>
  );
}
