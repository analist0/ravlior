import { useEffect, useState, type RefObject } from 'react';
import { usePrefs } from '../app/prefs.tsx';
import { Icon } from './Icon.tsx';

const SCALES = [1, 1.125, 1.28] as const;

export function ReadingProgress({ target }: { target: RefObject<HTMLElement | null> }) {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    const measure = () => {
      const el = target.current;
      if (!el) return;
      const start = el.getBoundingClientRect().top + window.scrollY;
      const total = Math.max(el.offsetHeight - window.innerHeight * 0.4, 1);
      const seen = window.scrollY - start + 8;
      setPct(Math.round(Math.min(100, Math.max(0, (seen / total) * 100))));
    };
    measure();
    addEventListener('scroll', measure, { passive: true });
    addEventListener('resize', measure);
    return () => {
      removeEventListener('scroll', measure);
      removeEventListener('resize', measure);
    };
  }, [target]);
  return (
    <div className="read-progress" role="progressbar" aria-label="התקדמות קריאה" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

export function ReadingTools({ scale, onScale }: { scale: number; onScale: (n: number) => void }) {
  const { prefs, set } = usePrefs();
  return (
    <div className="reading-tools row" role="toolbar" aria-label="כלי קריאה">
      <div className="segmented" role="group" aria-label="גודל אות בקריאה">
        {SCALES.map((s) => (
          <button key={s} type="button" aria-pressed={scale === s} onClick={() => onScale(s)} style={{ padding: '0 14px', fontSize: `${s}rem` }}>א</button>
        ))}
      </div>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => set('fontScale', prefs.fontScale === 1.25 ? 1 : Math.min(1.25, prefs.fontScale + 0.125))}>
        גודל כללי
      </button>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => window.print()}>
        <Icon name="file" /> הדפסה
      </button>
    </div>
  );
}
