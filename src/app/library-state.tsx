import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { readJSON, writeJSON } from './storage.ts';

// Favorites and "continue learning" — public, per-browser, in localStorage. No login needed.
export interface ProgressEntry { t: number; d: number | null; at: number; title: string; slug: string }
interface Ctx {
  favorites: string[];
  toggleFavorite: (id: string) => boolean;
  isFavorite: (id: string) => boolean;
  progress: Record<string, ProgressEntry>;
  saveProgress: (id: string, e: ProgressEntry) => void;
  clearProgress: (id: string) => void;
}
const LibCtx = createContext<Ctx | null>(null);
const FAV = 'favorites.v1';
const PROG = 'progress.v1';

export function LibraryStateProvider({ children }: { children: ReactNode }) {
  const [favorites, setFavorites] = useState<string[]>(() => readJSON<string[]>(FAV, []));
  const [progress, setProgress] = useState<Record<string, ProgressEntry>>(() => readJSON(PROG, {}));
  useEffect(() => writeJSON(FAV, favorites), [favorites]);
  useEffect(() => writeJSON(PROG, progress), [progress]);

  const toggleFavorite = useCallback((id: string) => {
    const added = !favorites.includes(id);
    setFavorites((f) => (f.includes(id) ? f.filter((x) => x !== id) : [id, ...f].slice(0, 500)));
    return added;
  }, [favorites]);
  const saveProgress = useCallback((id: string, e: ProgressEntry) => {
    setProgress((p) => {
      const next = { ...p, [id]: e };
      const keys = Object.keys(next);
      if (keys.length > 200) {
        const oldest = keys.sort((a, b) => next[a]!.at - next[b]!.at)[0]!;
        delete next[oldest];
      }
      return next;
    });
  }, []);
  const clearProgress = useCallback((id: string) => setProgress(({ [id]: _, ...rest }) => rest), []);
  const value = useMemo(
    () => ({ favorites, toggleFavorite, isFavorite: (id: string) => favorites.includes(id), progress, saveProgress, clearProgress }),
    [favorites, toggleFavorite, progress, saveProgress, clearProgress],
  );
  return <LibCtx.Provider value={value}>{children}</LibCtx.Provider>;
}

export function useLibraryState(): Ctx {
  const c = useContext(LibCtx);
  if (!c) throw new Error('useLibraryState outside provider');
  return c;
}
