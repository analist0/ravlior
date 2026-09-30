import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Dialog as D, Popover } from 'radix-ui';
import { Link, useRouter } from '../app/router.tsx';
import { usePrefs } from '../app/prefs.tsx';
import { useAsync, useRepo } from '../data/repo.ts';
import { Icon } from './Icon.tsx';
import { Badge, TYPE_LABEL, splitTitle } from './ui.tsx';
import { IS_DEMO } from '../app/config.ts';
import type { ContentItem, Menu } from '../shared/types.ts';

export function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 40 40" aria-hidden="true">
      <rect width="40" height="40" rx="11" fill="var(--accent)" />
      <path d="M20 7c-5 6.5-5 11.5 0 16 5-4.5 5-9.5 0-16z" fill="var(--gold-300)" />
      <rect x="10" y="26" width="20" height="3" rx="1.5" fill="var(--ivory-100)" />
      <rect x="13" y="31" width="14" height="3" rx="1.5" fill="var(--ivory-100)" opacity=".7" />
    </svg>
  );
}

export function DemoBanner() {
  if (!IS_DEMO) return null;
  return (
    <div className="demo-banner" role="note">
      <div className="container">
        <Icon name="alert" />
        <strong>מצב הדגמה</strong>
        <span className="short">לא מחובר למסד נתונים; שינויים נשמרים בדפדפן זה בלבד.</span>
        <span className="long">האתר אינו מחובר למסד נתונים. התכנים הם מטא־דאטה ממקורות ציבוריים, ושינויים נשמרים בדפדפן זה בלבד.</span>
      </div>
    </div>
  );
}

