import { useMemo } from 'react';
import { useHead } from '../app/head.ts';
import { Link } from '../app/router.tsx';
import { useAsync, useRepo } from '../data/repo.ts';
import { BlockRenderer } from '../components/Blocks.tsx';
import { hostedPdf, hostedUrl } from '../components/Media.tsx';
import { PdfViewer } from '../components/PdfViewer.tsx';
import { Icon } from '../components/Icon.tsx';
import { Badge, Breadcrumbs, Button, ErrorState, Notice, Skeleton, splitTitle } from '../components/ui.tsx';
import { bookJsonLd, bookOffers, bookSample, bookToc } from '../shared/sections.ts';
import { NotFound } from './NotFound.tsx';

const PRINT = new Set(['book', 'leaflet', 'article']);

export default function BookPage({ params }: { params: Record<string, string> }) {
  const repo = useRepo();
  const slug = params.slug ?? '';
  const r = useAsync(() => repo.getContent(slug), [slug]);
  const item = r.data && PRINT.has(r.data.type) ? r.data : null;
  const toc = bookToc(item?.bookDetails);
  const sample = bookSample(item?.bookDetails);
  const reading = sample.length ? sample : (item?.body ?? []);
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
                {toc.map((t) => <li key={t.id}><a href={`#${t.id}`}>{t.title}</a></li>)}
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
          <section className="reading" aria-labelledby="h-read" style={{ marginTop: 'var(--s-6)' }}>
            <h2 id="h-read">{sample.length ? 'לקריאה לדוגמה' : 'קריאה'}</h2>
            {reading.length ? <BlockRenderer blocks={reading} /> : <p className="soft">קטע לקריאה לא צורף. אין באתר ציטוט או תקציר שלא נשמר במפורש.</p>}
            {toc.map((t) => <span key={t.id} id={t.id} />)}
            {hostedPdf(item) && <PdfViewer src={hostedUrl(hostedPdf(item)!)!} title={splitTitle(item.title)[0]} />}
          </section>
          {item.sources.length > 0 && (
            <section style={{ marginTop: 'var(--s-6)' }}>
              <h2>מקורות</h2>
              <ul>
                {item.sources.map((s) => (
                  <li key={s.id} className="soft">{(() => { try { return new URL(s.url).hostname.replace(/^www\./, ''); } catch { return s.provider; } })()}{s.storagePath ? ' · מתארח באתר' : ''}</li>
                ))}
              </ul>
            </section>
          )}
          {!offers.purchase && !offers.donation && <Notice>אין באתר קישור רכישה או תרומה לפריט זה — לא נשמר קישור כזה במקורות.</Notice>}
          <p><Button variant="secondary" onClick={() => history.back()}>חזרה</Button> <Link to="/books">לכל הספרים</Link></p>
        </article>
      </div>
    </div>
  );
}
