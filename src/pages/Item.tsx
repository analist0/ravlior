import { useHead } from '../app/head.ts';
import { useLibraryState } from '../app/library-state.tsx';
import { Link } from '../app/router.tsx';
import { useAsync, useRepo } from '../data/repo.ts';
import { BlockRenderer } from '../components/Blocks.tsx';
import { Icon } from '../components/Icon.tsx';
import { CardGrid, MediaPlayer, pickSource, playableTrack, providerLabel, thumbFor } from '../components/Media.tsx';
import { usePlayer } from '../player/PlayerProvider.tsx';
import { useToast } from '../components/Toast.tsx';
import { Badge, Breadcrumbs, Button, ErrorState, Notice, Skeleton, TYPE_LABEL, formatHebDate, splitTitle } from '../components/ui.tsx';
import { NotFound } from './NotFound.tsx';
import type { AttributionStatus, ContentItem, MediaSource } from '../shared/types.ts';

const ATTRIBUTION: Record<AttributionStatus, string> = {
  title_names_rabbi: 'כותרת הפרסום מציינת את הרב ליאור כהן',
  channel_only: 'פורסם בערוץ מוסדות אור המאיר; הכותרת אינה מציינת את הדובר',
  source_page: 'מיוחס לרב בדף המקור',
  note_only: 'בדף מופיעה הערה של הרב בלבד — התשובה כולה אינה מיוחסת לו',
  other_speaker: 'דובר או מגיש נוסף',
  not_author: 'פרסום הקשור לרב או למורשת; הרב אינו המחבר',
};
const RIGHTS: Record<MediaSource['rightsStatus'], string> = {
  unverified: 'זכויות שימוש טרם אומתו — קישור למקור בלבד', embed_only: 'הטמעה בנגן הרשמי בלבד', licensed: 'בהרשאה', owned: 'בבעלות המוסדות', blocked: 'חסום',
};
const KIND: Record<MediaSource['kind'], string> = { media: 'מדיה', source_page: 'דף מקור', pdf: 'PDF', archive: 'ארכיון' };

function SourceList({ sources }: { sources: MediaSource[] }) {
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 'var(--s-3)' }}>
      {sources.map((s) => (
        <li key={s.id} style={{ display: 'grid', gap: 4 }}>
          <div className="row" style={{ gap: 6 }}>
            <Badge>{KIND[s.kind]}</Badge><Badge tone="accent">{providerLabel(s.provider)}</Badge>
            {s.storagePath ? <Badge tone="ok">נשמר אצלנו</Badge> : <Badge>מקושר</Badge>}
          </div>
          <a href={s.url} target="_blank" rel="noopener noreferrer" className="ltr" style={{ overflowWrap: 'anywhere', fontSize: 'var(--step--1)' }}>
            {decodeURI(s.url).replace(/^https:\/\/(www\.)?/, '').slice(0, 80)}
          </a>
          <span className="soft">{RIGHTS[s.rightsStatus]}{s.lastCheckedAt ? ` · נבדק ${formatHebDate(s.lastCheckedAt)}` : ' · זמינות לא נבדקה'}</span>
        </li>
      ))}
    </ul>
  );
}

function Share({ item }: { item: ContentItem }) {
  const toast = useToast();
  const share = async () => {
    const url = location.origin + `/item/${item.slug}`;
    try {
      if (navigator.share) await navigator.share({ title: splitTitle(item.title)[0], url });
      else { await navigator.clipboard.writeText(url); toast('הקישור הועתק'); }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast('לא ניתן לשתף מדפדפן זה', { tone: 'error' });
    }
  };
  return <Button variant="secondary" icon="share" onClick={() => void share()}>שיתוף</Button>;
}

