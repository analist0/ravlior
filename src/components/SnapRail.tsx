import { useRef, type ReactNode } from 'react';
import { usePrefs } from '../app/prefs.tsx';
import { Icon } from './Icon.tsx';

/** Horizontal snap row. Swipe on touch; buttons for keyboard and pointer. */
export function SnapRail({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLUListElement>(null);
  const { reducedMotion } = usePrefs();
  const move = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    const cards = [...el.querySelectorAll<HTMLElement>(':scope > li')];
    if (!cards.length) return;
    const box = el.getBoundingClientRect();
    let first = -1;
    let last = -1;
    cards.forEach((c, i) => {
      const r = c.getBoundingClientRect();
      if (r.right > box.left + 8 && r.left < box.right - 8) {
        if (first < 0) first = i;
        last = i;
      }
    });
    const index = dir === 1 ? Math.min(cards.length - 1, (last < 0 ? 0 : last) + 1) : Math.max(0, (first < 0 ? 0 : first) - 1);
    cards[index]?.scrollIntoView({ inline: 'start', block: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' });
  };
  return (
    <div className="snap-rail">
      <div className="snap-rail-nav">
        <button type="button" className="icon-btn" aria-label={`${label}: אחורה`} onClick={() => move(-1)}><Icon name="chevronRight" /></button>
        <button type="button" className="icon-btn" aria-label={`${label}: קדימה`} onClick={() => move(1)}><Icon name="chevronLeft" /></button>
      </div>
      <ul ref={ref} className="rail" aria-label={label}>{children}</ul>
    </div>
  );
}
