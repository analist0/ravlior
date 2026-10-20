import { useHead } from '../app/head.ts';
import { usePrefs } from '../app/prefs.tsx';
import { Link } from '../app/router.tsx';
import { useAsync, useRepo } from '../data/repo.ts';
import { CardGrid } from '../components/Media.tsx';
import { Breadcrumbs, CardSkeletons, EmptyState, ErrorState, Pagination, Notice } from '../components/ui.tsx';
import { NotFound } from './NotFound.tsx';
import { useSearchParams } from '../app/router.tsx';

export function TopicsList() {
  const repo = useRepo();
  const r = useAsync(() => repo.listTopics(), [repo]);
  useHead({ title: 'נושאים', description: 'עיון בשיעורים לפי נושא: חגים ומועדים, פרשת השבוע, הלכה, אמונה, מורשת מרן הרב מאזוז.', path: '/topics' });
  return (
    <div className="container">
      <Breadcrumbs items={[{ label: 'בית', to: '/' }, { label: 'נושאים' }]} />
      <header className="topic-hero">
        <p className="eyebrow">עיון</p>
        <h1>נושאים</h1>
        <p className="muted">שיעורים ותכנים לפי נושא. חלק מהשיוכים הוצעו אוטומטית מהכותרת וניתנים לתיקון בניהול.</p>
      </header>
      {r.error && <ErrorState error={r.error} onRetry={r.reload} />}
      {r.loading && <CardSkeletons n={6} />}
      <div className="grid-cards">
        {r.data?.map((t) => (
          <Link key={t.id} to={`/topics/${t.slug}`} className="action-tile" style={{ minHeight: 96 }}>
            <strong style={{ fontSize: 'var(--step-1)' }}>{t.name}</strong>
            {t.description && <span>{t.description}</span>}
          </Link>
        ))}
      </div>
      {r.data?.some((t) => t.auto) && <p className="soft" style={{ marginTop: 'var(--s-5)' }}>השיוך המסומן כאוטומטי נקבע לפי מילים בכותרת.</p>}
    </div>
  );
}

export function TopicPage({ params }: { params: Record<string, string> }) {
  const repo = useRepo();
  const { prefs } = usePrefs();
  const [sp] = useSearchParams();
  const page = Number(sp.get('page') ?? 1) || 1;
  const topics = useAsync(() => repo.listTopics(), [repo]);
  const topic = topics.data?.find((t) => t.slug === params.slug);
  const r = useAsync(() => repo.listContent({ topic: params.slug, page, pageSize: 24 }), [params.slug, page]);
  useHead({ title: topic?.name ?? 'נושא', description: topic ? `שיעורים ותכנים בנושא ${topic.name}` : null, path: `/topics/${params.slug}` });
  if (topics.loading) return <div className="container section"><CardSkeletons /></div>;
  if (!topic) return <NotFound />;
  return (
    <div className="container">
      <Breadcrumbs items={[{ label: 'בית', to: '/' }, { label: 'נושאים', to: '/topics' }, { label: topic.name }]} />
      <header className="topic-hero">
        <p className="eyebrow">נושא</p>
        <h1>{topic.name}</h1>
        {topic.description && <p className="muted">{topic.description}</p>}
        {r.data && <p className="topic-count soft">{r.data.total} פריטים</p>}
      </header>
      {topic.auto && <Notice>השיוך לנושא זה הוצע אוטומטית לפי מילים בכותרת.</Notice>}
      <div style={{ height: 'var(--s-4)' }} />
      {r.error && <ErrorState error={r.error} onRetry={r.reload} />}
      {r.loading && <CardSkeletons />}
      {r.data && (r.data.items.length ? (
        <>
          <CardGrid items={r.data.items} view={prefs.view} />
          <Pagination page={page} total={r.data.total} pageSize={24} hrefFor={(p) => `/topics/${params.slug}?page=${p}`} />
        </>
      ) : <EmptyState title="אין פריטים בנושא זה עדיין" />)}
    </div>
  );
}
