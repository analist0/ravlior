import { useHead } from '../app/head.ts';
import { usePrefs } from '../app/prefs.tsx';
import { Link } from '../app/router.tsx';
import { useAsync, useRepo } from '../data/repo.ts';
import { Icon } from '../components/Icon.tsx';
import { CardGrid } from '../components/Media.tsx';
import { Breadcrumbs, CardSkeletons, EmptyState, ErrorState, Notice } from '../components/ui.tsx';
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
  const { prefs } = usePrefs();
  const r = useAsync(() => repo.getSeries(params.slug ?? ''), [params.slug]);
  useHead({ title: r.data?.series.title ?? 'סדרה', description: r.data?.series.description ?? null, path: `/series/${params.slug}` });
  if (r.loading) return <div className="container section"><CardSkeletons /></div>;
  if (r.error) return <div className="container section"><ErrorState error={r.error} onRetry={r.reload} /></div>;
  if (!r.data) return <NotFound />;
  const { series, items } = r.data;
  return (
    <div className="container">
      <Breadcrumbs items={[{ label: 'בית', to: '/' }, { label: 'סדרות', to: '/series' }, { label: series.title }]} />
      <p className="eyebrow">{series.kind === 'system' ? 'סדרה שנבנתה באתר' : 'פלייליסט מקור'}</p>
      <h1>{series.title}</h1>
      {series.description && <p className="muted prose">{series.description}</p>}
      {series.sourceUrl && <p><a href={series.sourceUrl} target="_blank" rel="noopener noreferrer">לפלייליסט במקור</a></p>}
      <p className="soft">{items.length} פרקים, לפי הסדר שנקבע בניהול.</p>
      {items.length ? <CardGrid items={items} view={prefs.view} /> : <EmptyState title="אין פרקים מפורסמים בסדרה" />}
    </div>
  );
}
