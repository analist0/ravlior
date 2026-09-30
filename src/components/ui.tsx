import { useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Link } from '../app/router.tsx';
import { Icon, type IconName } from './Icon.tsx';
import type { ContentType } from '../shared/types.ts';

export const TYPE_LABEL: Record<ContentType, string> = {
  video: 'וידאו', audio: 'אודיו', short: 'קצר', live: 'שידור מוקלט', book: 'ספר', leaflet: 'עלון', article: 'דבר תורה', answer: 'תשובה',
};
export const TYPE_ICON: Record<ContentType, IconName> = {
  video: 'watch', audio: 'listen', short: 'watch', live: 'watch', book: 'read', leaflet: 'file', article: 'read', answer: 'ask',
};

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'md'; icon?: IconName; busy?: boolean };
export function Button({ variant = 'primary', size = 'md', icon, busy, children, className, disabled, ...rest }: BtnProps) {
  return (
    <button
      type="button"
      className={`btn ${variant !== 'primary' ? `btn-${variant}` : ''} ${size === 'sm' ? 'btn-sm' : ''} ${className ?? ''}`}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...rest}
    >
      {icon && <Icon name={icon} />}
      {children}
    </button>
  );
}

export function LinkButton({ to, variant = 'primary', icon, children, size }: { to: string; variant?: 'primary' | 'secondary' | 'ghost'; icon?: IconName; children: ReactNode; size?: 'sm' }) {
  const external = /^https?:/.test(to);
  const cls = `btn ${variant !== 'primary' ? `btn-${variant}` : ''} ${size === 'sm' ? 'btn-sm' : ''}`;
  if (external)
    return (
      <a className={cls} href={to} target="_blank" rel="noopener noreferrer">
        {icon && <Icon name={icon} />}
        {children}
        <span className="sr-only">(נפתח בחלון חדש)</span>
      </a>
    );
  return (
    <Link className={cls} to={to}>
      {icon && <Icon name={icon} />}
      {children}
    </Link>
  );
}

export function IconButton({ icon, label, pressed, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string; pressed?: boolean }) {
  return (
    <button type="button" className="icon-btn" aria-label={label} title={label} aria-pressed={pressed} {...rest}>
      <Icon name={icon} />
    </button>
  );
}

export function Badge({ children, tone }: { children: ReactNode; tone?: 'accent' | 'gold' | 'warn' | 'danger' | 'ok' }) {
  return <span className={`badge ${tone ? `badge-${tone}` : ''}`}>{children}</span>;
}

interface FieldShell { label: string; hint?: string; error?: string | null; required?: boolean }
export function TextField({ label, hint, error, required, ...rest }: FieldShell & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}{required && <span aria-hidden="true"> *</span>}</label>
      <input id={id} className="input" aria-invalid={!!error || undefined} aria-describedby={`${id}-h ${id}-e`} required={required} {...rest} />
      {hint && <span id={`${id}-h`} className="hint">{hint}</span>}
      {error && <span id={`${id}-e`} className="error" role="alert">{error}</span>}
    </div>
  );
}
export function TextArea({ label, hint, error, required, ...rest }: FieldShell & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}{required && <span aria-hidden="true"> *</span>}</label>
      <textarea id={id} className="textarea" aria-invalid={!!error || undefined} aria-describedby={`${id}-h ${id}-e`} required={required} {...rest} />
      {hint && <span id={`${id}-h`} className="hint">{hint}</span>}
      {error && <span id={`${id}-e`} className="error" role="alert">{error}</span>}
    </div>
  );
}
export function SelectField({ label, hint, error, children, ...rest }: FieldShell & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} className="select" aria-invalid={!!error || undefined} aria-describedby={hint ? `${id}-h` : undefined} {...rest}>{children}</select>
      {hint && <span id={`${id}-h`} className="hint">{hint}</span>}
      {error && <span className="error" role="alert">{error}</span>}
    </div>
  );
}
export function Checkbox({ label, hint, ...rest }: { label: ReactNode; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div>
      <label className="check" htmlFor={id}>
        <input id={id} type="checkbox" {...rest} />
        <span>{label}{hint && <span className="soft" style={{ display: 'block' }}>{hint}</span>}</span>
      </label>
    </div>
  );
}

export function Skeleton({ h = 16, w = '100%', r }: { h?: number | string; w?: number | string; r?: number }) {
  return <div className="skeleton" style={{ height: h, width: w, borderRadius: r }} aria-hidden="true" />;
}
export function CardSkeletons({ n = 8 }: { n?: number }) {
  return (
    <div className="grid-cards" role="status" aria-live="polite">
      <span className="sr-only">טוען…</span>
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="card" aria-hidden="true">
          <div className="skeleton" style={{ aspectRatio: '16/9', borderRadius: 0 }} />
          <div className="card-body"><Skeleton h={18} /><Skeleton h={14} w="70%" /></div>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ icon = 'search', title, children, action }: { icon?: IconName; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="state">
      <Icon name={icon} />
      <h2>{title}</h2>
      {children && <div>{children}</div>}
      {action}
    </div>
  );
}
export function ErrorState({ error, onRetry }: { error: Error | string; onRetry?: () => void }) {
  return (
    <div className="state" role="alert">
      <Icon name="alert" />
      <h2>משהו השתבש</h2>
      <p style={{ margin: 0 }}>{typeof error === 'string' ? error : error.message}</p>
      {onRetry && <Button variant="secondary" icon="restore" onClick={onRetry}>לנסות שוב</Button>}
    </div>
  );
}
export function Notice({ children, tone, icon = 'info' }: { children: ReactNode; tone?: 'warn' | 'ok'; icon?: IconName }) {
  return (
    <div className={`notice ${tone ?? ''}`}>
      <Icon name={icon} />
      <div>{children}</div>
    </div>
  );
}

export function Breadcrumbs({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav className="breadcrumbs" aria-label="פירורי לחם">
      <ol>
        {items.map((it, i) => (
          <li key={i}>{it.to && i < items.length - 1 ? <Link to={it.to}>{it.label}</Link> : <span aria-current="page">{it.label}</span>}</li>
        ))}
      </ol>
    </nav>
  );
}

export function Pagination({ page, total, pageSize, hrefFor }: { page: number; total: number; pageSize: number; hrefFor: (p: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const nums = [...new Set([1, page - 1, page, page + 1, pages].filter((n) => n >= 1 && n <= pages))].sort((a, b) => a - b);
  return (
    <nav className="pagination" aria-label="עמודים">
      {page > 1 && <Link to={hrefFor(page - 1)} aria-label="העמוד הקודם"><Icon name="chevronRight" /></Link>}
      {nums.map((n, i) => (
        <span key={n} style={{ display: 'contents' }}>
          {i > 0 && n - nums[i - 1]! > 1 && <span aria-hidden="true">…</span>}
          <Link to={hrefFor(n)} aria-current={n === page ? 'page' : undefined} aria-label={`עמוד ${n}`}>{n}</Link>
        </span>
      ))}
      {page < pages && <Link to={hrefFor(page + 1)} aria-label="העמוד הבא"><Icon name="chevronLeft" /></Link>}
    </nav>
  );
}

export function formatHebDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? iso + 'T12:00:00Z' : iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
}

/** Splits "Main title / subtitle" as used on the channel. Titles are stored verbatim. */
export function splitTitle(title: string): [string, string | null] {
  const i = title.indexOf(' / ');
  const j = i >= 0 ? i : title.indexOf('/ ');
  if (j <= 0) return [title.trim(), null];
  return [title.slice(0, j).trim(), title.slice(j + (i >= 0 ? 3 : 2)).trim() || null];
}
