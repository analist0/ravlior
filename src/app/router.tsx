import { createContext, useCallback, useContext, useEffect, useMemo, useState, type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from 'react';

// Minimal History-API router (no dependency). Supports path params and URL search params.
interface Loc { pathname: string; search: string; hash: string }
interface RouterCtx { loc: Loc; navigate: (to: string, opts?: { replace?: boolean; keepScroll?: boolean }) => void }
const Ctx = createContext<RouterCtx | null>(null);

const current = (): Loc => ({ pathname: decodeURI(location.pathname), search: location.search, hash: location.hash });

export function RouterProvider({ children }: { children: ReactNode }) {
  const [loc, setLoc] = useState<Loc>(current);
  useEffect(() => {
    const onPop = () => setLoc(current());
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, []);
  const navigate = useCallback((to: string, opts: { replace?: boolean; keepScroll?: boolean } = {}) => {
    const url = new URL(to, location.href);
    if (url.origin !== location.origin) {
      location.assign(url.toString());
      return;
    }
    const samePath = url.pathname === location.pathname;
    history[opts.replace ? 'replaceState' : 'pushState'](null, '', url.pathname + url.search + url.hash);
    setLoc(current());
    if (!opts.keepScroll && !(samePath && url.hash)) scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, []);
  const value = useMemo(() => ({ loc, navigate }), [loc, navigate]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRouter(): RouterCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useRouter outside RouterProvider');
  return c;
}

export function useSearchParams(): [URLSearchParams, (next: Record<string, string | number | null | undefined>, opts?: { replace?: boolean }) => void] {
  const { loc, navigate } = useRouter();
  const params = useMemo(() => new URLSearchParams(loc.search), [loc.search]);
  const update = useCallback(
    (next: Record<string, string | number | null | undefined>, opts: { replace?: boolean } = {}) => {
      const p = new URLSearchParams(loc.search);
      for (const [k, v] of Object.entries(next)) {
        if (v === null || v === undefined || v === '') p.delete(k);
        else p.set(k, String(v));
      }
      const s = p.toString();
      navigate(loc.pathname + (s ? '?' + s : ''), { replace: opts.replace, keepScroll: true });
    },
    [loc.pathname, loc.search, navigate],
  );
  return [params, update];
}

export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const pp = pattern.split('/').filter(Boolean);
  const sp = path.split('/').filter(Boolean);
  if (pattern.endsWith('/*')) {
    if (sp.length < pp.length - 1) return null;
  } else if (pp.length !== sp.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < pp.length; i++) {
    const a = pp[i]!;
    if (a === '*') {
      params['*'] = sp.slice(i).join('/');
      return params;
    }
    const b = sp[i];
    if (b === undefined) return null;
    if (a.startsWith(':')) params[a.slice(1)] = b;
    else if (a !== b) return null;
  }
  return params;
}

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { to: string; replace?: boolean };
export function Link({ to, replace, onClick, children, ...rest }: LinkProps) {
  const { navigate, loc } = useRouter();
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || rest.target === '_blank') return;
    const url = new URL(to, location.href);
    if (url.origin !== location.origin) return;
    e.preventDefault();
    navigate(to, { replace });
  };
  const active = loc.pathname === to || (to !== '/' && loc.pathname.startsWith(to + '/'));
  return (
    <a href={to} onClick={handle} aria-current={active && !to.includes('?') ? 'page' : undefined} {...rest}>
      {children}
    </a>
  );
}
