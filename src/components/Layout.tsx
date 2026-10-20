import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Dialog as D, Popover } from 'radix-ui';
import { Link, useRouter } from '../app/router.tsx';
import { usePrefs } from '../app/prefs.tsx';
import { useAsync, useRepo } from '../data/repo.ts';
import { Icon } from './Icon.tsx';
import { PwaHint, UpdatesForm } from './UpdatesForm.tsx';
import { Badge, TYPE_LABEL, splitTitle } from './ui.tsx';
import { IS_DEMO } from '../app/config.ts';
import { mergeNav, type SiteHit, type SiteKind } from '../shared/site-search.ts';
import type { ContentType, Menu } from '../shared/types.ts';

const STUDY: { type: ContentType; label: string; text: string }[] = [
  { type: 'video', label: 'וידאו', text: 'שיעורים ודרשות' },
  { type: 'audio', label: 'אודיו', text: 'הקלטות ותוכניות' },
  { type: 'short', label: 'קצרים', text: 'קטעים קצרים' },
  { type: 'article', label: 'דברי תורה', text: 'טקסטים כתובים' },
  { type: 'book', label: 'ספרים', text: 'ספרים וקונטרסים' },
  { type: 'leaflet', label: 'עלונים', text: 'עלונים' },
];

const HIT_LABEL: Record<string, string> = {
  ...TYPE_LABEL, topic: 'נושא', series: 'סדרה', page: 'עמוד', institution: 'מוסד', nav: 'ניווט',
};

export function requestSearch() {
  dispatchEvent(new Event('site-search'));
}

export function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 40 40" aria-hidden="true">
      <rect width="40" height="40" rx="12" fill="var(--accent)" />
      <path d="M11 28.5V14.2c2.4-1.5 4.8-2.1 9-2.1s6.6.6 9 2.1v14.3c-2.4-1.2-5-1.7-9-1.7s-6.6.5-9 1.7z" fill="none" stroke="var(--accent-contrast)" strokeWidth="1.6" />
      <path d="M20 12.1v14.7" stroke="var(--gold-300)" strokeWidth="1.7" strokeLinecap="round" />
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

function StudyPanel({ onNavigate }: { onNavigate?: () => void }) {
  const repo = useRepo();
  const topics = useAsync(() => repo.listTopics(), [repo]);
  const series = useAsync(() => repo.listSeries(), [repo]);
  return (
    <div className="mega-grid">
      <section aria-label="לפי סוג">
        <h2>לפי סוג</h2>
        <ul>
          {STUDY.map((s) => (
            <li key={s.type}>
              <Link to={`/library?type=${s.type}`} onClick={onNavigate}><strong>{s.label}</strong><span>{s.text}</span></Link>
            </li>
          ))}
          <li><Link to="/library" onClick={onNavigate}>כל הספרייה</Link></li>
        </ul>
      </section>
      <section aria-label="נושאים">
        <h2>נושאים</h2>
        <ul>
          {(topics.data ?? []).slice(0, 8).map((t) => <li key={t.id}><Link to={`/topics/${t.slug}`} onClick={onNavigate}>{t.name}</Link></li>)}
          <li><Link to="/topics" onClick={onNavigate}>כל הנושאים</Link></li>
        </ul>
      </section>
      <section aria-label="סדרות">
        <h2>סדרות</h2>
        <ul>
          {(series.data ?? []).slice(0, 6).map((s) => <li key={s.id}><Link to={`/series/${s.slug}`} onClick={onNavigate}>{s.title}</Link></li>)}
          <li><Link to="/series" onClick={onNavigate}>כל הסדרות</Link></li>
        </ul>
      </section>
    </div>
  );
}

