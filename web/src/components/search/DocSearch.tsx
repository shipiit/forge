import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CornerDownLeft, Search as SearchIcon, X } from 'lucide-react';
import { SEARCH_INDEX, searchDocs, type SearchEntry } from './searchIndex';

/** Show the platform's own modifier so the hint matches the user's keyboard. */
function modKey(): string {
  if (typeof navigator === 'undefined') return 'Ctrl';
  return /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent) ? '⌘' : 'Ctrl';
}

/**
 * Documentation search — a command palette over every section.
 *
 * Opens with ⌘K (Ctrl+K) or the button in the header, filters as you type, and
 * navigates on Enter. With an empty query it shows a starting set rather than a
 * blank panel, so it is useful before you know what to search for.
 */
export function DocSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const results = useMemo<SearchEntry[]>(
    () => (query.trim() ? searchDocs(query) : SEARCH_INDEX.slice(0, 6)),
    [query],
  );

  useEffect(() => setActive(0), [query]);

  // Global shortcut. Ignored while typing in another field so it never steals a
  // keystroke from the workflow builder's inputs.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && /^(INPUT|TEXTAREA)$/.test(target.tagName);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === '/' && !typing && !open) {
        e.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
    else setQuery('');
  }, [open]);

  const go = (entry?: SearchEntry) => {
    if (!entry) return;
    setOpen(false);
    navigate(entry.path);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') setOpen(false);
    else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % Math.max(1, results.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i - 1 + results.length) % Math.max(1, results.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(results[active]);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search documentation"
        className="inline-flex items-center gap-2 rounded-lg border border-white/[0.09] bg-white/[0.03] px-3 py-1.5 text-[12px] normal-case tracking-normal text-muted transition-colors hover:border-white/20 hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50"
      >
        <SearchIcon size={13} />
        <span className="hidden lg:inline">Search</span>
        <kbd className="hidden rounded border border-white/[0.12] px-1.5 py-0.5 font-mono text-[10px] text-muted lg:inline">
          {modKey()}K
        </kbd>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[200] flex items-start justify-center bg-black/85 px-5 pt-[12vh] backdrop-blur-md"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Search documentation"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={onKeyDown}
            /* Opaque, not the translucent .panel — page content must not show through. */
            className="w-full max-w-2xl overflow-hidden rounded-2xl border border-white/[0.12] bg-[rgb(13_13_17)] shadow-glow"
          >
            <div className="flex items-center gap-3 border-b border-white/[0.08] px-5 py-4">
              <SearchIcon size={16} className="shrink-0 text-muted" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search — try cron, webhook, SSRF, cost…"
                aria-label="Search query"
                className="w-full bg-transparent text-[15px] text-text placeholder:text-muted focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close search"
                className="shrink-0 rounded-md p-1 text-muted transition-colors hover:text-text"
              >
                <X size={15} />
              </button>
            </div>

            <div className="max-h-[52vh] overflow-auto p-2">
              {results.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted">
                  Nothing matches “{query}”. Try a capability, a setting name, or a provider.
                </p>
              ) : (
                <ul role="listbox" aria-label="Search results">
                  {results.map((r, i) => (
                    <li key={r.path}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={i === active}
                        onMouseEnter={() => setActive(i)}
                        onClick={() => go(r)}
                        className={`flex w-full items-start gap-3 rounded-xl px-4 py-3 text-left transition-colors ${
                          i === active ? 'bg-white/[0.06]' : ''
                        }`}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline gap-2">
                            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                              {r.section}
                            </span>
                          </span>
                          <span className="mt-1 block text-[14px] font-semibold text-text">{r.title}</span>
                          <span className="mt-0.5 block text-[12.5px] leading-snug text-muted">{r.summary}</span>
                        </span>
                        {i === active && (
                          <CornerDownLeft size={13} aria-hidden className="mt-1 shrink-0 text-muted" />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex items-center gap-4 border-t border-white/[0.08] px-5 py-2.5 text-[11px] text-muted">
              <span>↑↓ to navigate</span>
              <span>↵ to open</span>
              <span>esc to close</span>
              <span className="ml-auto">{SEARCH_INDEX.length} sections</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
