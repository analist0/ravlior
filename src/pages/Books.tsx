import { useHead } from '../app/head.ts';
import { Link } from '../app/router.tsx';
import { useAsync, useRepo } from '../data/repo.ts';
import { Badge, Breadcrumbs, CardSkeletons, EmptyState, ErrorState, Notice, splitTitle } from '../components/ui.tsx';
import { bookOffers } from '../shared/sections.ts';
import type { ContentItem } from '../shared/types.ts';

function Shelf({ title, id, items, loading, error, onRetry }: { title: string; id: string; items: ContentItem[] | undefined; loading: boolean; error: Error | null; onRetry: () => void }) {
  return (
    <section className="section" aria-labelledby={id} style={{ paddingBlock: 'var(--s-6)' }}>
      <h2 id={id}>{title}</h2>
      {error && <ErrorState error={error} onRetry={onRetry} />}
      {loading && <CardSkeletons n={3} />}
      {items && items.length === 0 && <EmptyState icon="read" title="אין פריטים עדיין" />}
      {items && items.length > 0 && (
        <div className="book-shelf">
          {items.map((item) => {
            const [main, sub] = splitTitle(item.title);
            const offers = bookOffers(item.bookDetails);
            return (
              <Link key={item.id} to={`/books/${item.slug}`} className="book-card">
                <span className="book-spine" aria-hidden="true" />
                <span>
                  <h3>{main}</h3>
                  {sub && <p className="muted" style={{ margin: '0 0 var(--s-2)' }}>{sub}</p>}
                  {item.summary && <p className="soft" style={{ margin: 0 }}>{item.summary}</p>}
                  <span className="row" style={{ marginTop: 'var(--s-2)', gap: 6 }}>
                    {item.bookDetails?.authoredByRabbi === false && <Badge tone="warn">לא מיוחס לרב כמחבר</Badge>}
                    {item.bookDetails?.authoredByRabbi && <Badge tone="accent">מיוחס לרב לפי המקור</Badge>}
                    {offers.purchase && <Badge>יש קישור רכישה</Badge>}
                    {offers.donation && <Badge>יש קישור תרומה</Badge>}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default function BooksPage() {
  const repo = useRepo();
  const books = useAsync(() => repo.listContent({ type: 'book', pageSize: 100 }), [repo]);
  const leaflets = useAsync(() => repo.listContent({ type: 'leaflet', pageSize: 100 }), [repo]);
  const articles = useAsync(() => repo.listContent({ type: 'article', pageSize: 100 }), [repo]);
  useHead({ title: 'ספרים, עלונים ודברי תורה', description: 'ספרים וקונטרסים הקשורים לרב ליאור כהן ולמורשת מרן הרב מאזוז, עלונים ודברי תורה כתובים — עם פרטי מקור מדויקים.', path: '/books' });
  return (
    <div className="container">
      <Breadcrumbs items={[{ label: 'בית', to: '/' }, { label: 'ספרים ועלונים' }]} />
      <h1>ספרים, עלונים ודברי תורה</h1>
      <Notice>
        לא אותרה רשימה מאומתת של ספרים שחיבר הרב. „ימי מלך — שיחות הרב” ידוע מדיווח בלבד, וקובץ מלא שלו לא אותר.
        „ימי מלך” הקונטרס המשפחתי הוא פרסום אחר ואינו מחיבורי הרב. תוכן עניינים, קטע לקריאה וקישורי רכישה או תרומה מוצגים רק אם נשמרו בפריט.
      </Notice>
      <Shelf title="ספרים וקונטרסים" id="h-books" items={books.data?.items} loading={books.loading} error={books.error} onRetry={books.reload} />
      <Shelf title="עלונים (PDF באתרי המקור)" id="h-leaflets" items={leaflets.data?.items} loading={leaflets.loading} error={leaflets.error} onRetry={leaflets.reload} />
      <Shelf title="דברי תורה כתובים" id="h-articles" items={articles.data?.items} loading={articles.loading} error={articles.error} onRetry={articles.reload} />
    </div>
  );
}
