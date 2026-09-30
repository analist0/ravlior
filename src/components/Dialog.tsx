import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Dialog as D } from 'radix-ui';
import { Button } from './ui.tsx';
import { Icon } from './Icon.tsx';

// Radix Dialog provides focus trap, Escape, aria-modal and focus return. Direction is inherited (RTL).
export function Modal({ open, onOpenChange, title, description, children, className }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; children: ReactNode; className?: string;
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="dialog-overlay" />
        <D.Content className={`dialog ${className ?? ''}`} dir="rtl" aria-describedby={description ? undefined : undefined}>
          <div className="spread" style={{ marginBottom: 'var(--s-3)' }}>
            <D.Title style={{ margin: 0 }}>{title}</D.Title>
            <D.Close asChild>
              <button className="icon-btn" aria-label="סגירה"><Icon name="close" /></button>
            </D.Close>
          </div>
          {description ? <D.Description className="muted">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
          {children}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

interface ConfirmOpts { title: string; body?: ReactNode; confirmLabel?: string; danger?: boolean }
const ConfirmCtx = createContext<((o: ConfirmOpts) => Promise<boolean>) | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOpts | null>(null);
  const resolver = useRef<(v: boolean) => void>(undefined);
  const confirm = useCallback((o: ConfirmOpts) => {
    setOpts(o);
    return new Promise<boolean>((res) => { resolver.current = res; });
  }, []);
  const close = (v: boolean) => {
    resolver.current?.(v);
    setOpts(null);
  };
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Modal open={!!opts} onOpenChange={(o) => !o && close(false)} title={opts?.title ?? ''}>
        {opts?.body && <div className="muted">{opts.body}</div>}
        <div className="dialog-actions">
          <Button variant="secondary" onClick={() => close(false)}>ביטול</Button>
          <Button variant={opts?.danger ? 'danger' : 'primary'} onClick={() => close(true)} autoFocus>{opts?.confirmLabel ?? 'אישור'}</Button>
        </div>
      </Modal>
    </ConfirmCtx.Provider>
  );
}
export function useConfirm() {
  const c = useContext(ConfirmCtx);
  if (!c) throw new Error('useConfirm outside provider');
  return c;
}
