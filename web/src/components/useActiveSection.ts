import { useEffect, useState } from 'react';

/**
 * Scrollspy: returns the id of the section currently being read.
 *
 * Uses IntersectionObserver against a band near the top of the viewport rather
 * than scroll math, so it stays accurate under the sticky header and costs
 * nothing on the main thread while idle.
 *
 * The band is the tricky part: a plain `isIntersecting` check flickers between
 * two sections that are both on screen, so we track every intersecting id and
 * take the topmost in document order.
 */
export function useActiveSection(ids: string[], headerOffset = 96): string {
  const [active, setActive] = useState(ids[0] ?? '');
  const key = ids.join('|');

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const list = key.split('|');
    const visible = new Set<string>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        const first = list.find((id) => visible.has(id));
        if (first) {
          setActive(first);
          return;
        }
        // Nothing in the band — a long section fills the viewport. Keep the
        // last section whose top has already scrolled under the header.
        const passed = list.filter((id) => {
          const el = document.getElementById(id);
          return el ? el.getBoundingClientRect().top <= headerOffset : false;
        });
        if (passed.length) setActive(passed[passed.length - 1]!);
      },
      { rootMargin: `-${headerOffset}px 0px -70% 0px`, threshold: 0 },
    );

    for (const id of list) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [key, headerOffset]);

  return active;
}
