import { useHead } from '../app/head.ts';
import { useAsync, useRepo } from '../data/repo.ts';
import { BlockRenderer } from '../components/Blocks.tsx';
import { Icon } from '../components/Icon.tsx';
import { Badge, Breadcrumbs, CardSkeletons, ErrorState, Notice } from '../components/ui.tsx';

const host = (u: string) => { try { return decodeURI(new URL(u).hostname.replace(/^www\./, '')); } catch { return u; } };

export function AboutPage() {
  const repo = useRepo();
  const page = useAsync(() => repo.getPage('about'), [repo]);
  useHead({ title: 'הרב והמוסדות', description: page.data?.description ?? 'מידע מגובה מקורות על הרב ליאור כהן ומוסדות אור המאיר.', path: '/about' });
  return (
    <div className="container">
      <Breadcrumbs items={[{ label: 'בית', to: '/' }, { label: 'הרב והמוסדות' }]} />
      <h1>{page.data?.title ?? 'הרב והמוסדות'}</h1>
      {page.error && <ErrorState error={page.error} onRetry={page.reload} />}
      {page.data && <BlockRenderer blocks={page.data.blocks} />}
      <p className="soft">אין באתר ביוגרפיה, תארים או ציטוטים שלא נמצאו במקורות. תמונה רשמית תתווסף לאחר קבלת אישור.</p>
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
      <h1>מוסדות ופעילות</h1>
      <Notice>פרטי קשר, כתובות ולוחות שיעורים עדכניים טרם אומתו ולכן אינם מוצגים.</Notice>
      <section className="section" aria-labelledby="h-inst" style={{ paddingBlock: 'var(--s-6)' }}>
        <h2 id="h-inst">מוסדות וקהילות</h2>
        {inst.loading && <CardSkeletons n={4} />}
        {inst.error && <ErrorState error={inst.error} onRetry={inst.reload} />}
        <div className="grid-cards">
          {inst.data?.map((i) => (
            <article key={i.id} className="side-card">
              <Icon name="building" />
              <h3 style={{ marginTop: 'var(--s-2)' }}>{i.name}</h3>
              {i.description && <p className="muted" style={{ fontSize: 'var(--step--1)' }}>{i.description}</p>}
              <p className="soft" style={{ margin: 0 }}>מקורות: {i.sourceUrls.map((u, k) => <a key={u} href={u} target="_blank" rel="noopener noreferrer">{k ? ' · ' : ''}{host(u)}</a>)}</p>
            </article>
          ))}
        </div>
      </section>
      <section aria-labelledby="h-ev">
        <h2 id="h-ev">ארכיון פעילות מתועדת</h2>
        <p className="soft">סיקורים ותיעוד שפורסמו באתרים אחרים. תאריך אירוע מוצג רק אם צוין במפורש.</p>
        {events.loading && <CardSkeletons n={3} />}
        <ul className="list-rows" style={{ listStyle: 'none', padding: 0 }}>
          {events.data?.map((e) => (
            <li key={e.id} className="row-item" style={{ gridTemplateColumns: '1fr' }}>
              <strong>{e.title}</strong>
              {e.summary && <span className="muted" style={{ fontSize: 'var(--step--1)' }}>{e.summary}</span>}
              <span className="row" style={{ gap: 6 }}>
                {e.dateText && <Badge>{e.dateText}</Badge>}
                {e.sourceUrls.map((u) => <a key={u} href={u} target="_blank" rel="noopener noreferrer" className="soft">{host(u)} <Icon name="external" /></a>)}
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
