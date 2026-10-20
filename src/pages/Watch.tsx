import { useEffect, useMemo, useState } from 'react';
import { useHead } from '../app/head.ts';
import { useLibraryState } from '../app/library-state.tsx';
import { Link, useSearchParams } from '../app/router.tsx';
import { FilmCard } from '../components/FilmCard.tsx';
import { Icon } from '../components/Icon.tsx';
import { MediaPlayer, thumbFor } from '../components/Media.tsx';
import { SnapRail } from '../components/SnapRail.tsx';
import { Breadcrumbs, Button, CardSkeletons, EmptyState, ErrorState, Pagination, SelectField, Skeleton, TYPE_LABEL, splitTitle } from '../components/ui.tsx';
import { useAsync, useRepo } from '../data/repo.ts';
import { inHall, whyRelated } from '../shared/hall.ts';
import { formatDuration } from '../shared/media.ts';
import type { ContentItem, ContentQuery, ContentType, DatedFilter, HallMode, LengthBucket, Series } from '../shared/types.ts';

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

export default function WatchPage() {
  const repo = useRepo();
  const { progress, watchLater } = useLibraryState();
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

  const filtered = [q.q, q.type, q.topic, q.series, q.length, q.dated, q.sort].some(Boolean);
  const stage = useAsync(() => repo.listContent({ hall, pageSize: 60 }), [hall, repo]);
  const topics = useAsync(() => repo.listTopics(), [repo]);
  const series = useAsync(() => repo.listSeries(), [repo]);
  const res = useAsync(() => repo.listContent(q), [params.toString(), repo]);
  const hero = (stage.data?.items ?? []).find((c) => c.featured) ?? stage.data?.items[0] ?? null;
  const [heroTitle, heroSub] = hero ? splitTitle(hero.title) : ['', null];

  const continueIds = useMemo(
    () => Object.entries(progress).sort((a, b) => b[1].at - a[1].at).slice(0, 12),
    [progress],
  );
  const contKey = continueIds.map(([id]) => id).join(',');
  const contLoaded = useAsync(() => repo.getContentByIds(continueIds.map(([id]) => id)), [contKey, repo]);
  const seed = contLoaded.data?.find((c) => c.id === continueIds[0]?.[0]) ?? hero;
  const recs = useAsync(() => (seed ? repo.related(seed, 16) : Promise.resolve([] as ContentItem[])), [seed?.id, repo]);
  const laterKey = watchLater.join(',');
  const laterLoaded = useAsync(() => repo.getContentByIds(watchLater), [laterKey, repo]);
  const coverIds = (series.data ?? []).map((s) => s.items[0]).filter((id): id is string => !!id);
  const covers = useAsync(() => repo.getContentByIds(coverIds), [coverIds.join(','), repo]);

  const recItems = (recs.data ?? []).filter((c) => inHall(c.type, hall)).slice(0, 12);
  const fromContinue = !!continueIds.length && seed?.id === continueIds[0]?.[0];
  const shorts = hall === 'watch' ? (stage.data?.items ?? []).filter((c) => c.type === 'short').slice(0, 12) : [];
  const heroTopics = (topics.data ?? []).filter((t) => hero?.topicIds.includes(t.id));

  useHead({
    title: hall === 'listen' ? 'שיעורי שמע' : 'אודיטוריום — שיעורי וידאו',
    description: hall === 'listen'
      ? 'הקלטות ושיעורי שמע. כשיש קובץ מורשה, ההאזנה נמשכת ברקע.'
      : 'אולם השיעורים: שיעורים, קטעים ושידורים מוקלטים. הנגן נטען רק בלחיצה, בלי יציאה מהאתר.',
    path: '/watch',
  });

  const hrefFor = (p: number) => {
    const n = new URLSearchParams(params);
    n.set('page', String(p));
    if (!n.get('hall')) n.set('hall', hall);
    return `/watch?${n.toString()}`;
  };
  const setHall = (next: HallMode) => update({ hall: next === 'watch' ? null : next, type: null, page: null });
  const clearFilters = () => update({ q: null, type: null, topic: null, series: null, length: null, dated: null, sort: null, page: null });

  return (
    <div className="watch-page">
      <div className="container">
        <Breadcrumbs items={[{ label: 'בית', to: '/' }, { label: 'אודיטוריום' }]} />
      </div>
      <section className="cinema" aria-labelledby="hall-title">
        <div className="container cinema-grid">
          <div className="cinema-copy">
            <p className="eyebrow">מוסדות אור המאיר</p>
            <h1 id="hall-title">{hall === 'listen' ? 'שיעורי שמע' : 'אודיטוריום'}</h1>
            <hr className="cinema-rule" />
            <p className="hall-lede">
              {hall === 'listen'
                ? 'הקלטות שמע עם נגן שנשאר איתכם בין העמודים. ההתקדמות נשמרת במכשיר הזה.'
                : 'שיעורי וידאו, קטעים ושידורים מוקלטים. הנגן נפתח כאן, בלי לעזוב את האתר, ורק אחרי לחיצה.'}
            </p>
            <div className="segmented" role="group" aria-label="סוג האולם">
              <button type="button" aria-pressed={hall === 'watch'} onClick={() => setHall('watch')}>וידאו</button>
              <button type="button" aria-pressed={hall === 'listen'} onClick={() => setHall('listen')}>שמע</button>
            </div>
            {heroTopics.length > 0 && (
              <div className="chip-row" aria-label="נושאי השיעור שבראש האולם">
                {heroTopics.map((t) => (
                  <button type="button" key={t.id} className="chip" onClick={() => update({ topic: t.slug, page: null })}>{t.name}</button>
                ))}
              </div>
            )}
            <p className="soft"><Link to="/library">לכל ספריית השיעורים</Link></p>
          </div>
          <div className="cinema-player">
            {stage.loading && !hero && (
              <div aria-hidden="true">
                <Skeleton h={18} w="30%" />
                <div style={{ height: 12 }} />
                <Skeleton h={32} w="80%" />
                <div className="lesson-anchor" style={{ marginTop: 16 }} />
              </div>
            )}
            {stage.error && <ErrorState error={stage.error} onRetry={stage.reload} />}
            {hero && (
              <>
                <p className="eyebrow">{hero.featured ? 'שיעור נבחר' : 'ראשון באולם'}</p>
                <h2><Link to={`/item/${hero.slug}`}>{heroTitle}</Link></h2>
                {heroSub && <p className="muted">{heroSub}</p>}
                <p className="soft">
                  {hero.speaker ?? 'ערוץ מוסדות אור המאיר'}
                  {hero.durationText || hero.durationSeconds ? <> · <span className="ltr">{hero.durationText ?? formatDuration(hero.durationSeconds)}</span></> : null}
                </p>
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
        <div className="section-head"><h2 id="h-continue">המשך צפייה והאזנה</h2><Link to="/favorites">כל מה שנשמר במכשיר</Link></div>
        <p className="soft">נשמר במכשיר הזה בלבד, בלי חשבון.</p>
        {continueIds.length === 0 ? (
          <EmptyState icon="history" title="עוד אין שיעור באמצע">בחרו שיעור. ההתקדמות תחכה כאן גם אחרי סגירת הדפדפן.</EmptyState>
        ) : (
          <SnapRail label="המשך צפייה">
            {continueIds.map(([id, e]) => {
              const item = contLoaded.data?.find((c) => c.id === id);
              return (
                <li key={id}>
                  {item ? <FilmCard item={item} /> : (
                    <Link to={`/item/${e.slug}?t=${Math.floor(e.t)}`} className="continue-card">
                      <span className="continue-title">{e.title}</span>
                      <span className="soft ltr">{formatDuration(e.t)}{e.d ? ` / ${formatDuration(e.d)}` : ''}</span>
                    </Link>
                  )}
                </li>
              );
            })}
          </SnapRail>
        )}
      </section>

      {(laterLoaded.data?.length ?? 0) > 0 && (
        <section className="section container" aria-labelledby="h-later">
          <div className="section-head"><h2 id="h-later">צפייה מאוחר יותר</h2><Link to="/favorites">לרשימה המלאה</Link></div>
          <SnapRail label="צפייה מאוחר יותר">
            {watchLater.map((id) => laterLoaded.data?.find((c) => c.id === id)).filter((c): c is ContentItem => !!c).slice(0, 12).map((item) => (
              <li key={item.id}><FilmCard item={item} /></li>
            ))}
          </SnapRail>
        </section>
      )}

      <section className="section container" aria-labelledby="h-rec">
        <div className="section-head"><h2 id="h-rec">מומלץ להמשך</h2></div>
        <p className="soft">
          {fromContinue && seed
            ? `לפי הסדרה או הנושא של „${splitTitle(seed.title)[0]}”.`
            : 'שיעורים שחולקים סדרה או נושא עם השיעור שבראש האולם.'}
        </p>
        {recs.loading && !recs.data && <CardSkeletons n={4} />}
        {recItems.length === 0 && !recs.loading && <EmptyState icon="layers" title="אין עדיין המלצות" />}
        {recItems.length > 0 && seed && (
          <SnapRail label="מומלץ להמשך">
            {recItems.map((item) => <li key={item.id}><FilmCard item={item} note={whyRelated(seed, item) || undefined} /></li>)}
          </SnapRail>
        )}
      </section>

      {shorts.length > 0 && (
        <section className="section container" aria-labelledby="h-shorts">
          <div className="section-head">
            <h2 id="h-shorts">קטעים קצרים</h2>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => update({ type: 'short', page: null })}>סינון לקצרים</button>
          </div>
          <SnapRail label="קטעים קצרים">
            {shorts.map((item) => <li key={item.id}><FilmCard item={item} /></li>)}
          </SnapRail>
        </section>
      )}

      <section className="section container" aria-labelledby="h-series">
        <div className="section-head"><h2 id="h-series">סדרות</h2><Link to="/series">לכל הסדרות</Link></div>
        {series.loading && <CardSkeletons n={3} />}
        {series.data && series.data.length === 0 && <EmptyState icon="layers" title="אין סדרות עדיין" />}
        {series.data && series.data.length > 0 && (
          <SnapRail label="סדרות">
            {series.data.map((s) => (
              <li key={s.id}>
                <SeriesTile series={s} cover={covers.data?.find((c) => c.id === s.items[0]) ?? null} doneCount={s.items.filter((id) => {
                  const p = progress[id];
                  return !!(p && p.d && p.t / p.d >= 0.9);
                }).length} />
              </li>
            ))}
          </SnapRail>
        )}
      </section>

      <section className="section container" aria-labelledby="h-catalog">
        <div className="section-head">
          <h2 id="h-catalog">{filtered ? 'תוצאות' : hall === 'listen' ? 'כל שיעורי השמע' : 'באולם'}</h2>
        </div>
        <p className="soft">ברירת המחדל היא סדר הפריטים בערוץ, לא תאריך הקלטה. תאריך מוצג רק כשהוא כתוב במקור.</p>
        <form className="filters" role="search" onSubmit={(e) => { e.preventDefault(); update({ q: text, page: null }); }}>
          <div className="field">
            <label htmlFor="hall-q">חיפוש בעברית</label>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <input id="hall-q" className="input" type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="למשל: סוכות, פרק יומי, אור הנאמן" enterKeyHint="search" />
              <Button type="submit" icon="search" aria-label="חיפוש">חיפוש</Button>
            </div>
            <span className="hint">בלי ניקוד. עניין וענין נחשבים אותו חיפוש, וגם הקלדה במקלדת אנגלית כשהאותיות העבריות על המקשים.</span>
          </div>
          <div className="chip-row" role="group" aria-label="סוג">
            <button type="button" className="chip" aria-pressed={!q.type} onClick={() => update({ type: null, page: null })}>הכול</button>
            {(hall === 'listen' ? (['audio'] as const) : WATCH_TYPES).map((t) => (
              <button type="button" key={t} className="chip" aria-pressed={q.type === t} onClick={() => update({ type: q.type === t ? null : t, page: null })}>{TYPE_LABEL[t]}</button>
            ))}
          </div>
          <div className="chip-row" role="group" aria-label="אורך">
            {LENGTHS.map(([v, l]) => (
              <button type="button" key={v || 'all-len'} className="chip" aria-pressed={(q.length || '') === v} onClick={() => update({ length: v || null, page: null })}>{l}</button>
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
              <SelectField label="תאריך" value={q.dated} onChange={(e) => update({ dated: e.target.value, page: null })}>
                {DATED.map(([v, l]) => <option key={v || 'all'} value={v}>{l}</option>)}
              </SelectField>
            </div>
            <div style={{ flex: '1 1 160px' }}>
              <SelectField label="סדר" value={q.sort ?? 'newest'} onChange={(e) => update({ sort: e.target.value === 'newest' ? null : e.target.value, page: null })}>
                <option value="newest">סדר הערוץ</option>
                <option value="oldest">הפוך מסדר הערוץ</option>
                <option value="title">כותרת</option>
                <option value="duration">אורך</option>
              </SelectField>
            </div>
          </div>
        </form>
        <p className="muted" role="status" aria-live="polite">
          {res.loading ? 'טוען…' : res.error ? 'הטעינה נכשלה' : `${res.data?.total ?? 0} שיעורים`}
          {filtered && !res.loading && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={clearFilters}>ניקוי</button>
          )}
        </p>
        {res.error && <ErrorState error={res.error} onRetry={res.reload} />}
        {res.loading && !res.data && <CardSkeletons />}
        {res.data && res.data.items.length === 0 && (
          <EmptyState title="לא נמצאו שיעורים" action={<Button variant="secondary" onClick={clearFilters}>ניקוי מסננים</Button>}>
            נסו מילה אחרת, או הסירו מסנן אורך או תאריך. לרוב השיעורים אין תאריך הקלטה.
          </EmptyState>
        )}
        {res.data && res.data.items.length > 0 && (
          <>
            <div className="grid-cards">
              {res.data.items.map((item) => <FilmCard key={item.id} item={item} />)}
            </div>
            <Pagination page={res.data.page} total={res.data.total} pageSize={res.data.pageSize} hrefFor={hrefFor} />
          </>
        )}
      </section>
    </div>
  );
}

function SeriesTile({ series, cover, doneCount }: { series: Series; cover: ContentItem | null; doneCount: number }) {
  const thumb = cover ? thumbFor(cover) : null;
  const pct = series.items.length ? Math.round((doneCount / series.items.length) * 100) : 0;
  return (
    <Link to={`/series/${series.slug}`} className="series-card">
      <span className="series-cover">
        {thumb ? <img src={thumb} alt="" width={320} height={180} loading="lazy" decoding="async" /> : <Icon name="layers" />}
      </span>
      <strong>{series.title}</strong>
      <span className="soft">{series.items.length} פרקים · {series.kind === 'system' ? 'נבנתה באתר' : 'פלייליסט מקור'}</span>
      <span className="soft">{doneCount > 0 ? `הושלמו ${doneCount} במכשיר זה` : 'טרם הושלם פרק במכשיר זה'}</span>
      <span className="progress-track" aria-hidden="true"><span style={{ width: `${pct}%` }} /></span>
    </Link>
  );
}
