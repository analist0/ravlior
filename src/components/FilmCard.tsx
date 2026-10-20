import { useLibraryState } from '../app/library-state.tsx';
import { Link } from '../app/router.tsx';
import { progressPct } from '../shared/hall.ts';
import { formatDuration } from '../shared/media.ts';
import type { ContentItem } from '../shared/types.ts';
import { thumbFor } from './Media.tsx';
import { Icon } from './Icon.tsx';
import { useToast } from './Toast.tsx';
import { IconButton, splitTitle } from './ui.tsx';

const WATCHABLE = new Set(['video', 'audio', 'short', 'live']);

export function FilmCard({ item, note }: { item: ContentItem; note?: string }) {
  const { progress, isFavorite, toggleFavorite, isWatchLater, toggleWatchLater } = useLibraryState();
  const toast = useToast();
  const [main, sub] = splitTitle(item.title);
  const thumb = thumbFor(item);
  const saved = progress[item.id];
  const pct = saved ? progressPct(saved.t, saved.d) : null;
  const duration = item.durationText ?? (item.durationSeconds ? formatDuration(item.durationSeconds) : null);
  const href = `/item/${item.slug}${saved && saved.t > 5 ? `?t=${Math.floor(saved.t)}` : ''}`;
  const fav = isFavorite(item.id);
  const later = isWatchLater(item.id);
  const canLater = WATCHABLE.has(item.type);
  return (
    <article className="card film-card">
      <div className="card-media">
        {thumb ? (
          <img src={thumb} alt="" loading="lazy" decoding="async" width={320} height={180} onError={(e) => e.currentTarget.classList.add('img-failed')} />
        ) : (
          <div className="ph"><Icon name={item.type === 'audio' ? 'listen' : 'watch'} /></div>
        )}
        {duration && <span className="card-duration ltr">{duration}</span>}
        {note && <span className="film-note">{note}</span>}
        {pct != null && <span className="card-progress" style={{ width: `${pct}%` }} />}
        {pct != null && <span className="sr-only">{`התקדמות ${pct} אחוז`}</span>}
      </div>
      <div className="card-actions">
        <IconButton
          icon="bookmark"
          label={fav ? `הסרה מהמועדפים: ${main}` : `שמירה במועדפים: ${main}`}
          pressed={fav}
          onClick={() => { const added = toggleFavorite(item.id); toast(added ? 'נשמר במועדפים' : 'הוסר מהמועדפים'); }}
        />
        {canLater && (
          <IconButton
            icon="clock"
            label={later ? `הסרה מצפייה מאוחר יותר: ${main}` : `צפייה מאוחר יותר: ${main}`}
            pressed={later}
            onClick={() => { const added = toggleWatchLater(item.id); toast(added ? 'נשמר לצפייה מאוחר יותר' : 'הוסר מרשימת הצפייה'); }}
          />
        )}
      </div>
      <div className="card-body">
        <h3 className="card-title"><Link to={href}>{main}</Link></h3>
        {sub && <p className="card-sub">{sub}</p>}
        <p className="soft" style={{ margin: 0 }}>{item.speaker ?? 'ערוץ מוסדות אור המאיר'}</p>
      </div>
    </article>
  );
}