export default function ItemPage({ params }: { params: Record<string, string> }) {
  const repo = useRepo();
  const { isFavorite, toggleFavorite } = useLibraryState();
  const player = usePlayer();
  const toast = useToast();
  const r = useAsync(() => repo.getContent(params.slug ?? ''), [params.slug]);
  const item = r.data;
  const topics = useAsync(() => repo.listTopics(), [repo]);
  const series = useAsync(() => repo.listSeries(), [repo]);
  const related = useAsync(() => (item ? repo.related(item, 8) : Promise.resolve([])), [item?.id]);
  const [main, sub] = item ? splitTitle(item.title) : ['', null];
  useHead({
    title: main,
    description: item ? (item.summary ?? sub ?? `${TYPE_LABEL[item.type]} — ${main}`).slice(0, 180) : null,
    path: item ? `/item/${item.slug}` : undefined,
    image: item ? thumbFor(item) : null,
    type: item?.type === 'video' || item?.type === 'short' ? 'video.other' : 'article',
    noindex: item ? item.status !== 'published' : false,
  });

  if (r.loading) return <div className="container section"><Skeleton h={320} /><div style={{ height: 16 }} /><Skeleton h={32} w="60%" /></div>;
  if (r.error) return <div className="container section"><ErrorState error={r.error} onRetry={r.reload} /></div>;
  if (!item) return <NotFound />;

  const itemTopics = (topics.data ?? []).filter((t) => item.topicIds.includes(t.id));
  const itemSeries = (series.data ?? []).filter((s) => item.seriesIds.includes(s.id));
  const { mode } = pickSource(item);
  const track = playableTrack(item);
  const dupes = (related.data ?? []).filter((c) => item.duplicateGroup && c.duplicateGroup === item.duplicateGroup);
  const others = (related.data ?? []).filter((c) => !dupes.includes(c));
  const fav = isFavorite(item.id);

  return (
    <article className="container">
      <Breadcrumbs items={[{ label: 'בית', to: '/' }, { label: 'ספרייה', to: '/library' }, { label: TYPE_LABEL[item.type], to: `/library?type=${item.type}` }, { label: main }]} />
      {item.status !== 'published' && <Notice tone="warn" icon="lock">פריט זה אינו מפורסם ({item.status}). הוא מוצג לך כחבר צוות בלבד.</Notice>}
      <div className="item-layout" style={{ marginTop: 'var(--s-4)' }}>
        <div>
          {mode !== 'none' && <MediaPlayer item={item} />}
          <header style={{ marginTop: 'var(--s-6)' }}>
            <div className="row" style={{ marginBottom: 'var(--s-3)' }}>
              <Badge tone="accent">{TYPE_LABEL[item.type]}</Badge>
              {item.durationText && <Badge><span className="ltr">{item.durationText}</span></Badge>}
              {item.verification === 'candidate' && <Badge tone="warn">ייחוס מועמד — טעון בדיקה</Badge>}
            </div>
            <h1 style={{ fontSize: 'var(--step-4)' }}>{main}</h1>
            {sub && <p className="muted" style={{ fontSize: 'var(--step-1)' }}>{sub}</p>}
            <p className="soft">
              {item.speaker ?? 'ערוץ מוסדות אור המאיר'}
              {item.eventDate && <> · {formatHebDate(item.eventDate)}</>}
              {!item.eventDate && item.eventDateText && <> · {item.eventDateText}</>}
            </p>
          </header>
          <div className="row" style={{ margin: 'var(--s-4) 0 var(--s-6)' }}>
            <Button variant={fav ? 'primary' : 'secondary'} icon="bookmark" aria-pressed={fav} onClick={() => { const a = toggleFavorite(item.id); toast(a ? 'נשמר במועדפים' : 'הוסר מהמועדפים'); }}>
              {fav ? 'שמור' : 'שמירה'}
            </Button>
            <Share item={item} />
            {track && <Button variant="secondary" icon="queue" onClick={() => { player.enqueue(track); toast('נוסף לתור'); }}>הוספה לתור</Button>}
          </div>
          {item.summary && item.summary !== main && <p style={{ fontSize: 'var(--step-1)' }}>{item.summary}</p>}
          {item.body.length > 0 && <BlockRenderer blocks={item.body} />}
          {item.bookDetails && (
            <section className="side-card" style={{ margin: 'var(--s-6) 0' }} aria-labelledby="h-book">
              <h2 id="h-book" style={{ fontSize: 'var(--step-2)' }}>פרטי הפרסום</h2>
              <dl className="meta-list">
                {item.bookDetails.authorText && <><dt>מחבר / תוכן</dt><dd>{item.bookDetails.authorText}</dd></>}
                {item.bookDetails.editorText && <><dt>עריכה</dt><dd>{item.bookDetails.editorText}</dd></>}
                {item.bookDetails.publisher && <><dt>הוצאה</dt><dd>{item.bookDetails.publisher}</dd></>}
                <dt>מצב איתור</dt><dd>{item.bookDetails.locatedStatus}</dd>
                <dt>קובץ</dt><dd>{item.bookDetails.pdfAccess === 'public' ? 'זמין לעיון' : item.bookDetails.pdfAccess === 'restricted' ? 'זמין בהרשאה בלבד' : 'אין קובץ זמין באתר'}</dd>
              </dl>
            </section>
          )}
          {dupes.length > 0 && (
            <section style={{ marginTop: 'var(--s-8)' }} aria-labelledby="h-dupes">
              <h2 id="h-dupes" style={{ fontSize: 'var(--step-2)' }}>גרסאות נוספות של אותו קטע</h2>
              <p className="soft">פריטים עם כותרת זהה ומזהה וידאו שונה (למשל גרסה ארוכה וקצרה). הם נשמרים כרשומות נפרדות.</p>
              <CardGrid items={dupes} view="list" />
            </section>
          )}
        </div>
        <aside className="stack" aria-label="פרטי הפריט">
          <section className="side-card">
            <h2 style={{ fontSize: 'var(--step-1)' }}>ייחוס ומקור</h2>
            <p style={{ fontSize: 'var(--step--1)' }}>{ATTRIBUTION[item.attributionStatus]}{item.attributionNote ? `. ${item.attributionNote}` : ''}</p>
            <dl className="meta-list">
              {item.eventDate && <><dt>תאריך</dt><dd>{formatHebDate(item.eventDate)}</dd></>}
              {item.sourcePublishedDate && <><dt>פורסם במקור</dt><dd>{formatHebDate(item.sourcePublishedDate)}</dd></>}
              {!item.eventDate && !item.sourcePublishedDate && <><dt>תאריך</dt><dd>לא ידוע</dd></>}
              <dt>רשומה</dt><dd>{item.provenance.map((p) => `סעיף ${p.section}${p.row ? ` שורה ${p.row}` : ''}`).join(' · ')}</dd>
            </dl>
            <h3 style={{ marginTop: 'var(--s-4)', fontSize: 'var(--step-0)' }}>מקורות</h3>
            <SourceList sources={item.sources} />
          </section>
          {(itemSeries.length > 0 || itemTopics.length > 0) && (
            <section className="side-card">
              {itemSeries.length > 0 && <><h2 style={{ fontSize: 'var(--step-1)' }}>סדרה</h2>
                <ul style={{ paddingInlineStart: 'var(--s-5)' }}>{itemSeries.map((s) => <li key={s.id}><Link to={`/series/${s.slug}`}>{s.title}</Link></li>)}</ul></>}
              {itemTopics.length > 0 && <><h2 style={{ fontSize: 'var(--step-1)' }}>נושאים</h2>
                <div className="row">{itemTopics.map((t) => <Link key={t.id} className="chip" to={`/topics/${t.slug}`}>{t.name}</Link>)}</div>
                {itemTopics.some((t) => t.auto) && <p className="soft" style={{ marginTop: 'var(--s-2)' }}>שיוך הנושאים הוצע אוטומטית מהכותרת.</p>}</>}
            </section>
          )}
        </aside>
      </div>
      {others.length > 0 && (
        <section className="section" aria-labelledby="h-related">
          <h2 id="h-related">חומרים קשורים</h2>
          <CardGrid items={others.slice(0, 8)} />
        </section>
      )}
      <p className="soft" style={{ marginTop: 'var(--s-6)' }}><Icon name="info" /> כתוביות ופרקים מוצגים רק כשקיים להם מקור אמיתי. לפריט זה לא נוספו.</p>
    </article>
  );
}
