import { Link } from '../app/router.tsx';
import { Icon } from './Icon.tsx';
import { youtubeThumb } from '../shared/media.ts';
import { topicLook } from '../shared/topic-look.ts';
import { itemCountLabel, type TopicShelf } from '../shared/topic-shelf.ts';
import { splitTitle } from './ui.tsx';

export function TopicCard({ shelf, featured = false }: { shelf: TopicShelf; featured?: boolean }) {
  const look = topicLook(shelf);
  const [main] = shelf.preview ? splitTitle(shelf.preview.title) : [null];
  const thumb = shelf.preview?.youtubeId ? youtubeThumb(shelf.preview.youtubeId, 'hq') : null;
  return (
    <Link
      to={`/topics/${shelf.slug}`}
      className={`topic-card pat-${look.pattern}${featured ? ' is-featured' : ''}`}
      data-jewel={look.jewel}
    >
      {thumb && <img className="topic-card-thumb" src={thumb} alt="" width={320} height={180} loading="lazy" decoding="async" />}
      <span className="topic-card-icon" aria-hidden="true"><Icon name={look.icon} /></span>
      <span className="topic-card-body">
        {featured && <span className="topic-card-flag">המדף המלא</span>}
        <strong>{shelf.name}</strong>
        {main
          ? <span className="topic-card-preview">{main}</span>
          : shelf.description
            ? <span className="topic-card-preview">{shelf.description}</span>
            : <span className="topic-card-preview">עדיין בלי שיעור משויך</span>}
        <span className="topic-card-count">{itemCountLabel(shelf.count)}</span>
      </span>
    </Link>
  );
}
