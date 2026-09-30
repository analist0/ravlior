import { Link } from '../app/router.tsx';
import { useAsync, useRepo } from '../data/repo.ts';
import { sanitizeBlocks } from '../shared/blocks.ts';
import type { Block } from '../shared/types.ts';
import { Icon } from './Icon.tsx';
import { CardGrid, MediaPlayer } from './Media.tsx';

// Whitelisted renderer: text is rendered as React text nodes (escaped); URLs pass safeUrl();
// there is no dangerouslySetInnerHTML and no arbitrary iframe anywhere in this file.

function MediaBlock({ contentId }: { contentId: string }) {
  const repo = useRepo();
  const r = useAsync(() => repo.getContentByIds([contentId]), [contentId]);
  const item = r.data?.[0];
  if (!item) return null;
  return (
    <figure style={{ margin: 'var(--s-6) 0' }}>
      <MediaPlayer item={item} />
      <figcaption className="soft" style={{ marginTop: 'var(--s-2)' }}><Link to={`/item/${item.slug}`}>{item.title}</Link></figcaption>
    </figure>
  );
}
function RelatedBlock({ ids }: { ids: string[] }) {
  const repo = useRepo();
  const r = useAsync(() => repo.getContentByIds(ids), [ids.join(',')]);
  return r.data?.length ? <CardGrid items={r.data} /> : null;
}

export function BlockRenderer({ blocks }: { blocks: Block[] }) {
  const { blocks: safe } = sanitizeBlocks(blocks);
  return (
    <div className="prose">
      {safe.map((b, i) => {
        switch (b.type) {
          case 'heading': return b.level === 2 ? <h2 key={i}>{b.text}</h2> : <h3 key={i}>{b.text}</h3>;
          case 'paragraph': return b.text.split(/\n{2,}/).map((p, j) => <p key={`${i}-${j}`}>{p}</p>);
          case 'image': return (
            <figure key={i} style={{ margin: 'var(--s-6) 0' }}>
              <img src={b.src} alt={b.alt} loading="lazy" decoding="async" style={{ borderRadius: 'var(--r-3)' }} />
              {b.credit && <figcaption className="soft">צילום: {b.credit}</figcaption>}
            </figure>
          );
          case 'quote': return (
            <blockquote key={i} className="quote-block">
              <p style={{ margin: 0 }}>{b.text}</p>
              <footer>מקור: {/^https:\/\//.test(b.source.split(' — ').pop() ?? '') ? (
                <>{b.source.split(' — ')[0]} — <a href={b.source.split(' — ').pop()} target="_blank" rel="noopener noreferrer">קישור</a></>
              ) : b.source}</footer>
            </blockquote>
          );
          case 'media': return <MediaBlock key={i} contentId={b.contentId} />;
          case 'pdf': return (
            <p key={i}><a className="btn btn-secondary" href={b.src} target="_blank" rel="noopener noreferrer"><Icon name="file" /> {b.title}<span className="sr-only"> (PDF, נפתח בחלון חדש)</span></a></p>
          );
          case 'related': return <RelatedBlock key={i} ids={b.contentIds} />;
          case 'cta': return (
            <p key={i}>{b.href.startsWith('/') ? <Link className="btn" to={b.href}>{b.label}</Link> : <a className="btn" href={b.href} target="_blank" rel="noopener noreferrer">{b.label}</a>}</p>
          );
        }
      })}
    </div>
  );
}
