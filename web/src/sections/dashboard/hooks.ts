import { useCallback, useEffect, useState } from 'react';

const THEME_KEY = 'forge.theme';

/**
 * Light or dark, remembered.
 *
 * Set on <html> as data-theme, which is what index.css keys the light token set
 * off. Only this page ever sets it, so the marketing pages stay dark.
 */
export function useTheme(): { theme: 'dark' | 'light'; toggle: () => void } {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(THEME_KEY);
    } catch {
      /* private mode */
    }
    const initial = (saved as 'dark' | 'light') || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    setTheme(initial);
    document.documentElement.dataset.theme = initial;
    // The rest of the site is dark-only, so put it back on the way out.
    return () => {
      document.documentElement.dataset.theme = 'dark';
    };
  }, []);

  const toggle = useCallback(() => {
    setTheme((t) => {
      const next = t === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch {
        /* private mode */
      }
      return next;
    });
  }, []);

  return { theme, toggle };
}
