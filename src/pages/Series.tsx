import { useHead } from '../app/head.ts';
import { useLibraryState } from '../app/library-state.tsx';
import { Link, useSearchParams } from '../app/router.tsx';
import { useAsync, useRepo } from '../data/repo.ts';
import { Icon } from '../components/Icon.tsx';
import { MediaPlayer, playableTrack, thumbFor } from '../components/Media.tsx';
import { usePlayer } from '../player/PlayerProvider.tsx';
import { useToast } from '../components/Toast.tsx';
import { Breadcrumbs, Button, CardSkeletons, EmptyState, ErrorState, Notice, splitTitle } from '../components/ui.tsx';
import { progressPct } from '../shared/hall.ts';
import { formatDuration } from '../shared/media.ts';
import { NotFound } from './NotFound.tsx';

export function SeriesList() {
  const repo = useRepo();
  const { progress } = useLibraryState();
  const r = useAsync(() => repo.listSeries(), [repo]);
  const coverIds = (r.data ?? []).map((s) => s.items[0]).filter((id): id is string => !!id);
  const covers = useAsync(() => repo.getContentByIds(coverIds), [coverIds.join(','), repo]);
  useHead({ title: 'סדרות', description: 'סדרות שיעורים: אור הנאמ״ן, רעיון מוסרי לפרשת השבוע, הפרק היומי ועוד.', path: '/series' });
  return (
    <div className="container">
      <Breadcrumbs items={[{ label: 'בית', to: '/' }, { label: 'סדרות' }]} />
      <h1>סדרות</h1>
      <Notice>רשימות שסומנו „נבנתה באתר” הן אוספים שיצרנו מכותרות הערוץ. אין בהן טענה שהן פלייליסט רשמי במקור.</Notice>
      <div style={{ height: 'var(--s-5)' }} />
      {r.error && <ErrorState error={r.error} onRetry={r.reload} />}
      {r.loading && <CardSkeletons n={4} />}
      {r.data?.length === 0 && <EmptyState icon="layers" title="אין סדרות עדיין" />}
      <div className="grid-cards">
        {r.data?.map((s) => {
          const cover = covers.data?.find((c) => c.id === s.items[0]);
          const thumb = cover ? thumbFor(cover) : null;
          const done = s.items.filter((id) => {
            const p = progress[id];
            return p && p.d && p.t / p.d >= 0.9;
          }).length;
          const pct = s.items.length ? Math.round((done / s.items.length) * 100) : 0;
          return (
            <Link key={s.id} to={`/series/${s.slug}`} className="series-card">
              <span className="series-cover">
                {thumb ? <img src={thumb} alt="" width={320} height={180} loading="lazy" decoding="async" /> : <Icon name="layers" />}
              </span>
              <strong>{s.title}</strong>
              <span>{s.description}</span>
              <span className="soft">{s.items.length} פריטים · {s.kind === 'system' ? 'נבנתה באתר' : 'פלייליסט מקור'}</span>
              <span className="progress-track" aria-hidden="true"><span style={{ width: `${pct}%` }} /></span>
              <span className="sr-only">{`הושלמו ${done} מתוך ${s.items.length}`}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function SeriesPage({ params }: { params: Record<string, string> }) {
  const repo = useRepo();
  const { progress } = useLibraryState();
  const player = usePlayer();
  const toast = useToast();
  const [search, update] = useSearchParams();
  const r = useAsync(() => repo.getSeries(params.slug ?? ''), [params.slug]);
  const series = r.data?.series;
  const items = r.data?.items ?? [];
  const resume = items.find((c) => {
    const p = progress[c.id];
    return p && p.t > 5 && (!p.d || p.t / p.d < 0.9);
  }) ?? items[0];
  const current = items.find((c) => c.slug === search.get('ep')) ?? resume;
  useHead({ title: series?.title ?? 'סדרה', description: series?.description ?? null, path: `/series/${params.slug}` });
  if (r.loading) return <div className="container section"><CardSkeletons /></div>;
  if (r.error) return <div className="container section"><ErrorState error={r.error} onRetry={r.reload} /></div>;
  if (!r.data || !series) return <NotFound />;
  const done = items.filter((c) => {
    const p = progress[c.id];
    return p && p.d && p.t / p.d >= 0.9;
  }).length;
  const tracks = items.map(playableTrack).filter((t): t is NonNullable<typeof t> => !!t);
  const playAll = () => {
    if (!tracks[0]) return;
    player.play(tracks[0]);
    for (const t of tracks.slice(1)) player.enqueue(t);
    toast(`נוספו ${tracks.length} הקלטות לתור`);
  };
  const index = current ? items.findIndex((c) => c.id === current.id) : -1;
  const saved = current ? progress[current.id] : undefined;
  return (
    <div className="series-page">
      <div className="container">
        <Breadcrumbs items={[{ label: 'בית', to: '/' }, { label: 'אודיטוריום', to: '/watch' }, { label: 'סדרות', to: '/series' }, { label: series.title }]} />
      </div>
      <section className="cinema series-cinema">
        <div className="container cinema-grid">
          <div className="cinema-copy">
            <p className="eyebrow">{series.kind === 'system' ? 'סדרה שנבנתה באתר' : 'פלייליסט מקור'}</p>
            <h1>{series.title}</h1>
            <hr className="cinema-rule" />
            {series.description && <p className="hall-lede">{series.description}</p>}
            <p className="soft">{items.length} פרקים לפי הסדר שנקבע בניהול. הושלמו {done} במכשיר זה.</p>
            <div className="progress-track" aria-hidden="true">
              <span style={{ width: items.length ? `${Math.round((done / items.length) * 100)}%` : '0%' }} />
            </div>
            <p className="sr-only">{`הושלמו ${done} מתוך ${items.length}`}</p>
            <div className="row">
              {tracks.length > 0 && <Button variant="secondary" icon="queue" onClick={playAll}>האזנה לכל הסדרה ברקע</Button>}
            </div>
          </div>
          <div className="cinema-player">
            {current ? (
              <>
                <p className="eyebrow">{index >= 0 ? `פרק ${index + 1} מתוך ${items.length}` : 'פרק'}</p>
                <h2>{splitTitle(current.title)[0]}</h2>
                <MediaPlayer item={current} startAt={saved && saved.t > 5 ? Math.floor(saved.t) : null} />
              </>
            ) : (
              <EmptyState title="אין פרקים מפורסמים בסדרה" />
            )}
          </div>
        </div>
      </section>
      <div className="container section">
        {items.length === 0 && <EmptyState title="אין פרקים מפורסמים בסדרה" />}
        {items.length > 0 && (
          <ol className="playlist">
            {items.map((item, i) => {
              const [main] = splitTitle(item.title);
              const p = progress[item.id];
              const pct = p ? progressPct(p.t, p.d) : null;
              const thumb = thumbFor(item);
              const duration = item.durationText ?? (item.durationSeconds ? formatDuration(item.durationSeconds) : null);
              const active = current?.id === item.id;
              return (
                <li key={item.id} className="playlist-row" aria-current={active ? 'true' : undefined}>
                  <span className="playlist-num ltr">{i + 1}</span>
                  <button type="button" className="playlist-main" onClick={() => { update({ ep: item.slug }); document.querySelector('.cinema-player')?.scrollIntoView({ block: 'nearest' }); }}>
                    <span className="playlist-thumb">
                      {thumb ? <img src={thumb} alt="" width={120} height={68} loading="lazy" decoding="async" onError={(e) => e.currentTarget.classList.add('img-failed')} /> : <Icon name={item.type === 'audio' ? 'listen' : 'watch'} />}
                    </span>
                    <span>
                      <span className="playlist-title">{main}</span>
                      <span className="soft">{duration ? <span className="ltr">{duration}</span> : 'משך לא ידוע'}{pct != null ? ` · ${pct}%` : ''}</span>
                    </span>
                  </button>
                  <Link className="btn btn-ghost btn-sm" to={`/item/${item.slug}${p && p.t > 5 ? `?t=${Math.floor(p.t)}` : ''}`}>דף השיעור</Link>
                  {pct != null && <span className="progress-track" aria-hidden="true"><span style={{ width: `${pct}%` }} /></span>}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
