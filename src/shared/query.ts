import { heMatches, heScore } from './hebrew.ts';
import type { ContentItem, ContentQuery, PageResult, Series, Topic } from './types.ts';

// Public listing semantics shared by the demo repository and tests.
// Mirrors public.search_content(): published + not deleted, token AND match, sort options.

export function isPublic(c: { status: string; deletedAt: string | null }): boolean {
  return c.status === 'published' && c.deletedAt === null;
}

export function applyQuery(all: ContentItem[], q: ContentQuery, topics: Topic[], series: Series[]): PageResult<ContentItem> {
  const page = Math.max(1, q.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, q.pageSize ?? 24));
  const topic = q.topic ? topics.find((t) => t.slug === q.topic) : undefined;
  const ser = q.series ? series.find((s) => s.slug === q.series) : undefined;
  let items = all.filter(isPublic);
  if (q.type) items = items.filter((c) => c.type === q.type);
  if (q.topic) items = topic ? items.filter((c) => c.topicIds.includes(topic.id)) : [];
  if (q.series) items = ser ? items.filter((c) => ser.items.includes(c.id)) : [];
  if (q.provider) items = items.filter((c) => c.sources.some((s) => s.provider === q.provider));
  const text = (c: ContentItem) => `${c.title} ${c.summary ?? ''} ${c.speaker ?? ''}`;
  if (q.q?.trim()) items = items.filter((c) => heMatches(text(c), q.q!));
  const sorted = [...items];
  if (q.q?.trim()) {
    sorted.sort((a, b) => heScore(b.title, text(b), q.q!) - heScore(a.title, text(a), q.q!) || a.catalogOrder - b.catalogOrder);
  } else {
    switch (q.sort ?? 'newest') {
      case 'title': sorted.sort((a, b) => a.title.localeCompare(b.title, 'he')); break;
      case 'duration': sorted.sort((a, b) => (b.durationSeconds ?? -1) - (a.durationSeconds ?? -1)); break;
      case 'oldest': sorted.sort((a, b) => b.catalogOrder - a.catalogOrder); break;
      default: sorted.sort((a, b) => a.catalogOrder - b.catalogOrder);
    }
  }
  if (ser && !q.q && !q.sort) sorted.sort((a, b) => ser.items.indexOf(a.id) - ser.items.indexOf(b.id));
  return { items: sorted.slice((page - 1) * pageSize, page * pageSize), total: sorted.length, page, pageSize };
}

/** Related = same series, then shared topics, then duplicate group; never the item itself. */
export function relatedItems(all: ContentItem[], item: ContentItem, limit: number): ContentItem[] {
  const score = (c: ContentItem) =>
    (item.duplicateGroup && c.duplicateGroup === item.duplicateGroup ? 5 : 0) +
    c.seriesIds.filter((s) => item.seriesIds.includes(s)).length * 3 +
    c.topicIds.filter((t) => item.topicIds.includes(t)).length;
  return all
    .filter((c) => c.id !== item.id && isPublic(c))
    .map((c) => [c, score(c)] as const)
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1] || a[0].catalogOrder - b[0].catalogOrder)
    .slice(0, limit)
    .map(([c]) => c);
}
