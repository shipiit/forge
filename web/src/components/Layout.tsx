import { Link } from 'react-router-dom';
import { LogoMark } from './Logo';

const GITHUB = 'https://github.com/shipiit/forge';
const ext = { target: '_blank', rel: 'noopener noreferrer' } as const;

export function Header({ onLanding = false }: { onLanding?: boolean }) {
  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.07] bg-[rgb(7_7_9)]/70 backdrop-blur-xl">
      <div className="mx-auto flex h-[72px] max-w-7xl items-center px-7">
        <Link to="/" className="flex items-center gap-2.5 text-[17px] font-bold tracking-tight">
          <LogoMark size={26} />
          <span>SHIPIT&nbsp;<span className="dim font-medium">FORGE</span></span>
        </Link>
        <nav className="mx-auto hidden items-center gap-9 text-[13px] font-medium uppercase tracking-[0.12em] text-muted md:flex">
          {onLanding && <a href="#how" className="hover:text-text">How it works</a>}
          <Link to="/examples" className="hover:text-text">Examples</Link>
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
