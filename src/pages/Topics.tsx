import { SITE_URL } from '../app/config.ts';
import { useHead } from '../app/head.ts';
import { useCanonicalRedirect } from '../app/redirect.tsx';
import { usePrefs } from '../app/prefs.tsx';
import { Link } from '../app/router.tsx';
import { useAsync, useRepo } from '../data/repo.ts';
import { CardGrid } from '../components/Media.tsx';
import { Breadcrumbs, CardSkeletons, EmptyState, ErrorState, Pagination, Notice } from '../components/ui.tsx';
import { breadcrumbJsonLd } from '../shared/seo.ts';
import { NotFound } from './NotFound.tsx';
import { useSearchParams } from '../app/router.tsx';

export function TopicsList() {
  const repo = useRepo();
  const r = useAsync(() => repo.listTopics(), [repo]);
  useHead({ title: 'נושאים', description: 'עיון בשיעורים לפי נושא: חגים ומועדים, פרשת השבוע, הלכה, אמונה, מורשת מרן הרב מאזוז.', path: '/topics' });
  return (
    <div className="container">
      <Breadcrumbs items={[{ label: 'בית', to: '/' }, { label: 'נושאים' }]} />
      <h1>נושאים</h1>
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
      {r.data?.some((t) => t.auto) && <p className="soft" style={{ marginTop: 'var(--s-5)' }}>חלק מהשיוכים לנושאים הוצעו אוטומטית לפי מילים בכותרת, וניתנים לתיקון בניהול.</p>}
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
  const questions = useAsync(() => repo.listPublicQuestions(), [repo]);
  const missing = !topics.loading && !topics.error && !topic;
  useCanonicalRedirect(missing, `/topics/${params.slug ?? ''}`);
  useHead({
    title: topic?.name ?? 'נושא',
    description: topic ? (topic.description || `שיעורים ותכנים בנושא ${topic.name}`) : null,
    path: topic ? `/topics/${topic.slug}` : `/topics/${params.slug}`,
    jsonLd: topic ? breadcrumbJsonLd(SITE_URL, [{ name: 'בית', path: '/' }, { name: 'נושאים', path: '/topics' }, { name: topic.name, path: `/topics/${topic.slug}` }]) : null,
  });
  if (topics.loading) return <div className="container section"><CardSkeletons /></div>;
  if (!topic) return <NotFound />;
  return (
    <div className="container">
      <Breadcrumbs items={[{ label: 'בית', to: '/' }, { label: 'נושאים', to: '/topics' }, { label: topic.name }]} />
      <h1>{topic.name}</h1>
      {topic.auto && <Notice>השיוך לנושא זה הוצע אוטומטית לפי מילים בכותרת.</Notice>}
      <div style={{ height: 'var(--s-4)' }} />
      {r.error && <ErrorState error={r.error} onRetry={r.reload} />}
      {r.loading && <CardSkeletons />}
      {questions.data && questions.data.some((q) => q.topicId === topic.id) && (
        <section style={{ marginTop: 'var(--s-6)' }} aria-labelledby="h-topic-q">
          <h2 id="h-topic-q">שאלות ותשובות בנושא</h2>
          <ul>{questions.data.filter((q) => q.topicId === topic.id).slice(0, 8).map((q) => <li key={q.id}><Link to={`/responsa/${q.slug}`}>{q.questionText.slice(0, 160)}</Link></li>)}</ul>
        </section>
      )}
      {r.data && (r.data.items.length ? (
        <>
          <p className="soft">{r.data.total} פריטים</p>
          <CardGrid items={r.data.items} view={prefs.view} />
          <Pagination page={page} total={r.data.total} pageSize={24} hrefFor={(p) => `/topics/${params.slug}?page=${p}`} />
        </>
      ) : <EmptyState title="אין פריטים בנושא זה עדיין" />)}
    </div>
  );
}
