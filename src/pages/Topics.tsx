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
import { Icon, type IconName } from '../components/Icon.tsx';
import type { Topic } from '../shared/types.ts';

const IMG = import.meta.env.BASE_URL + 'images/topics-hero';
const PALETTES = [
  { a: '#1f3a5f', b: '#c9a24a' }, { a: '#4a2c2a', b: '#d4a373' }, { a: '#23412f', b: '#b8c480' }, { a: '#3b2f5c', b: '#c8a2e0' },
  { a: '#5c3b1f', b: '#e3b964' }, { a: '#1e4a4f', b: '#86c5c0' }, { a: '#5a1f2e', b: '#e09aa6' }, { a: '#2e3440', b: '#c9a24a' },
];
const PATTERNS = ['dots', 'lines', 'grid', 'waves'];
function hash(s: string): number { let h = 0; for (const ch of s) h = (h * 31 + ch.codePointAt(0)!) >>> 0; return h; }
function iconFor(t: Topic): IconName {
  const n = t.name;
  if (/חג|מועד|שבת|פסח|סוכות|חנוכה|פורים|ימים נוראים/.test(n)) return 'calendar';
  if (/פרש/.test(n)) return 'read';
  if (/הלכ/.test(n)) return 'layers';
  if (/אמונ|תפיל|מוסר/.test(n)) return 'heart';
  if (/מורש|מרן|מאזוז|גדול/.test(n)) return 'building';
  if (/שאל|תשוב/.test(n)) return 'ask';
  if (/שיעור|וידאו/.test(n)) return 'watch';
  return 'library';
}
export function topicLook(t: Topic) {
  const h = hash(t.slug);
  const p = PALETTES[h % PALETTES.length]!;
  return { style: { '--topic-a': p.a, '--topic-b': p.b } as React.CSSProperties, pattern: PATTERNS[(h >> 3) % PATTERNS.length]!, icon: iconFor(t) };
}

/** Banner of Rabbi Lior Cohen (owner-supplied photo). With `title`, the right (dark) side shows the topic name in gold. */
function TopicsHero({ title, eyebrow }: { title?: string; eyebrow?: string }) {
  return (
    <figure className={`topics-banner${title ? ' has-title' : ''}`}>
      <picture>
        <source type="image/avif" srcSet={`${IMG}-640.avif 640w, ${IMG}-1024.avif 1024w, ${IMG}-1600.avif 1600w`} sizes="(max-width: 1200px) 100vw, 1200px" />
        <img src={`${IMG}-1024.webp`} srcSet={`${IMG}-640.webp 640w, ${IMG}-1024.webp 1024w, ${IMG}-1600.webp 1600w`} sizes="(max-width: 1200px) 100vw, 1200px"
          width={1600} height={800} alt="הרב ליאור כהן שליט״א" fetchPriority="high" decoding="async" />
      </picture>
      {title && (
        <div className="topics-banner-title">
          {eyebrow && <span className="topics-banner-eyebrow">{eyebrow}</span>}
          <h1>{title}</h1>
        </div>
      )}
      {!title && <figcaption>הגאון הרב ליאור כהן שליט״א · שיעורים ותכנים לפי נושא</figcaption>}
    </figure>
  );
}

export function TopicsList() {
  const repo = useRepo();
  const r = useAsync(() => repo.listTopics(), [repo]);
  useHead({ title: 'נושאים', description: 'עיון בשיעורים לפי נושא: חגים ומועדים, פרשת השבוע, הלכה, אמונה, מורשת מרן הרב מאזוז.', path: '/topics' });
  return (
    <div className="container">
      <Breadcrumbs items={[{ label: 'בית', to: '/' }, { label: 'נושאים' }]} />
      <TopicsHero />
      <header className="topic-hero">
        <p className="eyebrow">עיון</p>
        <h1>נושאים</h1>
        <p className="muted">שיעורים ותכנים לפי נושא. חלק מהשיוכים הוצעו אוטומטית מהכותרת וניתנים לתיקון בניהול.</p>
      </header>
      {r.error && <ErrorState error={r.error} onRetry={r.reload} />}
      {r.loading && <CardSkeletons n={6} />}
      <ul className="topic-cards">
        {r.data?.map((t) => {
          const look = topicLook(t);
          return (
            <li key={t.id}>
              <Link to={`/topics/${t.slug}`} className={`topic-card pat-${look.pattern}`} style={look.style}>
                <span className="topic-card-icon" aria-hidden="true"><Icon name={look.icon} /></span>
                <strong>{t.name}</strong>
                {t.description && <span className="topic-card-desc">{t.description}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
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
      <div style={topicLook(topic).style}><TopicsHero title={topic.name} eyebrow="נושא" /></div>
      <header className="topic-hero">
        {topic.description && <p className="muted">{topic.description}</p>}
        {r.data && <p className="topic-count soft">{r.data.total} פריטים</p>}
      </header>
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
          <CardGrid items={r.data.items} view={prefs.view} />
          <Pagination page={page} total={r.data.total} pageSize={24} hrefFor={(p) => `/topics/${params.slug}?page=${p}`} />
        </>
      ) : <EmptyState title="אין פריטים בנושא זה עדיין" />)}
    </div>
  );
}
