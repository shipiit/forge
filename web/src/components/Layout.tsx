import { Link } from 'react-router-dom';
import { LogoMark } from './Logo';

const GITHUB = 'https://github.com/shipiit/forge';

export function Header({ onLanding = false }: { onLanding?: boolean }) {
  return (
    <header>
      <div className="wrap nav">
        <Link className="brand" to="/">
          <LogoMark />
          ShipIT&nbsp;<span className="grad">Forge</span>
        </Link>
        <nav className="links">
          {onLanding ? (
            <>
              <a href="#features">Features</a>
              <a href="#how">How it works</a>
              <a href="#examples">Examples</a>
            </>
          ) : null}
          <Link to="/docs">Docs</Link>
          <a className="btn btn-g cta" href={GITHUB}>
            GitHub ↗
          </a>
        </nav>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer>
      <div className="wrap" style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <span className="brand" style={{ fontSize: 16 }}>
          ShipIT&nbsp;<span className="grad">Forge</span>
        </span>
        <span style={{ color: 'var(--mut2)' }}>Autonomous GitHub coding agent · MIT</span>
        <span style={{ marginLeft: 'auto' }}>
          <Link to="/docs">Docs</Link> · <a href={GITHUB}>GitHub</a>
        </span>
      </div>
    </footer>
  );
}
