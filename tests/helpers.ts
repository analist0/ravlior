import { readFileSync } from 'node:fs';
import type { SeedData } from '../src/shared/types.ts';

export const seed: SeedData = JSON.parse(readFileSync(new URL('../src/data/seed.json', import.meta.url), 'utf8'));

/** Minimal in-memory localStorage for Node tests. */
export function installLocalStorage(): Map<string, string> {
  const store = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  } as Storage;
  return store;
}
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
