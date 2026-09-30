import { useHead } from '../app/head.ts';
import { useAsync, useRepo } from '../data/repo.ts';
import { BlockRenderer } from '../components/Blocks.tsx';
import { Breadcrumbs, ErrorState, Skeleton } from '../components/ui.tsx';
import { NotFound } from './NotFound.tsx';

export default function ContentPage({ params }: { params: Record<string, string> }) {
  const repo = useRepo();
  const r = useAsync(() => repo.getPage(params.slug ?? ''), [params.slug]);
  useHead({ title: r.data?.title ?? '', description: r.data?.description ?? null, path: `/p/${params.slug}` });
  if (r.loading) return <div className="container section"><Skeleton h={40} w="40%" /></div>;
  if (r.error) return <div className="container section"><ErrorState error={r.error} onRetry={r.reload} /></div>;
  if (!r.data) return <NotFound />;
  return (
    <div className="container">
      <Breadcrumbs items={[{ label: 'בית', to: '/' }, { label: r.data.title }]} />
      <h1>{r.data.title}</h1>
      <BlockRenderer blocks={r.data.blocks} />
    </div>
  );
}
