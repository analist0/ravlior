import { useMemo, useRef, useState } from 'react';
import { useHead } from '../app/head.ts';
import { Link } from '../app/router.tsx';
import { useAsync, useRepo } from '../data/repo.ts';
import { BlockRenderer } from '../components/Blocks.tsx';
import { hostedPdf, hostedUrl } from '../components/Media.tsx';
import { PdfViewer } from '../components/PdfViewer.tsx';
import { Icon } from '../components/Icon.tsx';
import { Badge, Breadcrumbs, Button, ErrorState, Notice, Skeleton, splitTitle } from '../components/ui.tsx';
import { ReadingProgress, ReadingTools } from '../components/Reading.tsx';
import { bookJsonLd, bookOffers, bookSample, bookToc, linkHost, tocAnchors } from '../shared/sections.ts';
import { sanitizeBlocks } from '../shared/blocks.ts';
import { NotFound } from './NotFound.tsx';

const PRINT = new Set(['book', 'leaflet', 'article']);

export default function BookPage({ params }: { params: Record<string, string> }) {
  const repo = useRepo();
  const articleRef = useRef<HTMLDivElement>(null);
  const [readingScale, setReadingScale] = useState(1);
  const slug = params.slug ?? '';
  const r = useAsync(() => repo.getContent(slug), [slug]);
  const item = r.data && PRINT.has(r.data.type) ? r.data : null;
  const toc = bookToc(item?.bookDetails);
  const sample = bookSample(item?.bookDetails);
  const reading = sample.length ? sample : (item?.body ?? []);
  const safeReading = sanitizeBlocks(reading).blocks;
  const anchors = tocAnchors(safeReading, toc);
  const headingIds: Record<number, string> = {};
  for (const a of anchors) if (a.blockIndex != null) headingIds[a.blockIndex] = a.id;
  const offers = bookOffers(item?.bookDetails);
  const [title, sub] = splitTitle(item?.title ?? '');
  const jsonLd = useMemo(() => (item ? bookJsonLd(item, null) : undefined), [item]);
  useHead({
    title: item ? title : '',
    description: item?.summary ?? null,
    path: `/books/${slug}`,
    type: 'article',
    jsonLd,
  });
  if (r.loading) return <div className="container section"><Skeleton h={48} w="50%" /></div>;
  if (r.error) return <div className="container section"><ErrorState error={r.error} onRetry={r.reload} /></div>;
  if (!item) return <NotFound />;
  const d = item.bookDetails;
  return (
    <div className="text-item" ref={articleRef} style={{ ['--reading-scale' as string]: readingScale }}>
    <ReadingProgress target={articleRef} />
    <div className="container">
      <Breadcrumbs items={[{ label: 'בית', to: '/' }, { label: 'ספרים ועלונים', to: '/books' }, { label: title }]} />
      <div className="book-layout">
        <aside className="book-toc" aria-label="פרטי הפרסום">
          <p className="soft" style={{ marginTop: 0 }}>{item.type === 'book' ? 'ספר / קונטרס' : item.type === 'leaflet' ? 'עלון' : 'דבר תורה'}</p>
          {d?.authoredByRabbi === false && <Badge tone="warn">אין לייחס לרב כמחבר</Badge>}
          {d?.authoredByRabbi && <Badge tone="accent">לפי המקור: מיוחס לרב</Badge>}
          {toc.length > 0 && (
            <>
              <h2 style={{ fontSize: 'var(--step-0)' }}>תוכן העניינים</h2>
              <ol>
                {anchors.map((t) => <li key={t.id}>{t.blockIndex == null ? <span>{t.title}</span> : <a href={`#${t.id}`}>{t.title}</a>}</li>)}
              </ol>
            </>
          )}
          {(offers.purchase || offers.donation) && (
            <div className="stack" style={{ marginTop: 'var(--s-4)' }}>
              {offers.purchase && <a className="btn" href={offers.purchase} target="_blank" rel="noopener noreferrer">לרכישה <Icon name="external" /></a>}
              {offers.donation && <a className="btn btn-secondary" href={offers.donation} target="_blank" rel="noopener noreferrer">לתרומה <Icon name="external" /></a>}
            </div>
          )}
        </aside>
        <article>
          <h1>{title}</h1>
          {sub && <p className="muted">{sub}</p>}
          {item.summary && <p className="section-lead">{item.summary}</p>}
          {d && (
            <dl className="meta-dl">
              {d.authorText && <><dt>מחבר / תוכן</dt><dd>{d.authorText}</dd></>}
              {d.editorText && <><dt>עריכה</dt><dd>{d.editorText}</dd></>}
              {d.publisher && <><dt>הוצאה</dt><dd>{d.publisher}</dd></>}
              <dt>מצב איתור</dt><dd>{d.locatedStatus || 'לא צוין'}</dd>
              <dt>קובץ</dt><dd>{d.pdfAccess === 'public' ? 'זמין לעיון' : d.pdfAccess === 'restricted' ? 'זמין בהרשאה בלבד' : 'אין קובץ זמין באתר'}</dd>
            </dl>
          )}
          <div className="reading-tools" style={{ marginTop: 'var(--s-4)' }}><ReadingTools scale={readingScale} onScale={setReadingScale} /></div>
          <section className="torah-sheet" aria-labelledby="h-read" style={{ marginTop: 'var(--s-4)' }}>
            <h2 id="h-read">{sample.length ? 'לקריאה לדוגמה' : 'קריאה'}</h2>
            {safeReading.length ? <BlockRenderer blocks={safeReading} reading headingIds={headingIds} /> : <p className="soft">קטע לקריאה לא צורף. אין באתר ציטוט או תקציר שלא נשמר במפורש.</p>}
            {hostedPdf(item) && <PdfViewer src={hostedUrl(hostedPdf(item)!)!} title={splitTitle(item.title)[0]} />}
          </section>
          {item.sources.length > 0 && (
            <section style={{ marginTop: 'var(--s-6)' }}>
              <h2>מקורות</h2>
              <ul>
                {item.sources.map((s) => (
                  <li key={s.id} className="soft">{linkHost(s.url)}{s.storagePath ? ' · מתארח באתר' : ''}</li>
                ))}
              </ul>
            </section>
          )}
          {!offers.purchase && !offers.donation && <Notice>אין באתר קישור רכישה או תרומה לפריט זה — לא נשמר קישור כזה במקורות.</Notice>}
          <p><Button variant="secondary" onClick={() => history.back()}>חזרה</Button> <Link to="/books">לכל הספרים</Link></p>
        </article>
      </div>
    </div>
    </div>
  );
}
