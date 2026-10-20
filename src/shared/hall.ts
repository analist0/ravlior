import type { ContentItem, HallMode } from './types.ts';

type RelatedBits = Pick<ContentItem, 'seriesIds' | 'topicIds' | 'duplicateGroup'>;

export function progressPct(t: number, d: number | null | undefined): number | null {
  if (!d || d <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((t / d) * 100)));
}

export function inHall(type: ContentItem['type'], hall: HallMode): boolean {
  if (hall === 'listen') return type === 'audio';
  return type === 'video' || type === 'short' || type === 'live';
}

/** Honest label for a recommendation. Empty when the items do not actually overlap. */
export function whyRelated(seed: RelatedBits, item: RelatedBits): string {
  if (seed.seriesIds.some((s) => item.seriesIds.includes(s))) return 'אותה סדרה';
  if (seed.topicIds.some((t) => item.topicIds.includes(t))) return 'נושא משותף';
  if (seed.duplicateGroup && seed.duplicateGroup === item.duplicateGroup) return 'גרסה נוספת';
  return '';
}
