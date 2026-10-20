import { Link } from '../app/router.tsx';
import { useAsync, useRepo } from '../data/repo.ts';
import { sanitizeBlocks } from '../shared/blocks.ts';
import { extractFootnotes, footnoteRuns } from '../shared/footnotes.ts';
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

function Paragraph({ text, defined, placed }: { text: string; defined: Set<number>; placed: Set<number> }) {
  const trimmed = text.trim();
  if (defined.size) {
    const only = /^\[\^(\d{1,3})\]:?\s+\S[\s\S]*$/.exec(trimmed);
    if (only && defined.has(Number(only[1])) && trimmed === only[0]) return null;
  }
  const runs = footnoteRuns(text, defined);
  return (
    <p>
      {runs.map((r, i) => {
        if (r.kind === 'text') return <span key={i}>{r.text}</span>;
        const first = !placed.has(r.n);
        if (first) placed.add(r.n);
        return (
          <sup key={i} id={first ? `fnref-${r.n}` : undefined} className="fn-ref">
            <a href={`#fn-${r.n}`} aria-label={`הערה ${r.n}`}>{r.n}</a>
          </sup>
        );
      })}
    </p>
  );
}

export function BlockRenderer({ blocks, reading = false, anchorIds = false }: { blocks: Block[]; reading?: boolean; anchorIds?: boolean }) {
  const { blocks: safe } = sanitizeBlocks(blocks);
  const chunks = safe.flatMap((b) => (b.type === 'paragraph' ? b.text.split(/\n{2,}/) : []));
  const notes = reading ? extractFootnotes(chunks).notes : [];
  const defined = new Set(notes.map((n) => n.n));
  const placed = new Set<number>();
  return (
    <div className={reading ? 'prose torah-prose' : 'prose'}>
      {safe.map((b, i) => {
        switch (b.type) {
          case 'heading': {
            const id = anchorIds ? `qa-${i}` : undefined;
            return b.level === 2 ? <h2 key={i} id={id}>{b.text}</h2> : <h3 key={i} id={id}>{b.text}</h3>;
          }
          case 'paragraph': return b.text.split(/\n{2,}/).map((p, j) => <Paragraph key={`${i}-${j}`} text={p} defined={defined} placed={placed} />);
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
      {notes.length > 0 && (
        <section className="footnotes" aria-label="הערות שוליים">
          <h2>הערות</h2>
          <ol>
            {notes.map((n) => (
              <li key={n.n} id={`fn-${n.n}`} value={n.n}>
                {n.text}
                <a className="fn-back" href={`#fnref-${n.n}`} aria-label={`חזרה להפניה ${n.n}`}>↩</a>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
