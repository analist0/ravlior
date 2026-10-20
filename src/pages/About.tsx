import { useHead } from '../app/head.ts';
import { Link } from '../app/router.tsx';
import { useAsync, useRepo } from '../data/repo.ts';
import { BlockRenderer } from '../components/Blocks.tsx';
import { Icon } from '../components/Icon.tsx';
import { Badge, Breadcrumbs, CardSkeletons, ErrorState, Notice } from '../components/ui.tsx';
import { externalHref } from '../shared/sections.ts';

const host = (u: string) => { try { return decodeURI(new URL(u).hostname.replace(/^www\./, '')); } catch { return u; } };

export function AboutPage() {
  const repo = useRepo();
  const page = useAsync(() => repo.getPage('about'), [repo]);
  useHead({ title: 'הרב והמוסדות', description: page.data?.description ?? 'מידע מגובה מקורות על הרב ליאור כהן ומוסדות אור המאיר.', path: '/about' });
  return (
    <div className="container">
      <Breadcrumbs items={[{ label: 'בית', to: '/' }, { label: 'הרב והמוסדות' }]} />
      <div className="about-layout">
        <article>
          <h1>{page.data?.title ?? 'הרב והמוסדות'}</h1>
          {page.error && <ErrorState error={page.error} onRetry={page.reload} />}
          {page.loading && <CardSkeletons n={2} />}
          {page.data && <BlockRenderer blocks={page.data.blocks} />}
          <p className="soft">אין באתר ביוגרפיה, תארים או ציטוטים שלא נמצאו במקורות. תמונה רשמית תתווסף לאחר קבלת אישור.</p>
        </article>
        <aside className="inst-card" aria-label="המשך עיון">
          <h2 style={{ fontSize: 'var(--step-1)', margin: 0 }}>באתר</h2>
          <Link to="/institutions">מוסדות וקהילות</Link>
          <Link to="/events">לוח אירועים</Link>
          <Link to="/books">ספרים ועלונים</Link>
          <Link to="/p/contact">פנייה לאתר</Link>
          <Link to="/sources">מקורות האיסוף</Link>
        </aside>
      </div>
    </div>
  );
}

export function InstitutionsPage() {
  const repo = useRepo();
  const inst = useAsync(() => repo.listInstitutions(), [repo]);
  const events = useAsync(() => repo.listEvents(), [repo]);
  useHead({ title: 'מוסדות ופעילות', description: 'מוסדות אור המאיר, ישיבת מאור יוסף, הישיבה הגדולה אורחות מאיר וקהילת היכל משה — ופעילות מתועדת עם קישורים למקורות.', path: '/institutions' });
  return (
    <div className="container">
      <Breadcrumbs items={[{ label: 'בית', to: '/' }, { label: 'מוסדות ופעילות' }]} />
      <div className="spread">
        <h1>מוסדות ופעילות</h1>
        <Link className="btn btn-secondary" to="/events"><Icon name="calendar" /> לוח אירועים</Link>
      </div>
      <Notice>פרטי קשר, כתובות ולוחות שיעורים עדכניים טרם אומתו ולכן אינם מוצגים. מפה או שם מקום יופיעו רק אם נשמרו בפריט.</Notice>
      <section className="section" aria-labelledby="h-inst" style={{ paddingBlock: 'var(--s-6)' }}>
        <h2 id="h-inst">מוסדות וקהילות</h2>
        {inst.loading && <CardSkeletons n={4} />}
        {inst.error && <ErrorState error={inst.error} onRetry={inst.reload} />}
        <div className="inst-grid">
          {inst.data?.map((i) => {
            const map = externalHref(i.mapUrl);
            return (
              <article key={i.id} id={i.slug} className="inst-card">
                <Icon name="building" />
                <h3>{i.name}</h3>
                {i.description && <p className="muted" style={{ fontSize: 'var(--step--1)', margin: 0 }}>{i.description}</p>}
                {i.placeLabel && <p style={{ margin: 0 }}>{i.placeLabel}</p>}
                {map && <a href={map} target="_blank" rel="noopener noreferrer">מפה <Icon name="external" /></a>}
                <p className="soft" style={{ margin: 0 }}>מקורות: {i.sourceUrls.map((u) => <a key={u} href={u} target="_blank" rel="noopener noreferrer">{host(u)} </a>)}</p>
                <Link to={`/events?institution=${encodeURIComponent(i.slug)}`}>פעילות מתועדת</Link>
              </article>
            );
          })}
        </div>
      </section>
      <section aria-labelledby="h-ev">
        <div className="spread">
          <h2 id="h-ev">מבחר מהארכיון</h2>
          <Link to="/events">כל האירועים</Link>
        </div>
        <p className="soft">סיקורים ותיעוד שפורסמו באתרים אחרים. הרשימה המלאה, הלוח והוספה ליומן נמצאים בעמוד האירועים.</p>
        {events.loading && <CardSkeletons n={3} />}
        <ul className="event-list">
          {events.data?.slice(0, 4).map((e) => (
            <li key={e.id} className="event-card">
              <strong>{e.title}</strong>
              {e.summary && <span className="muted">{e.summary}</span>}
              <span className="row" style={{ gap: 6 }}>
                {e.dateText && <Badge>{e.dateText}</Badge>}
                <Link to={`/events#${e.slug}`}>בלוח</Link>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export function SourcesPage() {
  const repo = useRepo();
  const arch = useAsync(() => repo.listArchives(), [repo]);
  useHead({ title: 'מקורות', description: 'הארכיונים והאתרים שמהם נאסף המידע באתר, ומצב האימות של כל מקור.', path: '/sources' });
  return (
    <div className="container prose">
      <Breadcrumbs items={[{ label: 'בית', to: '/' }, { label: 'מקורות' }]} />
      <h1>מקורות</h1>
      <p className="muted">התכנים באתר נאספו מחיפוש ומקריאת דפים ציבוריים (איסוף 30.09.2026). זה מיפוי רחב של חומר שאותר, לא ארכיון מלא. המדיה עצמה לא נצפתה במלואה ולא הורדה.</p>
      {arch.error && <ErrorState error={arch.error} onRetry={arch.reload} />}
      <ul className="list-rows" style={{ listStyle: 'none', padding: 0 }}>
        {arch.data?.map((a) => (
          <li key={a.id} className="side-card">
            <div className="spread"><strong>{a.name}</strong><Badge tone={a.verification === 'candidate' ? 'warn' : undefined}>{a.verification === 'candidate' ? 'מועמד' : 'ארכיון'}</Badge></div>
            <p className="muted" style={{ fontSize: 'var(--step--1)', margin: 'var(--s-2) 0' }}>{a.material}</p>
            {a.note && <p className="soft" style={{ margin: 0 }}>{a.note}</p>}
            <a href={a.url} target="_blank" rel="noopener noreferrer">{host(a.url)} <Icon name="external" /></a>
          </li>
        ))}
      </ul>
    </div>
  );
}
