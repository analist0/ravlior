import { useHead } from '../app/head.ts';
import { useAsync, useRepo } from '../data/repo.ts';
import { CardGrid } from '../components/Media.tsx';
import { Breadcrumbs, CardSkeletons, EmptyState, ErrorState, Notice } from '../components/ui.tsx';

export default function BooksPage() {
  const repo = useRepo();
  const books = useAsync(() => repo.listContent({ type: 'book', pageSize: 100 }), [repo]);
  const leaflets = useAsync(() => repo.listContent({ type: 'leaflet', pageSize: 100 }), [repo]);
  const articles = useAsync(() => repo.listContent({ type: 'article', pageSize: 100 }), [repo]);
  useHead({ title: 'ספרים, עלונים ודברי תורה', description: 'ספרים וקונטרסים הקשורים לרב ליאור כהן ולמורשת מרן הרב מאזוז, עלונים ודברי תורה כתובים — עם פרטי מקור מדויקים.', path: '/books' });
  const block = (title: string, r: typeof books, id: string) => (
    <section className="section" aria-labelledby={id} style={{ paddingBlock: 'var(--s-6)' }}>
      <h2 id={id}>{title}</h2>
      {r.error && <ErrorState error={r.error} onRetry={r.reload} />}
      {r.loading && <CardSkeletons n={3} />}
      {r.data && (r.data.items.length ? <CardGrid items={r.data.items} view="list" /> : <EmptyState icon="read" title="אין פריטים עדיין" />)}
    </section>
  );
  return (
    <div className="container">
      <Breadcrumbs items={[{ label: 'בית', to: '/' }, { label: 'ספרים ועלונים' }]} />
      <h1>ספרים, עלונים ודברי תורה</h1>
      <Notice>
        לא אותרה רשימה מאומתת של ספרים שחיבר הרב. „ימי מלך — שיחות הרב” ידוע מדיווח בלבד, וקובץ מלא שלו לא אותר.
        „ימי מלך” הקונטרס המשפחתי הוא פרסום אחר ואינו מחיבורי הרב. קבצים מוצגים לעיון רק כשיש לכך הרשאה.
      </Notice>
      {block('ספרים וקונטרסים', books, 'h-books')}
      {block('עלונים (PDF באתרי המקור)', leaflets, 'h-leaflets')}
      {block('דברי תורה כתובים', articles, 'h-articles')}
    </div>
  );
}