export function DisplaySettings() {
  const { prefs, set } = usePrefs();
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button className="icon-btn" aria-label="הגדרות תצוגה ונגישות"><Icon name="settings" /></button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="popover" dir="rtl" sideOffset={8} align="end">
          <strong>תצוגה ונגישות</strong>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="field-label">ערכת צבעים</legend>
            <div className="segmented" role="group">
              {(['system', 'light', 'dark'] as const).map((t) => (
                <button key={t} aria-pressed={prefs.theme === t} onClick={() => set('theme', t)} style={{ padding: '0 12px' }}>
                  {t === 'system' ? 'אוטומטי' : t === 'light' ? 'בהיר' : 'כהה'}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="field-label">תנועה ואנימציה</legend>
            <div className="segmented" role="group">
              {(['system', 'reduce', 'full'] as const).map((t) => (
                <button key={t} aria-pressed={prefs.motion === t} onClick={() => set('motion', t)} style={{ padding: '0 12px' }}>
                  {t === 'system' ? 'לפי המכשיר' : t === 'reduce' ? 'הפחתת תנועה' : 'מלאה'}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="field-label">גודל טקסט</legend>
            <div className="segmented" role="group">
              {[1, 1.125, 1.25].map((s) => (
                <button key={s} aria-pressed={prefs.fontScale === s} onClick={() => set('fontScale', s)} style={{ padding: '0 14px', fontSize: `${s}rem` }}>א</button>
              ))}
            </div>
          </fieldset>
          <Link to="/p/accessibility" className="soft">הצהרת נגישות</Link>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function Header({ menu, onSearch }: { menu: Menu | undefined; onSearch: () => void }) {
  return (
    <header className="site-header">
      <div className="container">
        <Link to="/" className="brand" aria-label="אור המאיר — דף הבית">
          <BrandMark />
          <span>
            <span className="brand-name">אור המאיר</span>
            <span className="brand-sub">תורתו של הרב ליאור כהן</span>
          </span>
        </Link>
        <nav className="main-nav" aria-label="ניווט ראשי">
          {(menu?.items ?? []).map((m) => <Link key={m.href} to={m.href}>{m.label}</Link>)}
        </nav>
        <div className="header-actions">
          <button className="search-trigger" onClick={onSearch}>
            <Icon name="search" /> חיפוש בספרייה <kbd className="ltr">/</kbd>
          </button>
          <button className="icon-btn search-icon-only" onClick={onSearch} aria-label="חיפוש"><Icon name="search" /></button>
          <Link to="/favorites" className="icon-btn" aria-label="המועדפים שלי"><Icon name="bookmark" /></Link>
          <DisplaySettings />
        </div>
      </div>
    </header>
  );
}

export function BottomNav({ onSearch }: { onSearch: () => void }) {
  return (
    <nav className="bottom-nav" aria-label="ניווט מהיר">
      <Link to="/"><Icon name="home" />בית</Link>
      <Link to="/library"><Icon name="library" />ספרייה</Link>
      <button onClick={onSearch}><Icon name="search" />חיפוש</button>
      <Link to="/ask"><Icon name="ask" />לשאול</Link>
      <Link to="/favorites"><Icon name="bookmark" />שמורים</Link>
    </nav>
  );
}

export function Footer({ menu }: { menu: Menu | undefined }) {
  return (
    <footer className="site-footer">
      <div className="container">
        <nav aria-label="קישורי תחתית">
          {(menu?.items ?? []).map((m) => <Link key={m.href} to={m.href}>{m.label}</Link>)}
          <Link to="/admin">כניסת צוות</Link>
        </nav>
        <p>תורת מרן הרב מאיר מאזוז זצ״ל מוצגת עם ייחוס למקור. התכנים מקושרים למקורותיהם; זכויות השימוש בכל פריט מצוינות בדף הפריט.</p>
        <p className="soft">האתר אינו אתר רשמי עד לאישור מטעם הרב והמוסדות.</p>
      </div>
    </footer>
  );
}

/** Search command panel: keyboard-first, debounced, results link to item pages. */
export function SearchPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const repo = useRepo();
  const { navigate } = useRouter();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => { const t = setTimeout(() => setDebounced(q), 180); return () => clearTimeout(t); }, [q]);
  const res = useAsync(() => (debounced.trim().length >= 2 ? repo.listContent({ q: debounced, pageSize: 8 }) : Promise.resolve(null)), [debounced, repo]);
  const items: ContentItem[] = useMemo(() => res.data?.items ?? [], [res.data]);
  useEffect(() => setActive(0), [debounced]);
  const go = (to: string) => { onOpenChange(false); setQ(''); navigate(to); };

  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="dialog-overlay" />
        <D.Content className="dialog search-panel" dir="rtl" aria-describedby={undefined}>
          <D.Title className="sr-only">חיפוש בספרייה</D.Title>
          <div className="search-input-wrap">
            <Icon name="search" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="חפשו שיעור, נושא או פרשה…"
              aria-label="חיפוש"
              role="combobox"
              aria-expanded={items.length > 0}
              aria-controls="search-results"
              aria-activedescendant={items[active] ? `sr-${items[active]!.id}` : undefined}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(items.length, a + 1)); }
                if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const it = items[active];
                  go(it ? `/item/${it.slug}` : `/library?q=${encodeURIComponent(q)}`);
                }
              }}
            />
            <D.Close asChild><button className="icon-btn" aria-label="סגירת החיפוש"><Icon name="close" /></button></D.Close>
          </div>
          <ul id="search-results" className="search-results" role="listbox" ref={listRef} aria-label="תוצאות">
            {debounced.trim().length < 2 && <li className="soft" style={{ padding: 'var(--s-4)' }}>הקלידו לפחות שתי אותיות. ניקוד וגרשיים אינם נדרשים.</li>}
            {res.loading && debounced.trim().length >= 2 && <li className="soft" style={{ padding: 'var(--s-4)' }} role="status">מחפש…</li>}
            {!res.loading && debounced.trim().length >= 2 && items.length === 0 && <li className="soft" style={{ padding: 'var(--s-4)' }}>לא נמצאו תוצאות.</li>}
            {items.map((it, i) => (
              <li key={it.id} id={`sr-${it.id}`} role="option" aria-selected={i === active}>
                <a href={`/item/${it.slug}`} aria-selected={i === active} onClick={(e) => { e.preventDefault(); go(`/item/${it.slug}`); }} onMouseEnter={() => setActive(i)}>
                  <Badge tone="accent">{TYPE_LABEL[it.type]}</Badge>
                  <span>{splitTitle(it.title)[0]}</span>
                </a>
              </li>
            ))}
            {items.length > 0 && (
              <li role="option" aria-selected={active === items.length}>
                <a href={`/library?q=${encodeURIComponent(q)}`} aria-selected={active === items.length} onClick={(e) => { e.preventDefault(); go(`/library?q=${encodeURIComponent(q)}`); }}>
                  <Icon name="library" /> כל התוצאות עבור „{q}” ({res.data?.total ?? 0})
                </a>
              </li>
            )}
          </ul>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

export function PageShell({ children }: { children: ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