export function Header({ menu, onSearch }: { menu: Menu | undefined; onSearch: () => void }) {
  const [sheet, setSheet] = useState(false);
  const close = () => setSheet(false);
  const links = menu?.items ?? [];
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
          <Popover.Root>
            <Popover.Trigger className="nav-trigger">עיון <Icon name="chevronDown" /></Popover.Trigger>
            <Popover.Portal>
              <Popover.Content className="mega" dir="rtl" sideOffset={12} align="start" aria-label="תפריט עיון">
                <StudyPanel />
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
          {links.filter((m) => m.href !== '/library').map((m) => <Link key={m.href} to={m.href}>{m.label}</Link>)}
        </nav>
        <div className="header-actions">
          <button className="search-trigger" onClick={onSearch}>
            <Icon name="search" /> חיפוש <kbd className="ltr">/</kbd>
          </button>
          <button className="icon-btn search-icon-only" onClick={onSearch} aria-label="חיפוש"><Icon name="search" /></button>
          <Link to="/favorites" className="icon-btn" aria-label="המועדפים שלי"><Icon name="bookmark" /></Link>
          <DisplaySettings />
          <button className="icon-btn nav-sheet-btn" aria-expanded={sheet} aria-controls="site-menu" onClick={() => setSheet(true)} aria-label="תפריט"><Icon name="menu" /></button>
        </div>
      </div>
      <D.Root open={sheet} onOpenChange={setSheet}>
        <D.Portal>
          <D.Overlay className="dialog-overlay" />
          <D.Content id="site-menu" className="dialog nav-sheet" dir="rtl" aria-describedby={undefined}>
            <D.Title>ניווט באתר</D.Title>
            <nav aria-label="תפריט">
              <div className="sheet-links">
                {links.map((m) => <Link key={m.href} to={m.href} onClick={close}>{m.label}</Link>)}
              </div>
              <StudyPanel onNavigate={close} />
            </nav>
            <D.Close className="btn btn-secondary" style={{ marginTop: 'var(--s-4)' }}>סגירה</D.Close>
          </D.Content>
        </D.Portal>
      </D.Root>
    </header>
  );
}

export function BottomNav({ onSearch }: { onSearch: () => void }) {
  return (
    <nav className="bottom-nav" aria-label="ניווט מהיר">
      <Link to="/"><Icon name="home" />בית</Link>
      <Link to="/watch"><Icon name="watch" />אולם</Link>
      <button onClick={onSearch}><Icon name="search" />חיפוש</button>
      <Link to="/ask"><Icon name="ask" />לשאול</Link>
      <Link to="/favorites"><Icon name="bookmark" />שמורים</Link>
    </nav>
  );
}

export function Footer({ menu }: { menu: Menu | undefined }) {
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div>
          <Link to="/" className="footer-brand">
            <BrandMark />
            <span><strong>אור המאיר</strong><span className="soft">תורתו של הרב ליאור כהן</span></span>
          </Link>
          <p>תורת מרן הרב מאיר מאזוז זצ״ל מוצגת עם ייחוס למקור. התכנים מקושרים למקורותיהם; זכויות השימוש בכל פריט מצוינות בדף הפריט.</p>
          <p className="soft">האתר אינו אתר רשמי עד לאישור מטעם הרב והמוסדות.</p>
          <PwaHint />
        </div>
        <nav aria-label="קישורי תחתית">
          {(menu?.items ?? []).map((m) => <Link key={m.href} to={m.href}>{m.label}</Link>)}
          <Link to="/admin">כניסת צוות</Link>
        </nav>
        <UpdatesForm />
      </div>
    </footer>
  );
}

const GROUP_ORDER: { id: string; title: string; kinds: SiteKind[] }[] = [
  { id: 'content', title: 'תכנים', kinds: ['content'] },
  { id: 'browse', title: 'נושאים וסדרות', kinds: ['topic', 'series'] },
  { id: 'pages', title: 'עמודים', kinds: ['page', 'institution', 'nav'] },
];

