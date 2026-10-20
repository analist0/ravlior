import type { IconName } from '../components/Icon.tsx';
import type { Topic } from './types.ts';

const PATTERNS = ['dots', 'lines', 'grid', 'waves'] as const;

function hash(s: string): number {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return h;
}

function iconFor(t: Topic): IconName {
  const n = t.name;
  if (/חג|מועד|שבת|פסח|סוכות|חנוכה|פורים|ימים נוראים/.test(n)) return 'calendar';
  if (/פרש/.test(n)) return 'read';
  if (/הלכ/.test(n)) return 'layers';
  if (/אמונ|תפיל|מוסר/.test(n)) return 'heart';
  if (/מורש|מרן|מאזוז|גדול/.test(n)) return 'building';
  if (/שאל|תשוב/.test(n)) return 'ask';
  if (/שיעור|וידאו/.test(n)) return 'watch';
  return 'library';
}

/** Stable jewel and icon for a shelf. The jewel index maps to hall tokens, not ad-hoc hex. */
export function topicLook(t: Pick<Topic, 'slug' | 'name'>): { jewel: number; pattern: (typeof PATTERNS)[number]; icon: IconName } {
  const h = hash(t.slug);
  return { jewel: h % 8, pattern: PATTERNS[(h >> 3) % PATTERNS.length]!, icon: iconFor(t as Topic) };
}
