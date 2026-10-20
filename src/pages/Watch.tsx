import { useEffect, useState } from 'react';
import { useHead } from '../app/head.ts';
import { useLibraryState } from '../app/library-state.tsx';
import { Link, useSearchParams } from '../app/router.tsx';
import { useAsync, useRepo } from '../data/repo.ts';
import { Icon } from '../components/Icon.tsx';
import { MediaPlayer, thumbFor } from '../components/Media.tsx';
import { Breadcrumbs, Button, CardSkeletons, EmptyState, ErrorState, Pagination, SelectField, Skeleton, TYPE_LABEL, splitTitle } from '../components/ui.tsx';
import { formatDuration } from '../shared/media.ts';
import type { ContentItem, ContentQuery, ContentType, DatedFilter, HallMode, LengthBucket } from '../shared/types.ts';

const LENGTHS: [LengthBucket | '', string][] = [
  ['', 'כל האורך'],
  ['short', 'עד 10 דקות'],
  ['medium', '10 עד 40 דקות'],
  ['long', 'מעל 40 דקות'],
  ['unknown', 'משך לא ידוע'],
];
const DATED: [DatedFilter | '', string][] = [
  ['', 'כל התאריכים'],
  ['known', 'יש תאריך במקור'],
  ['unknown', 'תאריך לא ידוע'],
];
const WATCH_TYPES: ContentType[] = ['video', 'short', 'live'];

function progressPct(t: number, d: number | null): number | null {
  if (!d || d <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((t / d) * 100)));
}

