import { SITE_URL } from '../app/config.ts';
import { useHead } from '../app/head.ts';
import { useLibraryState } from '../app/library-state.tsx';
import { Link } from '../app/router.tsx';
import { useAsync, useRepo } from '../data/repo.ts';
import { Icon } from '../components/Icon.tsx';
import { CardGrid, thumbFor, playableTrack } from '../components/Media.tsx';
import { usePlayer } from '../player/PlayerProvider.tsx';
import { useToast } from '../components/Toast.tsx';
import { Breadcrumbs, Button, CardSkeletons, EmptyState, ErrorState, Notice, splitTitle } from '../components/ui.tsx';
import { formatDuration } from '../shared/media.ts';
import { useCanonicalRedirect } from '../app/redirect.tsx';
import { usePrefs } from '../app/prefs.tsx';
import { breadcrumbJsonLd } from '../shared/seo.ts';
import { NotFound } from './NotFound.tsx';

export function SeriesList() {
  const repo = useRepo();
  const r = useAsync(() => repo.listSeries(), [repo]);
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
        {r.data?.map((s) => (
          <Link key={s.id} to={`/series/${s.slug}`} className="action-tile" style={{ minHeight: 170 }}>
            <Icon name="layers" />
            <strong style={{ fontSize: 'var(--step-2)' }}>{s.title}</strong>
            <span>{s.description}</span>
            <span className="soft">{s.items.length} פריטים · {s.kind === 'system' ? 'נבנתה באתר' : 'פלייליסט מקור'}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function SeriesPage({ params }: { params: Record<string, string> }) {
  const repo = useRepo();
  const { progress } = useLibraryState();
  const player = usePlayer();
  const toast = useToast();
  const r = useAsync(() => repo.getSeries(params.slug ?? ''), [params.slug]);
  const missing = !r.loading && !r.error && !r.data;
  useCanonicalRedirect(missing, `/series/${params.slug ?? ''}`);
  useHead({
    title: r.data?.series.title ?? 'סדרה',
    description: r.data?.series.description ?? null,
    path: r.data ? `/series/${r.data.series.slug}` : `/series/${params.slug}`,
    jsonLd: r.data ? breadcrumbJsonLd(SITE_URL, [{ name: 'בית', path: '/' }, { name: 'סדרות', path: '/series' }, { name: r.data.series.title, path: `/series/${r.data.series.slug}` }]) : null,
  });
  if (r.loading) return <div className="container section"><CardSkeletons /></div>;
  if (r.error) return <div className="container section"><ErrorState error={r.error} onRetry={r.reload} /></div>;
  if (!r.data) return <NotFound />;
  const { series, items } = r.data;
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
  const resume = items.find((c) => {
    const p = progress[c.id];
    return p && p.t > 5 && (!p.d || p.t / p.d < 0.9);
  }) ?? items[0];
  return (
    <div className="container">
      <Breadcrumbs items={[{ label: 'בית', to: '/' }, { label: 'אודיטוריום', to: '/watch' }, { label: 'סדרות', to: '/series' }, { label: series.title }]} />
      <p className="eyebrow">{series.kind === 'system' ? 'סדרה שנבנתה באתר' : 'פלייליסט מקור'}</p>
      <h1>{series.title}</h1>
      {series.description && <p className="muted prose">{series.description}</p>}
      {series.sourceUrl && <p><a href={series.sourceUrl} target="_blank" rel="noopener noreferrer">לפלייליסט במקור</a></p>}
      <p className="soft">{items.length} פרקים לפי הסדר שנקבע בניהול. הושלמו {done} במכשיר זה.</p>
      <div className="progress-track" style={{ marginBottom: 'var(--s-4)' }} aria-hidden="true">
        <span style={{ width: items.length ? `${Math.round((done / items.length) * 100)}%` : '0%' }} />
      </div>
      <div className="row" style={{ marginBottom: 'var(--s-5)' }}>
        {resume && <Link className="btn" to={`/item/${resume.slug}${progress[resume.id] ? `?t=${Math.floor(progress[resume.id]!.t)}` : ''}`}><Icon name="play" /> {progress[resume.id] ? 'המשך הסדרה' : 'לפרק הראשון'}</Link>}
        {tracks.length > 0 && <Button variant="secondary" icon="queue" onClick={playAll}>האזנה לכל הסדרה ברקע</Button>}
      </div>
      {items.length === 0 && <EmptyState title="אין פרקים מפורסמים בסדרה" />}
      {items.length > 0 && (
        <ol className="playlist">
          {items.map((item, i) => {
            const [main] = splitTitle(item.title);
            const p = progress[item.id];
            const pct = p?.d ? Math.min(100, Math.round((p.t / p.d) * 100)) : null;
            const thumb = thumbFor(item);
            const duration = item.durationText ?? (item.durationSeconds ? formatDuration(item.durationSeconds) : null);
            return (
              <li key={item.id} className="playlist-row">
                <span className="playlist-num ltr">{i + 1}</span>
                <Link to={`/item/${item.slug}${p && p.t > 5 ? `?t=${Math.floor(p.t)}` : ''}`} className="playlist-main">
                  <span className="playlist-thumb">
                    {thumb ? <img src={thumb} alt="" width={120} height={68} loading="lazy" decoding="async" onError={(e) => e.currentTarget.classList.add('img-failed')} /> : <Icon name={item.type === 'audio' ? 'listen' : 'watch'} />}
                  </span>
                  <span>
                    <span className="playlist-title">{main}</span>
                    <span className="soft">{duration ? <span className="ltr">{duration}</span> : 'משך לא ידוע'}{pct != null ? ` · ${pct}%` : ''}</span>
                  </span>
                </Link>
                {pct != null && <span className="progress-track" aria-hidden="true"><span style={{ width: `${pct}%` }} /></span>}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
