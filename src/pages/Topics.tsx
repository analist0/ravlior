import { SITE_URL } from '../app/config.ts';
import { useMemo, useState } from 'react';
import { useHead } from '../app/head.ts';
import { useCanonicalRedirect } from '../app/redirect.tsx';
import { usePrefs } from '../app/prefs.tsx';
import { Link, useSearchParams } from '../app/router.tsx';
import { useAsync, useRepo } from '../data/repo.ts';
import { CardGrid } from '../components/Media.tsx';
import { TopicCard } from '../components/TopicCard.tsx';
import { Icon } from '../components/Icon.tsx';
import { Breadcrumbs, CardSkeletons, EmptyState, ErrorState, Pagination, Notice } from '../components/ui.tsx';
import { breadcrumbJsonLd } from '../shared/seo.ts';
import { heMatches } from '../shared/hebrew.ts';
import { featuredShelf, itemCountLabel } from '../shared/topic-shelf.ts';
import { NotFound } from './NotFound.tsx';

const IMG = import.meta.env.BASE_URL + 'images/topics-hero';

export function TopicsList() {
  const repo = useRepo();
  const shelves = useAsync(() => repo.topicShelves(), [repo]);
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  useHead({ title: 'נושאים', description: 'עיון בשיעורים לפי נושא: חגים ומועדים, פרשת השבוע, הלכה, אמונה, מורשת מרן הרב מאזוז.', path: '/topics' });
  const all = shelves.data ?? [];
  const filtered = useMemo(
    () => all.filter((s) => !q.trim() || heMatches(`${s.name} ${s.description ?? ''}`, q)),
    [all, q],
  );
  const featured = q.trim() ? null : featuredShelf(all);
  const rest = featured ? filtered.filter((s) => s.id !== featured.id) : filtered;
  return (
    <div className="study-hall">
      <div className="container">
        <Breadcrumbs items={[{ label: 'בית', to: '/' }, { label: 'נושאים' }]} />
        <figure className="hall-hero">
          <img
            src={`${IMG}-1024.webp`}
            srcSet={`${IMG}-640.webp 640w, ${IMG}-1024.webp 1024w, ${IMG}-1600.webp 1600w`}
            sizes="(max-width: 800px) 100vw, 1100px"
            width={1600}
            height={800}
            alt="הרב ליאור כהן שליט״א"
            fetchPriority="high"
            decoding="async"
          />
          <figcaption className="hall-hero-copy">
            <p className="hall-kicker">הרב ליאור כהן</p>
            <h1>נושאים</h1>
            <p>שיעורים ותכנים לפי נושא. המספר על כל כרטיס הוא שיעורים שפורסמו.</p>
          </figcaption>
        </figure>
        <form className="hall-search" role="search" onSubmit={(e) => { e.preventDefault(); setQ(text.trim()); }}>
          <label className="sr-only" htmlFor="topic-q">חיפוש נושא</label>
          <input id="topic-q" className="input" type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="למשל: שבת, הלכה, פרשה" enterKeyHint="search" />
          <button className="btn btn-gold" type="submit"><Icon name="search" /> חיפוש</button>
        </form>
        {shelves.error && <ErrorState error={shelves.error} onRetry={shelves.reload} />}
        {shelves.loading && <CardSkeletons n={6} />}
        {featured && (
          <section className="hall-feature-wrap" aria-labelledby="h-feature">
            <h2 id="h-feature" className="sr-only">המדף עם הכי הרבה שיעורים</h2>
            <TopicCard shelf={featured} featured />
          </section>
        )}
        <div className="hall-section-head">
          <h2>כל הנושאים</h2>
          <p>{q.trim() ? `${filtered.length} תוצאות` : `${all.length} נושאים`}</p>
        </div>
        {shelves.data && filtered.length === 0 && (
          <EmptyState title="אין נושא בשם הזה" action={<Link className="btn btn-gold" to={`/library?q=${encodeURIComponent(q)}`}>חיפוש בספרייה</Link>}>
            אפשר לחפש את המילה בכל השיעורים.
          </EmptyState>
        )}
        <ul className="topic-cards">
          {rest.map((s) => (
            <li key={s.id}><TopicCard shelf={s} /></li>
          ))}
        </ul>
        {all.some((s) => s.auto) && <p className="hall-note">שיוך שסומן כאוטומטי נקבע לפי מילים בכותרת, ואפשר לתקן אותו בניהול.</p>}
      </div>
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
    <div className="study-hall">
      <div className="container">
        <Breadcrumbs items={[{ label: 'בית', to: '/' }, { label: 'נושאים', to: '/topics' }, { label: topic.name }]} />
        <figure className="hall-hero is-topic">
          <img
            src={`${IMG}-1024.webp`}
            srcSet={`${IMG}-640.webp 640w, ${IMG}-1024.webp 1024w, ${IMG}-1600.webp 1600w`}
            sizes="(max-width: 800px) 100vw, 1100px"
            width={1600}
            height={800}
            alt=""
            fetchPriority="high"
            decoding="async"
          />
          <figcaption className="hall-hero-copy">
            <p className="hall-kicker">נושא</p>
            <h1>{topic.name}</h1>
            {topic.description && <p>{topic.description}</p>}
            {r.data && <p className="hall-count">{itemCountLabel(r.data.total)}</p>}
          </figcaption>
        </figure>
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
    </div>
  );
}
