import { useHead } from '../app/head.ts';
import { useLibraryState } from '../app/library-state.tsx';
import { Link } from '../app/router.tsx';
import { useAsync, useRepo } from '../data/repo.ts';
import { CardGrid } from '../components/Media.tsx';
import { Breadcrumbs, CardSkeletons, EmptyState, LinkButton } from '../components/ui.tsx';
import { formatDuration } from '../shared/media.ts';

export default function FavoritesPage() {
  const repo = useRepo();
  const { favorites, progress, clearProgress } = useLibraryState();
  const r = useAsync(() => repo.getContentByIds(favorites), [favorites.join(',')]);
  const cont = Object.entries(progress).sort((a, b) => b[1].at - a[1].at);
  useHead({ title: 'המועדפים שלי והמשך לימוד', path: '/favorites', noindex: true });
  return (
    <div className="container">
      <Breadcrumbs items={[{ label: 'בית', to: '/' }, { label: 'מועדפים' }]} />
      <h1>המועדפים שלי והמשך לימוד</h1>
      <p className="muted">נשמר בדפדפן זה בלבד, ללא הרשמה.</p>
      <section className="section" aria-labelledby="h-cont" style={{ paddingTop: 'var(--s-4)' }}>
        <h2 id="h-cont">המשך האזנה</h2>
        {cont.length === 0 ? <p className="soft">עוד לא התחלתם להאזין להקלטה.</p> : (
          <ul className="list-rows" style={{ listStyle: 'none', padding: 0 }}>
            {cont.map(([id, e]) => (
              <li key={id} className="row-item" style={{ gridTemplateColumns: '1fr auto' }}>
                <div><Link to={`/item/${e.slug}`}>{e.title}</Link><div className="soft">עד <span className="ltr">{formatDuration(e.t)}</span></div></div>
                <button className="btn btn-ghost btn-sm" onClick={() => clearProgress(id)}>הסרה</button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="h-fav">
        <h2 id="h-fav">שמורים ({favorites.length})</h2>
        {r.loading && favorites.length > 0 && <CardSkeletons n={4} />}
        {favorites.length === 0 && <EmptyState icon="bookmark" title="אין עדיין פריטים שמורים" action={<LinkButton to="/library">לספרייה</LinkButton>}>לחצו על סימן השמירה בכל שיעור.</EmptyState>}
        {r.data && r.data.length > 0 && <CardGrid items={r.data} />}
      </section>
    </div>
  );
}
