import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { readJSON, writeJSON } from './storage.ts';

export interface Prefs {
  theme: 'system' | 'light' | 'dark';
  motion: 'system' | 'reduce' | 'full';
  view: 'grid' | 'list';
  fontScale: number;
}
const DEFAULTS: Prefs = { theme: 'system', motion: 'system', view: 'grid', fontScale: 1 };
const KEY = 'prefs.v1';

interface Ctx { prefs: Prefs; set: <K extends keyof Prefs>(k: K, v: Prefs[K]) => void; reducedMotion: boolean }
const PrefsCtx = createContext<Ctx | null>(null);

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(() => ({ ...DEFAULTS, ...readJSON<Partial<Prefs>>(KEY, {}) }));
  const [systemReduce, setSystemReduce] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);

  useEffect(() => {
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setSystemReduce(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (prefs.theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = prefs.theme;
    if (prefs.motion === 'system') delete root.dataset.motion;
    else root.dataset.motion = prefs.motion;
    root.style.setProperty('--font-scale', String(prefs.fontScale));
    writeJSON(KEY, prefs);
  }, [prefs]);

  const set = useCallback(<K extends keyof Prefs>(k: K, v: Prefs[K]) => setPrefs((p) => ({ ...p, [k]: v })), []);
  const reducedMotion = prefs.motion === 'reduce' || (prefs.motion === 'system' && systemReduce);
  const value = useMemo(() => ({ prefs, set, reducedMotion }), [prefs, set, reducedMotion]);
  return <PrefsCtx.Provider value={value}>{children}</PrefsCtx.Provider>;
}

export function usePrefs(): Ctx {
  const c = useContext(PrefsCtx);
  if (!c) throw new Error('usePrefs outside PrefsProvider');
  return c;
}
