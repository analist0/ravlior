import { useHead } from '../app/head.ts';
import { useLibraryState } from '../app/library-state.tsx';
import { Link } from '../app/router.tsx';
import { useAsync, useRepo } from '../data/repo.ts';
import { Icon } from '../components/Icon.tsx';
import { CardGrid, MediaPlayer } from '../components/Media.tsx';
import { HeroArt, Reveal } from '../components/Motion.tsx';
import { Badge, CardSkeletons, ErrorState, LinkButton, splitTitle } from '../components/ui.tsx';
import { formatDuration } from '../shared/media.ts';
import type { HomeSection } from '../shared/types.ts';

function Actions() {
  const tiles = [
    { to: '/library?type=video', icon: 'watch' as const, title: 'לצפות', text: 'שיעורים, דרשות וקטעים קצרים' },
    { to: '/library?type=audio', icon: 'listen' as const, title: 'להאזין', text: 'תוכנית אור הנאמ״ן והקלטות' },
    { to: '/books', icon: 'read' as const, title: 'לעיין', text: 'ספרים, עלונים ודברי תורה' },
    { to: '/ask', icon: 'ask' as const, title: 'לשאול', text: 'שאלה לרב, גם בעילום שם' },
  ];
  return (
    <nav className="actions-grid" aria-label="פעולות ראשיות">
      {tiles.map((t, i) => (
        <Reveal key={t.to} delay={0.05 * i}>
          <Link to={t.to} className="action-tile">
            <Icon name={t.icon} />
            <strong>{t.title}</strong>
            <span>{t.text}</span>
          </Link>
        </Reveal>
      ))}
    </nav>
  );
}

