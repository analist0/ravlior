import type { ContentItem, Topic } from './types.ts';
import { isPublic } from './query.ts';

export interface TopicPreview {
  slug: string;
  title: string;
  youtubeId: string | null;
}

/** A public topic with a real published count and the newest linked lesson, if any. */
export interface TopicShelf {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  auto: boolean;
  count: number;
  preview: TopicPreview | null;
}

function youtubeId(item: ContentItem): string | null {
  const src = item.sources.find((s) => s.provider === 'youtube' && s.providerId);
  return src?.providerId ?? null;
}

/** Counts and previews come only from published items. Newest is the lowest catalog order, matching the library. */
export function buildTopicShelves(topics: readonly Topic[], items: readonly ContentItem[], now = Date.now()): TopicShelf[] {
  const live = items.filter((item) => isPublic(item, now));
  return topics
    .filter((topic) => isPublic(topic, now))
    .map((topic) => {
      const mine = live.filter((item) => item.topicIds.includes(topic.id));
      mine.sort((a, b) => a.catalogOrder - b.catalogOrder || a.title.localeCompare(b.title, 'he'));
      const first = mine[0];
      return {
        id: topic.id,
        slug: topic.slug,
        name: topic.name,
        description: topic.description,
        auto: topic.auto === true,
        count: mine.length,
        preview: first ? { slug: first.slug, title: first.title, youtubeId: youtubeId(first) } : null,
      };
    });
}

/** Hebrew count for a shelf. One item is not „1 פריטים”. */
export function itemCountLabel(count: number): string {
  if (count === 1) return 'פריט אחד';
  return `${count} פריטים`;
}

/** The fullest shelf. Ties keep the earlier topic. Empty shelves are not featured. */
export function featuredShelf(shelves: readonly TopicShelf[]): TopicShelf | null {
  let best: TopicShelf | null = null;
  for (const shelf of shelves) {
    if (shelf.count < 1) continue;
    if (!best || shelf.count > best.count) best = shelf;
  }
  return best;
}
