import type { Block } from './types.ts';

// Whitelisted block schema. Blocks are rendered as React text/attributes only —
// there is no HTML, script or arbitrary iframe path. Anything unknown is dropped.

export const BLOCK_TYPES = ['heading', 'paragraph', 'image', 'quote', 'media', 'pdf', 'related', 'cta'] as const;
export const BLOCK_LABEL: Record<Block['type'], string> = {
  heading: 'כותרת', paragraph: 'פסקה', image: 'תמונה', quote: 'ציטוט עם מקור', media: 'מדיה מהספרייה',
  pdf: 'קובץ PDF', related: 'תכנים קשורים', cta: 'כפתור פעולה',
};

const MAX_TEXT = 8000;
const str = (v: unknown, max = MAX_TEXT) => (typeof v === 'string' ? v.slice(0, max) : '');

/** https URLs, or storage paths served from our own buckets. Rejects javascript:, data:, http: etc. */
export function safeUrl(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (/^\/(?!\/)[^\s]*$/.test(s)) return s; // same-origin path
  try {
    const u = new URL(s);
    return u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

export interface BlockIssue { index: number; message: string }

export function sanitizeBlocks(input: unknown): { blocks: Block[]; issues: BlockIssue[] } {
  const blocks: Block[] = [];
  const issues: BlockIssue[] = [];
  if (!Array.isArray(input)) return { blocks, issues: [{ index: -1, message: 'תוכן הבלוקים אינו רשימה' }] };
  input.slice(0, 200).forEach((raw, index) => {
    const b = (raw ?? {}) as Record<string, unknown>;
    switch (b.type) {
      case 'heading': {
        const text = str(b.text, 200).trim();
        if (!text) return void issues.push({ index, message: 'כותרת ריקה' });
        blocks.push({ type: 'heading', level: b.level === 3 ? 3 : 2, text });
        return;
      }
      case 'paragraph': {
        const text = str(b.text).trim();
        if (!text) return void issues.push({ index, message: 'פסקה ריקה' });
        blocks.push({ type: 'paragraph', text });
        return;
      }
      case 'image': {
        const src = safeUrl(b.src);
        const alt = str(b.alt, 300).trim();
        if (!src) return void issues.push({ index, message: 'כתובת תמונה חייבת להיות https או קובץ מהאחסון' });
        if (!alt) return void issues.push({ index, message: 'לתמונה חסר טקסט חלופי' });
        if (/\.svg(\?|$)/i.test(src)) return void issues.push({ index, message: 'SVG אינו מותר' });
        blocks.push({ type: 'image', src, alt, credit: str(b.credit, 200).trim() || undefined });
        return;
      }
      case 'quote': {
        const text = str(b.text, 2000).trim();
        const source = str(b.source, 300).trim();
        if (!text || !source) return void issues.push({ index, message: 'ציטוט מחייב טקסט ומקור' });
        blocks.push({ type: 'quote', text, source });
        return;
      }
      case 'media': {
        const contentId = str(b.contentId, 64).trim();
        if (!contentId) return void issues.push({ index, message: 'לא נבחר פריט מדיה' });
        blocks.push({ type: 'media', contentId });
        return;
      }
      case 'pdf': {
        const src = safeUrl(b.src);
        const title = str(b.title, 200).trim();
        if (!src || !/\.pdf(\?|$)/i.test(decodeURI(src))) return void issues.push({ index, message: 'קישור PDF לא תקין' });
        blocks.push({ type: 'pdf', src, title: title || 'קובץ PDF' });
        return;
      }
      case 'related': {
        const ids = Array.isArray(b.contentIds) ? b.contentIds.filter((x): x is string => typeof x === 'string').slice(0, 12) : [];
        if (!ids.length) return void issues.push({ index, message: 'לא נבחרו תכנים קשורים' });
        blocks.push({ type: 'related', contentIds: ids });
        return;
      }
      case 'cta': {
        const href = safeUrl(b.href);
        const label = str(b.label, 80).trim();
        if (!href || !label) return void issues.push({ index, message: 'כפתור מחייב תווית וקישור בטוח' });
        blocks.push({ type: 'cta', label, href });
        return;
      }
      default:
        issues.push({ index, message: `סוג בלוק לא מוכר: ${String(b.type)}` });
    }
  });
  return { blocks, issues };
}

export function emptyBlock(type: Block['type']): Block {
  switch (type) {
    case 'heading': return { type, level: 2, text: '' };
    case 'paragraph': return { type, text: '' };
    case 'image': return { type, src: '', alt: '' };
    case 'quote': return { type, text: '', source: '' };
    case 'media': return { type, contentId: '' };
    case 'pdf': return { type, src: '', title: '' };
    case 'related': return { type, contentIds: [] };
    case 'cta': return { type, label: '', href: '' };
  }
}

export function blocksToPlainText(blocks: Block[]): string {
  return blocks
    .map((b) => ('text' in b ? b.text : b.type === 'cta' ? b.label : ''))
    .filter(Boolean)
    .join('\n');
}
