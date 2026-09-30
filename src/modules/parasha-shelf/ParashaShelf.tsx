// Example module (see MODULES.md). Owns /parasha; toggled from Admin → Modules.
import { useHead } from '../../app/head.ts';
import { useAsync, useRepo } from '../../data/repo.ts';
import { CardGrid } from '../../components/Media.tsx';
import { Breadcrumbs, CardSkeletons, EmptyState, ErrorState } from '../../components/ui.tsx';

export default function ParashaShelf() {
  const repo = useRepo();
  const mods = useAsync(() => repo.getModules(), [repo]);
  const limit = Number(mods.data?.find((m) => m.id === 'parasha-shelf')?.settings.limit ?? 12) || 12;
  const r = useAsync(() => repo.listContent({ topic: 'parasha', pageSize: limit }), [limit]);
  useHead({ title: 'מדף פרשת השבוע', description: 'רעיונות ודרשות לפרשת השבוע מאת הרב ליאור כהן.', path: '/parasha' });
  return (
    <div className="container">
      <Breadcrumbs items={[{ label: 'בית', to: '/' }, { label: 'פרשת השבוע' }]} />
      <h1>מדף פרשת השבוע</h1>
      <p className="muted">תכנים שסומנו בנושא „פרשת השבוע”.</p>
      {r.error && <ErrorState error={r.error} onRetry={r.reload} />}
      {r.loading && <CardSkeletons />}
      {r.data && (r.data.items.length ? <CardGrid items={r.data.items} /> : <EmptyState title="אין תכנים בנושא זה" />)}
    </div>
  );
}
