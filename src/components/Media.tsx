import { useState } from 'react';
import { Link } from '../app/router.tsx';
import { useLibraryState } from '../app/library-state.tsx';
import { usePlayer, type Track } from '../player/PlayerProvider.tsx';
import { embedUrl, formatDuration, NATIVE_PLAYABLE_MIME, youtubeThumb } from '../shared/media.ts';
import type { ContentItem, MediaSource } from '../shared/types.ts';
import { Icon } from './Icon.tsx';
import { Badge, IconButton, TYPE_ICON, TYPE_LABEL, splitTitle } from './ui.tsx';
import { useToast } from './Toast.tsx';

const PROVIDER_LABEL: Record<string, string> = {
  youtube: 'YouTube', 'kol-barama': 'קול ברמה', ykr: 'כסא רחמים', ktr: 'כתר מלוכה', 'hm-news': 'המחדש', pdf: 'PDF', storage: 'שמור אצלנו', web: 'אתר',
};
export const providerLabel = (p: string) => PROVIDER_LABEL[p] ?? p;

/** Delivery priority: official embed → authorised direct URL → our Storage file → source link. */
export function pickSource(item: ContentItem): { mode: 'embed' | 'native' | 'link' | 'none'; source: MediaSource | null } {
  const media = item.sources.filter((s) => s.kind === 'media' && s.rightsStatus !== 'blocked');
  const embed = media.find((s) => s.deliveryMode === 'embed' && embedUrl(s.provider, s.providerId) && s.embedStatus !== 'failed');
  if (embed) return { mode: 'embed', source: embed };
  const native = media.find((s) => (s.deliveryMode === 'direct' || s.deliveryMode === 'storage') && s.mime && NATIVE_PLAYABLE_MIME.includes(s.mime));
  if (native) return { mode: 'native', source: native };
  const link = item.sources.find((s) => s.kind === 'media') ?? item.sources.find((s) => s.kind === 'pdf') ?? item.sources[0];
  return link ? { mode: 'link', source: link } : { mode: 'none', source: null };
}

export function playableTrack(item: ContentItem): Track | null {
  const { mode, source } = pickSource(item);
  if (mode !== 'native' || !source?.mime?.startsWith('audio/')) return null;
  return { contentId: item.id, slug: item.slug, title: splitTitle(item.title)[0], src: source.url, mime: source.mime };
}

export function thumbFor(item: ContentItem): string | null {
  const yt = item.sources.find((s) => s.provider === 'youtube' && s.providerId);
  return yt?.providerId ? youtubeThumb(yt.providerId) : null;
}

export function MediaCard({ item, view = 'grid' }: { item: ContentItem; view?: 'grid' | 'list' }) {
  const { isFavorite, toggleFavorite, progress } = useLibraryState();
  const player = usePlayer();
  const toast = useToast();
  const [main, sub] = splitTitle(item.title);
  const thumb = thumbFor(item);
  const track = playableTrack(item);
  const fav = isFavorite(item.id);
  const prog = progress[item.id];
  const pct = prog?.d ? Math.min(100, Math.round((prog.t / prog.d) * 100)) : null;
  const duration = item.durationText ?? (item.durationSeconds ? formatDuration(item.durationSeconds) : null);

  const actions = (
    <>
      <IconButton
        icon="bookmark"
        label={fav ? `הסרה מהמועדפים: ${main}` : `שמירה במועדפים: ${main}`}
        pressed={fav}
        onClick={() => { const added = toggleFavorite(item.id); toast(added ? 'נשמר במועדפים' : 'הוסר מהמועדפים'); }}
      />
      {track && <IconButton icon="queue" label={`הוספה לתור: ${main}`} onClick={() => { player.enqueue(track); toast('נוסף לתור ההאזנה'); }} />}
    </>
  );
  const media = (
    <>
      {thumb ? <img src={thumb} alt="" loading="lazy" decoding="async" width={320} height={180} onError={(e) => e.currentTarget.classList.add('img-failed')} /> : (
        <div className="ph"><Icon name={TYPE_ICON[item.type]} /></div>
      )}
      {duration && <span className="card-duration ltr">{duration}</span>}
      {pct !== null && <span style={{ position: 'absolute', insetInline: 0, bottom: 0, height: 3, background: 'var(--gold)', width: `${pct}%` }} aria-hidden="true" />}
    </>
  );
  const meta = (
    <div className="card-meta">
      <Badge tone={item.type === 'short' ? 'gold' : 'accent'}>{TYPE_LABEL[item.type]}</Badge>
      {item.sources[0] && <Badge>{providerLabel(item.sources[0].provider)}</Badge>}
      {item.attributionStatus === 'note_only' && <Badge tone="warn">הערה בלבד</Badge>}
      {item.attributionStatus === 'not_author' && <Badge tone="warn">לא בחיבור הרב</Badge>}
    </div>
  );

  if (view === 'list')
    return (
      <article className="row-item card" style={{ flexDirection: 'unset' }}>
        <div className="thumb">{media}</div>
        <div style={{ minWidth: 0, display: 'grid', gap: 4 }}>
          <h3 className="card-title"><Link to={`/item/${item.slug}`}>{main}</Link></h3>
          {sub && <p className="card-sub" style={{ margin: 0 }}>{sub}</p>}
          {meta}
        </div>
        <div className="row-actions" style={{ display: 'flex', position: 'relative', zIndex: 2 }}>{actions}</div>
      </article>
    );
  return (
    <article className="card">
      <div className="card-media">{media}</div>
      <div className="card-actions">{actions}</div>
      <div className="card-body">
        <h3 className="card-title"><Link to={`/item/${item.slug}`}>{main}</Link></h3>
        {sub && <p className="card-sub" style={{ margin: 0 }}>{sub}</p>}
        {meta}
      </div>
    </article>
  );
}

