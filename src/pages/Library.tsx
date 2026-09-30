import { useEffect, useState } from 'react';
import { useHead } from '../app/head.ts';
import { usePrefs } from '../app/prefs.tsx';
import { useSearchParams } from '../app/router.tsx';
import { useAsync, useRepo } from '../data/repo.ts';
import { Icon } from '../components/Icon.tsx';
import { CardGrid, providerLabel } from '../components/Media.tsx';
import { Swap } from '../components/Motion.tsx';
import { Breadcrumbs, Button, CardSkeletons, EmptyState, ErrorState, Pagination, SelectField, TYPE_LABEL } from '../components/ui.tsx';
import { CONTENT_TYPES, type ContentQuery, type ContentType, type MediaProvider } from '../shared/types.ts';

const PROVIDERS: MediaProvider[] = ['youtube', 'kol-barama', 'ykr', 'ktr', 'hm-news', 'pdf', 'storage'];
const SORTS: [NonNullable<ContentQuery['sort']>, string][] = [['newest', 'לפי סדר הערוץ (חדש קודם)'], ['oldest', 'לפי סדר הערוץ (ישן קודם)'], ['title', 'לפי שם'], ['duration', 'הארוכים קודם']];

export default function LibraryPage() {
  const repo = useRepo();
  const { prefs, set } = usePrefs();
  const [params, update] = useSearchParams();
  const q: ContentQuery = {
    q: params.get('q') ?? '',
    type: (params.get('type') as ContentType) || '',
    topic: params.get('topic') ?? '',
    series: params.get('series') ?? '',
    provider: (params.get('provider') as MediaProvider) || '',
    sort: (params.get('sort') as ContentQuery['sort']) || undefined,
    page: Number(params.get('page') ?? 1) || 1,
    pageSize: 24,
  };
  const view = (params.get('view') as 'grid' | 'list') || prefs.view;
  const [text, setText] = useState(q.q ?? '');
  useEffect(() => setText(q.q ?? ''), [q.q]);
  useEffect(() => {
    const t = setTimeout(() => { if (text !== (q.q ?? '')) update({ q: text, page: null }, { replace: true }); }, 350);
    return () => clearTimeout(t);
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps

  const topics = useAsync(() => repo.listTopics(), [repo]);
  const series = useAsync(() => repo.listSeries(), [repo]);
  const res = useAsync(() => repo.listContent(q), [params.toString()]);
  const active = [q.type, q.topic, q.series, q.provider, q.q].filter(Boolean).length;
  const advancedCount = [q.topic, q.series, q.provider, q.sort].filter(Boolean).length;
  const [advancedOpen, setAdvancedOpen] = useState(() => innerWidth >= 900 || advancedCount > 0);
  useHead({
    title: q.type ? `ספרייה — ${TYPE_LABEL[q.type]}` : 'ספריית השיעורים',
    description: 'חיפוש וסינון שיעורי וידאו, אודיו, קטעים קצרים, דברי תורה, ספרים ותשובות של הרב ליאור כהן.',
    path: '/library',
  });
  const hrefFor = (p: number) => {
    const n = new URLSearchParams(params);
    n.set('page', String(p));
    return `/library?${n.toString()}`;
  };

  return (
    <div className="container">
      <Breadcrumbs items={[{ label: 'בית', to: '/' }, { label: 'ספרייה' }]} />
      <h1>ספריית השיעורים</h1>
      <form className="filters" role="search" onSubmit={(e) => { e.preventDefault(); update({ q: text, page: null }); }}>
        <div className="field">
          <label htmlFor="lib-q">חיפוש</label>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <input id="lib-q" className="input" type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="למשל: תשעה באב, ארבעת המינים, מרן" enterKeyHint="search" />
            <Button type="submit" icon="search" aria-label="חיפוש">חיפוש</Button>
          </div>
          <span className="hint">החיפוש מתעלם מניקוד ומגרשיים. אין ניתוח דקדוקי של מילים (למשל תחיליות).</span>
        </div>
        <div className="chip-row" role="group" aria-label="סוג תוכן">
          <button type="button" className="chip" aria-pressed={!q.type} onClick={() => update({ type: null, page: null })}>הכול</button>
          {CONTENT_TYPES.map((t) => (
            <button type="button" key={t} className="chip" aria-pressed={q.type === t} onClick={() => update({ type: q.type === t ? null : t, page: null })}>{TYPE_LABEL[t]}</button>
          ))}
        </div>
        <details className="more-filters" open={advancedOpen} onToggle={(e) => setAdvancedOpen(e.currentTarget.open)}>
          <summary>מסננים נוספים{advancedCount ? ` (${advancedCount})` : ''}</summary>
        <div className="filters-row">
          <div style={{ flex: '1 1 160px' }}>
            <SelectField label="נושא" value={q.topic} onChange={(e) => update({ topic: e.target.value, page: null })}>
              <option value="">כל הנושאים</option>
              {topics.data?.map((t) => <option key={t.id} value={t.slug}>{t.name}</option>)}
            </SelectField>
          </div>
          <div style={{ flex: '1 1 160px' }}>
            <SelectField label="סדרה" value={q.series} onChange={(e) => update({ series: e.target.value, page: null })}>
              <option value="">כל הסדרות</option>
              {series.data?.map((s) => <option key={s.id} value={s.slug}>{s.title}</option>)}
            </SelectField>
          </div>
          <div style={{ flex: '1 1 140px' }}>
            <SelectField label="מקור" value={q.provider} onChange={(e) => update({ provider: e.target.value, page: null })}>
              <option value="">כל המקורות</option>
              {PROVIDERS.map((p) => <option key={p} value={p}>{providerLabel(p)}</option>)}
            </SelectField>
          </div>
          <div style={{ flex: '1 1 160px' }}>
            <SelectField label="מיון" value={q.sort ?? 'newest'} onChange={(e) => update({ sort: e.target.value === 'newest' ? null : e.target.value, page: null })} hint={q.q ? 'בחיפוש התוצאות ממוינות לפי התאמה' : undefined}>
              {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </SelectField>
          </div>
        </div>
        </details>
      </form>

      <div className="spread" style={{ marginBottom: 'var(--s-4)' }}>
        <p className="muted" role="status" aria-live="polite" style={{ margin: 0 }}>
          {res.loading ? 'טוען…' : `${res.data?.total ?? 0} פריטים`}
          {active > 0 && !res.loading && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => update({ q: null, type: null, topic: null, series: null, provider: null, page: null })} style={{ marginInlineStart: 8 }}>
              ניקוי מסננים
            </button>
          )}
        </p>
        <div className="segmented" role="group" aria-label="תצוגה">
          <button type="button" aria-pressed={view === 'grid'} aria-label="תצוגת כרטיסים" onClick={() => { set('view', 'grid'); update({ view: null }, { replace: true }); }}><Icon name="grid" /></button>
          <button type="button" aria-pressed={view === 'list'} aria-label="תצוגת רשימה" onClick={() => { set('view', 'list'); update({ view: 'list' }, { replace: true }); }}><Icon name="list" /></button>
        </div>
      </div>

      {res.error && <ErrorState error={res.error} onRetry={res.reload} />}
      {res.loading && !res.data && <CardSkeletons />}
      {res.data && res.data.items.length === 0 && (
        <EmptyState title="לא נמצאו פריטים" action={<Button variant="secondary" onClick={() => update({ q: null, type: null, topic: null, series: null, provider: null, page: null })}>ניקוי מסננים</Button>}>
          נסו מילה אחרת או הסירו מסנן.
        </EmptyState>
      )}
      {res.data && res.data.items.length > 0 && (
        <div aria-busy={res.loading}>
          <Swap k={view}><CardGrid items={res.data.items} view={view} /></Swap>
          <Pagination page={res.data.page} total={res.data.total} pageSize={res.data.pageSize} hrefFor={hrefFor} />
        </div>
      )}
    </div>
  );
}
