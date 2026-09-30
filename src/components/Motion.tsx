import { useEffect, useState, type ReactNode } from 'react';
import { LazyMotion, domAnimation, m, AnimatePresence } from 'motion/react';
import { usePrefs } from '../app/prefs.tsx';

// Motion is used for meaning (entrance, layout changes), only on transform/opacity,
// and is disabled entirely under reduced motion.

export function Reveal({ children, delay = 0, as = 'div' }: { children: ReactNode; delay?: number; as?: 'div' | 'section' }) {
  const { reducedMotion } = usePrefs();
  if (reducedMotion) return as === 'section' ? <section>{children}</section> : <div>{children}</div>;
  const C = as === 'section' ? m.section : m.div;
  return (
    <LazyMotion features={domAnimation} strict>
      <C
        initial={{ opacity: 0, y: 14 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '0px 0px -60px 0px' }}
        transition={{ type: 'spring', stiffness: 260, damping: 30, delay }}
      >
        {children}
      </C>
    </LazyMotion>
  );
}

/** Animated swap between grid/list (or any keyed content). */
export function Swap({ k, children }: { k: string; children: ReactNode }) {
  const { reducedMotion } = usePrefs();
  if (reducedMotion) return <>{children}</>;
  return (
    <LazyMotion features={domAnimation} strict>
      <AnimatePresence mode="wait" initial={false}>
        <m.div key={k} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
          {children}
        </m.div>
      </AnimatePresence>
    </LazyMotion>
  );
}

/** True while the tab is visible — used to pause decorative animation in the background. */
export function usePageVisible(): boolean {
  const [visible, setVisible] = useState(() => !document.hidden);
  useEffect(() => {
    const on = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  return visible;
}

/** Decorative hero art: book shelves and a warm lamp light. Pure SVG, no raster, no WebGL. */
export function HeroArt() {
  const { reducedMotion } = usePrefs();
  const visible = usePageVisible();
  const animate = !reducedMotion && visible;
  const spines = [
    [0, 34, 118], [36, 22, 104], [60, 28, 126], [90, 18, 96], [110, 30, 120], [142, 24, 110], [168, 34, 128], [204, 20, 100],
    [226, 28, 116], [256, 22, 124], [280, 32, 106], [314, 26, 122],
  ];
  return (
    <svg className="hero-art" viewBox="0 0 400 400" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="shelf" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--accent)" stopOpacity="0.9" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0.55" />
        </linearGradient>
      </defs>
      {[0, 1].map((row) => (
        <g key={row} transform={`translate(${24 + row * 8}, ${90 + row * 150})`}>
          {spines.map(([x, w, h], i) => (
            <rect
              key={i}
              x={x}
              y={128 - (h! - row * 8)}
              width={w! - 3}
              height={h! - row * 8}
              rx="3"
              fill={i % 5 === 2 ? 'var(--gold)' : 'url(#shelf)'}
              opacity={i % 5 === 2 ? 0.75 : 0.18 + ((i * 7) % 5) * 0.08}
            />
          ))}
          <rect x="-8" y="128" width="360" height="6" rx="3" fill="var(--text)" opacity="0.12" />
        </g>
      ))}
      <g opacity="0.5" stroke="var(--gold)" strokeWidth="1">
        {animate && <animate attributeName="opacity" values="0.35;0.6;0.35" dur="10s" repeatCount="indefinite" />}
        {Array.from({ length: 7 }, (_, i) => (
          <line key={i} x1="280" y1="40" x2={120 + i * 40} y2="420" strokeOpacity={0.12 + (i % 3) * 0.04} />
        ))}
      </g>
    </svg>
  );
}