export function CardGrid({ items, view = 'grid' }: { items: ContentItem[]; view?: 'grid' | 'list' }) {
  return (
    <div className={view === 'grid' ? 'grid-cards' : 'list-rows'}>
      {items.map((c) => <MediaCard key={c.id} item={c} view={view} />)}
    </div>
  );
}

/** Main player on the item page. Never autoplays; YouTube iframe loads only after a click. */
export function MediaPlayer({ item }: { item: ContentItem }) {
  const { mode, source } = pickSource(item);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const player = usePlayer();
  const [main] = splitTitle(item.title);

  if (!source) return <div className="notice"><Icon name="info" /><div>לפריט זה עדיין לא אותר מקור מדיה.</div></div>;

  if (mode === 'embed' && source.providerId && !failed) {
    const src = embedUrl(source.provider, source.providerId)!;
    return (
      <div className={`media-frame ${item.type === 'short' ? 'short' : ''}`}>
        {loaded ? (
          <iframe
            src={`${src}&autoplay=1`}
            title={`נגן: ${main}`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            loading="lazy"
            sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
          />
        ) : (
          <button className="media-poster" onClick={() => setLoaded(true)} aria-label={`ניגון הסרטון: ${main}`}>
            <img src={youtubeThumb(source.providerId, 'hq')} alt="" loading="eager" width={480} height={360} onError={(e) => e.currentTarget.classList.add('img-failed')} />
            <span className="play"><Icon name="play" /></span>
            <span className="consent">הנגן הרשמי של YouTube ייטען בלחיצה</span>
          </button>
        )}
      </div>
    );
  }

  if (mode === 'native' && source.mime && !failed) {
    if (source.mime.startsWith('audio/')) {
      const track = playableTrack(item)!;
      const active = player.isCurrent(item.id);
      return (
        <div className="side-card row" style={{ justifyContent: 'space-between' }}>
          <div className="row"><Icon name="listen" /> <strong>{source.storagePath ? 'הקלטה שמורה באתר' : 'הקלטה מקושרת'}</strong></div>
          <button className="btn" onClick={() => (active ? player.toggle() : player.play(track))}>
            <Icon name={active && player.playing ? 'pause' : 'play'} /> {active && player.playing ? 'השהיה' : 'האזנה'}
          </button>
        </div>
      );
    }
    return (
      <div className="media-frame">
        <video controls preload="none" playsInline src={source.url} onError={() => setFailed(true)} aria-label={main} />
      </div>
    );
  }

  return (
    <div className="state" style={{ padding: 'var(--s-6)' }}>
      <Icon name={failed ? 'alert' : 'external'} />
      <h3 style={{ margin: 0 }}>{failed ? 'הנגן לא הצליח לטעון את הקובץ' : 'המדיה זמינה באתר המקור'}</h3>
      <p style={{ margin: 0 }}>
        {failed ? 'אפשר לפתוח את המקור המקורי.' : `לפריט זה אין עדיין הטמעה מאושרת או קובץ שמור אצלנו. ${source.kind === 'pdf' ? 'הקובץ מתארח באתר המקור.' : ''}`}
      </p>
      <a className="btn btn-secondary" href={source.url} target="_blank" rel="noopener noreferrer">
        <Icon name="external" /> פתיחה ב{providerLabel(source.provider)}<span className="sr-only"> (נפתח בחלון חדש)</span>
      </a>
    </div>
  );
}
