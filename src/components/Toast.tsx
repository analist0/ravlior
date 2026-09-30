import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

interface Toast { id: number; text: string; tone: 'info' | 'error'; action?: { label: string; run: () => void } }
type Push = (text: string, opts?: { tone?: 'info' | 'error'; action?: Toast['action']; ms?: number }) => void;
const Ctx = createContext<Push | null>(null);
let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback<Push>((text, opts = {}) => {
    const id = ++seq;
    setToasts((t) => [...t.slice(-2), { id, text, tone: opts.tone ?? 'info', action: opts.action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), opts.ms ?? (opts.action ? 8000 : 4500));
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone === 'error' ? 'error' : ''}`} role={t.tone === 'error' ? 'alert' : undefined}>
            <span>{t.text}</span>
            {t.action && (
              <button type="button" onClick={() => { t.action!.run(); setToasts((x) => x.filter((y) => y.id !== t.id)); }}>
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
export function useToast(): Push {
  const c = useContext(Ctx);
  if (!c) throw new Error('useToast outside provider');
  return c;
}