/** Search command panel: keyboard-first, debounced, typo-tolerant, every public kind. */
export function SearchPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const repo = useRepo();
  const { navigate } = useRouter();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [active, setActive] = useState(0);
  useEffect(() => { const t = setTimeout(() => setDebounced(q), 140); return () => clearTimeout(t); }, [q]);
  const res = useAsync(async () => {
    if (debounced.trim().length < 2) return null;
    try {
      return await repo.searchSite(debounced);
    } catch {
      const content = await repo.listContent({ q: debounced, pageSize: 8 });
      return mergeNav(content.items.map((it) => ({
        kind: 'content' as const, id: it.id, title: it.title, href: `/item/${it.slug}`, label: it.type, score: 6, fuzzy: false,
      })), debounced);
    }
  }, [debounced, repo]);
  const hits = useMemo(() => res.data ?? [], [res.data]);
  const flat = hits;
  useEffect(() => setActive(0), [debounced]);
  const go = (to: string) => { onOpenChange(false); setQ(''); navigate(to); };
  const seeAll = `/library?q=${encodeURIComponent(q)}`;
  const options = flat.length + (flat.length ? 1 : 0);

  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="dialog-overlay" />
        <D.Content className="dialog search-panel" dir="rtl" aria-describedby={undefined} onCloseAutoFocus={(e) => e.preventDefault()}>
          <D.Title className="sr-only">חיפוש באתר</D.Title>
          <div className="search-input-wrap">
            <Icon name="search" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="שיעור, נושא, סדרה או עמוד…"
              aria-label="חיפוש"
              role="combobox"
              aria-expanded={flat.length > 0}
              aria-controls="search-results"
              aria-autocomplete="list"
              aria-activedescendant={flat[active] ? `sr-${flat[active]!.id}` : active === flat.length && flat.length ? 'sr-all' : undefined}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(options - 1, a + 1)); }
                if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const it = flat[active];
                  go(it ? it.href : seeAll);
                }
              }}
            />
            <D.Close asChild><button className="icon-btn" aria-label="סגירת החיפוש"><Icon name="close" /></button></D.Close>
          </div>
          <div id="search-results" className="search-results" role="listbox" aria-label="תוצאות">
            {debounced.trim().length < 2 && <p className="search-hint">הקלידו לפחות שתי אותיות. ניקוד, גרשיים וטעות אות אחת נסבלים. <span className="ltr">Ctrl K</span></p>}
            {res.loading && debounced.trim().length >= 2 && <p className="search-hint" role="status">מחפש…</p>}
            {!res.loading && debounced.trim().length >= 2 && flat.length === 0 && <p className="search-hint">לא נמצאו תוצאות. נסו מילה קצרה יותר.</p>}
            {GROUP_ORDER.map((g) => {
              const items = flat.filter((h) => g.kinds.includes(h.kind));
              if (!items.length) return null;
              return (
                <section key={g.id} className="search-group" aria-label={g.title}>
                  <h3>{g.title}</h3>
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                    {items.map((it) => {
                      const i = flat.indexOf(it);
                      return (
                        <li key={it.id} id={`sr-${it.id}`} role="option" aria-selected={i === active}>
                          <a href={it.href} aria-selected={i === active} onClick={(e) => { e.preventDefault(); go(it.href); }} onMouseEnter={() => setActive(i)}>
                            <Badge tone="accent">{HIT_LABEL[it.label] ?? HIT_LABEL[it.kind] ?? it.label}</Badge>
                            <span>{it.kind === 'content' ? splitTitle(it.title)[0] : it.title}</span>
                            {it.fuzzy && <small>התאמה משוערת</small>}
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
            {flat.length > 0 && (
              <ul style={{ listStyle: 'none', margin: 0, padding: '0 var(--s-2) var(--s-2)' }}>
                <li id="sr-all" role="option" aria-selected={active === flat.length}>
                  <a href={seeAll} aria-selected={active === flat.length} onClick={(e) => { e.preventDefault(); go(seeAll); }}>
                    <Icon name="library" /> כל התוצאות בספרייה עבור „{q}”
                  </a>
                </li>
              </ul>
            )}
          </div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

export function PageShell({ children }: { children: ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