export default function WatchPage() {
  const repo = useRepo();
  const { progress } = useLibraryState();
  const [params, update] = useSearchParams();
  const hall: HallMode = params.get('hall') === 'listen' ? 'listen' : 'watch';
  const type = (params.get('type') as ContentType) || '';
  const q: ContentQuery = {
    q: params.get('q') ?? '',
    hall,
    type: type || '',
    topic: params.get('topic') ?? '',
    series: params.get('series') ?? '',
    length: (params.get('length') as LengthBucket) || '',
    dated: (params.get('dated') as DatedFilter) || '',
    sort: (params.get('sort') as ContentQuery['sort']) || undefined,
    page: Number(params.get('page') ?? 1) || 1,
    pageSize: 12,
  };
  const [text, setText] = useState(q.q ?? '');
  useEffect(() => setText(q.q ?? ''), [q.q]);
  useEffect(() => {
    const t = setTimeout(() => { if (text !== (q.q ?? '')) update({ q: text, page: null }, { replace: true }); }, 350);
    return () => clearTimeout(t);
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = [q.q, q.type, q.topic, q.series, q.length, q.dated].some(Boolean);
  const stage = useAsync(() => repo.listContent({ hall, pageSize: 60 }), [hall, repo]);
  const topics = useAsync(() => repo.listTopics(), [repo]);
  const series = useAsync(() => repo.listSeries(), [repo]);
  const res = useAsync(() => repo.listContent(q), [params.toString(), repo]);
  const hero = (stage.data?.items ?? []).find((c) => c.featured) ?? stage.data?.items[0] ?? null;
  const [heroTitle, heroSub] = hero ? splitTitle(hero.title) : ['', null];

  useHead({
    title: hall === 'listen' ? 'שיעורי שמע' : 'אודיטוריום — שיעורי וידאו',
    description: hall === 'listen'
      ? 'הקלטות ושיעורי שמע. כשיש קובץ מורשה, ההאזנה נמשכת ברקע.'
      : 'אולם השיעורים: שיעורים, קטעים ושידורים מוקלטים. הנגן נטען רק בלחיצה, וההתקדמות נשמרת במכשיר.',
    path: '/watch',
  });

  const continueItems = Object.entries(progress)
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, 8);
  const hrefFor = (p: number) => {
    const n = new URLSearchParams(params);
    n.set('page', String(p));
    if (!n.get('hall')) n.set('hall', hall);
    return `/watch?${n.toString()}`;
  };
  const setHall = (next: HallMode) => update({ hall: next === 'watch' ? null : next, type: null, page: null });

  return (
    <div className="watch-page">
      <div className="container">
        <Breadcrumbs items={[{ label: 'בית', to: '/' }, { label: 'אודיטוריום' }]} />
      </div>
      <section className="hall-stage" aria-labelledby="hall-title">
        <div className="container hall-hero">
          <div className="hall-copy">
            <p className="eyebrow">מוסדות אור המאיר</p>
            <h1 id="hall-title">{hall === 'listen' ? 'שיעורי שמע' : 'אודיטוריום'}</h1>
            <p className="hall-lede">
              {hall === 'listen'
                ? 'הקלטות שמע עם נגן שנשאר איתכם בין העמודים. שיעורים בלי קובץ ישיר נפתחים במקור.'
                : 'שיעורי וידאו, קטעים קצרים ושידורים מוקלטים. הנגן הרשמי נטען רק כשלוחצים, בלי לטעון סרטון מראש.'}
            </p>
            <div className="segmented" role="group" aria-label="סוג האולם">
              <button type="button" aria-pressed={hall === 'watch'} onClick={() => setHall('watch')}>וידאו</button>
              <button type="button" aria-pressed={hall === 'listen'} onClick={() => setHall('listen')}>שמע</button>
            </div>
            <p className="soft"><Link to="/library">לכל ספריית השיעורים</Link></p>
          </div>
          <div className="hall-feature">
            {stage.loading && !hero && (
              <div aria-hidden="true">
                <Skeleton h={18} w="30%" />
                <div style={{ height: 12 }} />
                <Skeleton h={36} w="85%" />
                <div className="lesson-anchor" style={{ marginTop: 16 }} />
              </div>
            )}
            {stage.error && <ErrorState error={stage.error} onRetry={stage.reload} />}
            {hero && (
              <>
                <p className="eyebrow">{hero.featured ? 'שיעור נבחר' : 'ראשון באולם'}</p>
                <h2><Link to={`/item/${hero.slug}`}>{heroTitle}</Link></h2>
                {heroSub && <p className="muted">{heroSub}</p>}
                <MediaPlayer item={hero} resume={false} />
              </>
            )}
            {!stage.loading && !stage.error && !hero && (
              <EmptyState icon={hall === 'listen' ? 'listen' : 'watch'} title="אין שיעורים באולם">הקטלוג הריק יופיע כאן כשיהיו פריטים מפורסמים.</EmptyState>
            )}
          </div>
        </div>
      </section>

      <section className="section container" aria-labelledby="h-continue">
        <div className="section-head"><h2 id="h-continue">המשך צפייה והאזנה</h2></div>
        <p className="soft">נשמר במכשיר הזה בלבד, בלי חשבון.</p>
        {continueItems.length === 0 ? (
          <EmptyState icon="history" title="עוד אין שיעור באמצע">בחרו שיעור. ההתקדמות תחכה כאן גם אחרי סגירת הדפדפן.</EmptyState>
        ) : (
          <ul className="rail">
            {continueItems.map(([id, e]) => {
              const pct = progressPct(e.t, e.d);
              return (
                <li key={id}>
                  <Link to={`/item/${e.slug}?t=${Math.floor(e.t)}`} className="continue-card">
                    <span className="continue-title">{e.title}</span>
                    <span className="soft ltr">{formatDuration(e.t)}{e.d ? ` / ${formatDuration(e.d)}` : ''}</span>
                    {pct != null && <span className="progress-track" aria-hidden="true"><span style={{ width: `${pct}%` }} /></span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="section container" aria-labelledby="h-series">
        <div className="section-head"><h2 id="h-series">סדרות</h2><Link to="/series">לכל הסדרות</Link></div>
        {series.loading && <CardSkeletons n={3} />}
        {series.data && series.data.length === 0 && <EmptyState icon="layers" title="אין סדרות עדיין" />}
        {series.data && series.data.length > 0 && (
          <ul className="rail">
            {series.data.map((s) => {
              const done = s.items.filter((id) => {
                const p = progress[id];
                return p && p.d && p.t / p.d >= 0.9;
              }).length;
              const started = s.items.filter((id) => (progress[id]?.t ?? 0) > 5).length;
              const pct = s.items.length ? Math.round((done / s.items.length) * 100) : 0;
              return (
                <li key={s.id}>
                  <Link to={`/series/${s.slug}`} className="series-card">
                    <Icon name="layers" />
                    <strong>{s.title}</strong>
                    <span className="soft">{s.items.length} פרקים · {s.kind === 'system' ? 'נבנתה באתר' : 'פלייליסט מקור'}</span>
                    <span className="soft">{started > 0 ? `התחלתם ${started}, הושלמו ${done}` : 'טרם התחלתם במכשיר זה'}</span>
                    <span className="progress-track" aria-hidden="true"><span style={{ width: `${pct}%` }} /></span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="section container" aria-labelledby="h-catalog">
        <div className="section-head">
          <h2 id="h-catalog">{filtered ? 'תוצאות' : hall === 'listen' ? 'כל שיעורי השמע' : 'באולם'}</h2>
        </div>
        <p className="soft">הסדר הוא סדר הפריטים בערוץ, לא תאריך הקלטה. תאריך מוצג רק כשהוא כתוב במקור.</p>
        <form className="filters" role="search" onSubmit={(e) => { e.preventDefault(); update({ q: text, page: null }); }}>
          <div className="field">
            <label htmlFor="hall-q">חיפוש בעברית</label>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <input id="hall-q" className="input" type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="למשל: סוכות, פרק יומי, אור הנאמן" enterKeyHint="search" />
              <Button type="submit" icon="search" aria-label="חיפוש">חיפוש</Button>
            </div>
            <span className="hint">בלי ניקוד ובלי גרשיים. החיפוש כולל כותרת, תקציר, תמליל וכותרות פרקים — אם הם קיימים.</span>
          </div>
          <div className="chip-row" role="group" aria-label="סוג">
            <button type="button" className="chip" aria-pressed={!q.type} onClick={() => update({ type: null, page: null })}>הכול</button>
            {(hall === 'listen' ? (['audio'] as const) : WATCH_TYPES).map((t) => (
              <button type="button" key={t} className="chip" aria-pressed={q.type === t} onClick={() => update({ type: q.type === t ? null : t, page: null })}>{TYPE_LABEL[t]}</button>
            ))}
          </div>
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
            <div style={{ flex: '1 1 160px' }}>
              <SelectField label="אורך" value={q.length} onChange={(e) => update({ length: e.target.value, page: null })}>
                {LENGTHS.map(([v, l]) => <option key={v || 'all'} value={v}>{l}</option>)}
              </SelectField>
            </div>
            <div style={{ flex: '1 1 160px' }}>
              <SelectField label="תאריך" value={q.dated} onChange={(e) => update({ dated: e.target.value, page: null })}>
                {DATED.map(([v, l]) => <option key={v || 'all'} value={v}>{l}</option>)}
              </SelectField>
            </div>
          </div>
        </form>
        <p className="muted" role="status" aria-live="polite">
          {res.loading ? 'טוען…' : res.error ? 'הטעינה נכשלה' : `${res.data?.total ?? 0} שיעורים`}
          {filtered && !res.loading && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => update({ q: null, type: null, topic: null, series: null, length: null, dated: null, page: null })}>ניקוי</button>
          )}
        </p>
        {res.error && <ErrorState error={res.error} onRetry={res.reload} />}
        {res.loading && !res.data && <CardSkeletons />}
        {res.data && res.data.items.length === 0 && (
          <EmptyState title="לא נמצאו שיעורים" action={<Button variant="secondary" onClick={() => update({ q: null, type: null, topic: null, series: null, length: null, dated: null, page: null })}>ניקוי מסננים</Button>}>
            נסו מילה אחרת, או הסירו מסנן אורך או תאריך. לרוב השיעורים אין תאריך הקלטה.
          </EmptyState>
        )}
        {res.data && res.data.items.length > 0 && (
          <>
            <PosterGrid items={res.data.items} />
            <Pagination page={res.data.page} total={res.data.total} pageSize={res.data.pageSize} hrefFor={hrefFor} />
          </>
        )}
      </section>
    </div>
  );
}

function PosterGrid({ items }: { items: ContentItem[] }) {
  return (
    <div className="grid-cards">
      {items.map((item) => <Poster key={item.id} item={item} />)}
    </div>
  );
}

function Poster({ item }: { item: ContentItem }) {
  const { progress } = useLibraryState();
  const [main, sub] = splitTitle(item.title);
  const thumb = thumbFor(item);
  const saved = progress[item.id];
  const pct = saved ? progressPct(saved.t, saved.d) : null;
  const duration = item.durationText ?? (item.durationSeconds ? formatDuration(item.durationSeconds) : null);
  return (
    <article className="card">
      <div className="card-media">
        {thumb ? <img src={thumb} alt="" loading="lazy" decoding="async" width={320} height={180} onError={(e) => e.currentTarget.classList.add('img-failed')} /> : (
          <div className="ph"><Icon name={item.type === 'audio' ? 'listen' : 'watch'} /></div>
        )}
        {duration && <span className="card-duration ltr">{duration}</span>}
        {pct != null && <span className="card-progress" style={{ width: `${pct}%` }} aria-hidden="true" />}
      </div>
      <div className="card-body">
        <h3 className="card-title"><Link to={`/item/${item.slug}${saved && saved.t > 5 ? `?t=${Math.floor(saved.t)}` : ''}`}>{main}</Link></h3>
        {sub && <p className="card-sub">{sub}</p>}
        <p className="soft" style={{ margin: 0 }}>{item.speaker ?? 'ערוץ מוסדות אור המאיר'}</p>
      </div>
    </article>
  );
}