function Continue({ title }: { title: string }) {
  const { progress } = useLibraryState();
  const entries = Object.entries(progress).sort((a, b) => b[1].at - a[1].at).slice(0, 4);
  if (!entries.length) return null;
  return (
    <section className="section container" aria-labelledby="h-continue">
      <div className="section-head"><h2 id="h-continue">{title}</h2><Link to="/favorites">כל ההמשכים והשמורים</Link></div>
      <ul className="list-rows" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {entries.map(([id, e]) => (
          <li key={id} className="row-item" style={{ gridTemplateColumns: '1fr auto' }}>
            <div>
              <Link to={`/item/${e.slug}`} style={{ fontWeight: 600 }}>{e.title}</Link>
              <div className="soft">הופסק ב־<span className="ltr">{formatDuration(e.t)}</span>{e.d ? <> מתוך <span className="ltr">{formatDuration(e.d)}</span></> : null}</div>
            </div>
            <Link className="btn btn-sm" to={`/item/${e.slug}`}><Icon name="play" /> להמשיך</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Section({ s }: { s: HomeSection }) {
  const repo = useRepo();
  const limit = s.config.limit ?? 8;
  const data = useAsync(async () => {
    switch (s.kind) {
      case 'latest': return { items: (await repo.listContent({ pageSize: limit, type: s.config.type })).items };
      case 'featured': {
        if (s.config.contentIds?.length) return { items: await repo.getContentByIds(s.config.contentIds) };
        const r = await repo.listContent({ type: 'video', pageSize: 60 });
        return { items: r.items.filter((c) => c.featured).slice(0, 1) };
      }
      case 'books': return { items: (await repo.listContent({ type: 'book', pageSize: limit })).items };
      case 'answers': {
        const [pq, ext] = await Promise.all([repo.listPublicQuestions(), repo.listContent({ type: 'answer', pageSize: limit })]);
        return { items: ext.items, questions: pq.slice(0, limit) };
      }
      case 'series': return { series: await repo.listSeries() };
      case 'topics': return { topics: await repo.listTopics() };
      default: return {};
    }
  }, [s.id, s.kind, limit]);
  const id = `h-${s.id}`;
  if (data.error) return <div className="container"><ErrorState error={data.error} onRetry={data.reload} /></div>;

  if (s.kind === 'featured') {
    const item = data.data?.items?.[0];
    if (!item && !data.loading) return null;
    return (
      <Reveal as="section">
        <div className="section container" aria-labelledby={id}>
          <p className="eyebrow">{s.title}</p>
          {item ? (
            <div className="item-layout">
              <MediaPlayer item={item} />
              <div>
                <h2 id={id}><Link to={`/item/${item.slug}`} style={{ color: 'var(--text)', textDecoration: 'none' }}>{splitTitle(item.title)[0]}</Link></h2>
                {splitTitle(item.title)[1] && <p className="muted">{splitTitle(item.title)[1]}</p>}
                <div className="row">{item.durationText && <Badge>{item.durationText}</Badge>}<Badge tone="accent">וידאו</Badge></div>
                <p style={{ marginTop: 'var(--s-4)' }}><LinkButton to={`/item/${item.slug}`} variant="secondary">לדף השיעור</LinkButton></p>
              </div>
            </div>
          ) : <CardSkeletons n={1} />}
        </div>
      </Reveal>
    );
  }

  return (
    <Reveal as="section">
      <div className="section container" aria-labelledby={id}>
        <div className="section-head">
          <h2 id={id}>{s.title}</h2>
          {s.kind === 'latest' && <Link to="/library">לכל הספרייה</Link>}
          {s.kind === 'series' && <Link to="/series">לכל הסדרות</Link>}
          {s.kind === 'topics' && <Link to="/topics">לכל הנושאים</Link>}
          {s.kind === 'books' && <Link to="/books">לכל הספרים והעלונים</Link>}
          {s.kind === 'answers' && <Link to="/responsa">למאגר השו״ת</Link>}
        </div>
        {data.loading && <CardSkeletons n={4} />}
        {s.kind === 'latest' && data.data?.items && (
          <>
            <p className="soft" style={{ marginTop: '-0.5rem' }}>לפי סדר הפריטים בערוץ מוסדות אור המאיר; תאריכי הקלטה אינם ידועים לרוב הפריטים.</p>
            <CardGrid items={data.data.items} />
          </>
        )}
        {s.kind === 'books' && data.data?.items && <CardGrid items={data.data.items} view="list" />}
        {s.kind === 'answers' && data.data && (
          <div className="list-rows">
            {data.data.questions?.map((q) => (
              <Link key={q.id} to={`/responsa/${q.slug}`} className="row-item" style={{ gridTemplateColumns: '1fr', textDecoration: 'none', color: 'var(--text)' }}>
                <strong>{q.questionText.slice(0, 140)}</strong><span className="soft">{q.attribution}</span>
              </Link>
            ))}
            {data.data.items && <CardGrid items={data.data.items} view="list" />}
          </div>
        )}
        {s.kind === 'series' && data.data?.series && (
          <div className="grid-cards">
            {data.data.series.map((x) => (
              <Link key={x.id} to={`/series/${x.slug}`} className="action-tile" style={{ minHeight: 140 }}>
                <Icon name="layers" />
                <strong style={{ fontSize: 'var(--step-1)' }}>{x.title}</strong>
                <span>{x.items.length} פריטים · {x.kind === 'system' ? 'רשימה שנבנתה באתר' : 'פלייליסט מקור'}</span>
              </Link>
            ))}
          </div>
        )}
        {s.kind === 'topics' && data.data?.topics && (
          <div className="row">
            {data.data.topics.map((t) => <Link key={t.id} className="chip" to={`/topics/${t.slug}`}>{t.name}</Link>)}
          </div>
        )}
      </div>
    </Reveal>
  );
}

export function HomePage() {
  const repo = useRepo();
  const sections = useAsync(() => repo.getHomeSections(), [repo]);
  useHead({ title: '', description: 'ספריית שיעורים, דרשות, ספרים ותשובות של הרב ליאור כהן ומוסדות אור המאיר — לצפות, להאזין, לעיין ולשאול.', path: '/' });
  const enabled = (sections.data ?? []).filter((s) => s.enabled).sort((a, b) => a.position - b.position);
  const showActions = enabled.some((s) => s.kind === 'actions');
  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <HeroArt />
        <div className="container">
          <p className="eyebrow">בית מדרש דיגיטלי · מוסדות אור המאיר</p>
          <h1 id="hero-title">לצפות, להאזין, <span className="gold">לעיין</span> ולשאול</h1>
          <p className="hero-lede">שיעורים, דרשות, ספרים ותשובות של הרב ליאור כהן, והנחלת תורתו של מרן הרב מאיר מאזוז זצ״ל — כל פריט עם ייחוס למקורו.</p>
          {showActions && <Actions />}
        </div>
      </section>
      {sections.error && <div className="container"><ErrorState error={sections.error} onRetry={sections.reload} /></div>}
      {enabled.filter((s) => s.kind !== 'actions').map((s) => (s.kind === 'continue' ? <Continue key={s.id} title={s.title} /> : <Section key={s.id} s={s} />))}
    </>
  );
}
