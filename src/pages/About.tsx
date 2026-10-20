import { useHead } from '../app/head.ts';
import { Link } from '../app/router.tsx';
import { useAsync, useRepo } from '../data/repo.ts';
import { BlockRenderer } from '../components/Blocks.tsx';
import { Icon } from '../components/Icon.tsx';
import { PageIntro } from '../components/PageIntro.tsx';
import { Badge, Breadcrumbs, CardSkeletons, EmptyState, ErrorState, LinkButton } from '../components/ui.tsx';
import { bookOffers, externalHref, linkHost } from '../shared/sections.ts';

export function AboutPage() {
  const repo = useRepo();
  const page = useAsync(() => repo.getPage('about'), [repo]);
  useHead({ title: 'הרב והמוסדות', description: page.data?.description ?? 'מידע מגובה מקורות על הרב ליאור כהן ומוסדות אור המאיר.', path: '/about' });
  return (
    <div className="container">
      <Breadcrumbs items={[{ label: 'בית', to: '/' }, { label: 'הרב והמוסדות' }]} />
      <PageIntro eyebrow="הבית" title={page.data?.title ?? 'הרב והמוסדות'} lede="מוצג רק מה שמגובה במקור. ביוגרפיה, תארים, ציטוטים ופרטי קשר שלא אומתו אינם נכתבים כאן. תמונה רשמית תתווסף לאחר אישור." />
      <div className="about-layout">
        <article>
          {page.error && <ErrorState error={page.error} onRetry={page.reload} />}
          {page.loading && <CardSkeletons n={2} />}
          {page.data && <BlockRenderer blocks={page.data.blocks} />}
        </article>
        <aside className="inst-card" aria-label="המשך עיון">
          <h2 style={{ fontSize: 'var(--step-1)', margin: 0 }}>באתר</h2>
          <Link to="/institutions">מוסדות וקהילות</Link>
          <Link to="/events">לוח אירועים</Link>
          <Link to="/books">ספרים ועלונים</Link>
          <Link to="/p/contact">פנייה לאתר</Link>
          <Link to="/support">תמיכה</Link>
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
      <PageIntro eyebrow="הבית" title="מוסדות ופעילות" lede="פרטי קשר, כתובות ולוחות שיעורים עדכניים טרם אומתו ולכן אינם מוצגים. מפה או שם מקום יופיעו רק אם נשמרו בפריט.">
        <p style={{ margin: 'var(--s-4) 0 0' }}><Link className="btn btn-gold" to="/events"><Icon name="calendar" /> לוח אירועים</Link></p>
      </PageIntro>
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
                <p className="soft" style={{ margin: 0 }}>מקורות: {i.sourceUrls.map((u) => <a key={u} href={u} target="_blank" rel="noopener noreferrer">{linkHost(u)} </a>)}</p>
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

export function SupportPage() {
  const repo = useRepo();
  const books = useAsync(() => repo.listContent({ type: 'book', pageSize: 100 }), [repo]);
  const leaflets = useAsync(() => repo.listContent({ type: 'leaflet', pageSize: 100 }), [repo]);
  useHead({
    title: 'תמיכה',
    description: 'קישורי רכישה ותרומה מוצגים רק אם נשמרו בפריט. אין בעמוד זה פרטי חשבון או סכום.',
    path: '/support',
  });
  const items = [...(books.data?.items ?? []), ...(leaflets.data?.items ?? [])].flatMap((item) => {
    const offers = bookOffers(item.bookDetails);
    if (!offers.donation && !offers.purchase) return [];
    return [{ item, offers }];
  });
  const loading = books.loading || leaflets.loading;
  return (
    <div className="container">
      <Breadcrumbs items={[{ label: 'בית', to: '/' }, { label: 'תמיכה' }]} />
      <PageIntro eyebrow="הבית" title="תמיכה" lede="קישור לרכישה או לתרומה מופיע רק כשהמשרד שמר אותו על ספר או עלון. אין כאן מספר חשבון, סכום או פרטי קשר שלא נמסרו." />
      {(books.error || leaflets.error) && <ErrorState error={(books.error ?? leaflets.error)!} onRetry={() => { books.reload(); leaflets.reload(); }} />}
      {loading && <CardSkeletons n={2} />}
      {!loading && items.length === 0 && (
        <EmptyState icon="heart" title="עדיין אין קישור תרומה" action={<LinkButton to="/p/contact" tone="gold">פנייה לאתר</LinkButton>}>
          כשיוזן קישור בפריט, הוא יופיע כאן וגם בדף הספר. עד אז אפשר לפנות לצוות האתר.
        </EmptyState>
      )}
      {items.length > 0 && (
        <ul className="support-list">
          {items.map(({ item, offers }) => (
            <li key={item.id} className="support-card">
              <h2><Link to={`/books/${item.slug}`}>{item.title.split(' / ')[0]}</Link></h2>
              <div className="row">
                {offers.donation && <a className="btn btn-gold" href={offers.donation} target="_blank" rel="noopener noreferrer">לתרומה <Icon name="external" /></a>}
                {offers.purchase && <a className="btn btn-secondary" href={offers.purchase} target="_blank" rel="noopener noreferrer">לרכישה <Icon name="external" /></a>}
              </div>
            </li>
          ))}
        </ul>
      )}
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
      <PageIntro eyebrow="הבית" title="מקורות" lede="התכנים באתר נאספו מחיפוש ומקריאת דפים ציבוריים (איסוף 30.09.2026). זה מיפוי רחב של חומר שאותר, לא ארכיון מלא. המדיה עצמה לא נצפתה במלואה ולא הורדה." />
      {arch.error && <ErrorState error={arch.error} onRetry={arch.reload} />}
      <ul className="list-rows" style={{ listStyle: 'none', padding: 0 }}>
        {arch.data?.map((a) => (
          <li key={a.id} className="side-card">
            <div className="spread"><strong>{a.name}</strong><Badge tone={a.verification === 'candidate' ? 'warn' : undefined}>{a.verification === 'candidate' ? 'מועמד' : 'ארכיון'}</Badge></div>
            <p className="muted" style={{ fontSize: 'var(--step--1)', margin: 'var(--s-2) 0' }}>{a.material}</p>
            {a.note && <p className="soft" style={{ margin: 0 }}>{a.note}</p>}
            <a href={a.url} target="_blank" rel="noopener noreferrer">{linkHost(a.url)} <Icon name="external" /></a>
          </li>
        ))}
      </ul>
    </div>
  );
}
