import type { EntityName, EntityRecord } from '../data/repo.ts';
import { CONTENT_TYPES } from '../shared/types.ts';
import { safeUrl } from '../shared/blocks.ts';

// Declarative field config → one generic list + editor serves every CMS entity.
export interface FieldDef {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'checkbox' | 'date' | 'number' | 'urls' | 'blocks' | 'ref-institution' | 'ref-topic';
  options?: [string, string][];
  required?: boolean;
  hint?: string;
  dir?: 'ltr';
  full?: boolean;
}

export interface EntityConfig {
  label: string;
  singular: string;
  route: string;
  titleOf: (r: EntityRecord) => string;
  publicPath?: (r: EntityRecord) => string | null;
  fields: FieldDef[];
  defaults: Record<string, unknown>;
}

const TYPE_OPTS: [string, string][] = CONTENT_TYPES.map((t) => [t, ({ video: 'וידאו', audio: 'אודיו', short: 'קצר', live: 'שידור מוקלט', book: 'ספר', leaflet: 'עלון', article: 'דבר תורה', answer: 'תשובה' })[t]]);
const SLUG_HINT = 'חלק מכתובת העמוד. ריק = ייווצר אוטומטית.';

export const ENTITIES: Record<EntityName, EntityConfig> = {
  content: {
    label: 'תכנים', singular: 'תוכן', route: 'content',
    titleOf: (r) => ('title' in r ? String(r.title) : ''),
    publicPath: (r) => ('slug' in r && 'type' in r ? `/item/${r.slug}` : null),
    defaults: { type: 'video', attributionStatus: 'source_page', verification: 'located', body: [], topicIds: [], featured: false },
    fields: [
      { key: 'title', label: 'כותרת', type: 'text', required: true, full: true, hint: 'כותרת כפי שפורסמה במקור. "ראשי / משנה" מוצג כשני חלקים.' },
      { key: 'type', label: 'סוג', type: 'select', options: TYPE_OPTS, required: true },
      { key: 'slug', label: 'כתובת (slug)', type: 'text', dir: 'ltr', hint: SLUG_HINT },
      { key: 'summary', label: 'תקציר', type: 'textarea', full: true, hint: 'רק תקציר מקורי או שנכתב אחרי צפייה. אין להמציא.' },
      { key: 'speaker', label: 'דובר', type: 'text' },
      { key: 'attributionStatus', label: 'ייחוס', type: 'select', options: [
        ['title_names_rabbi', 'הכותרת מציינת את הרב'], ['channel_only', 'ערוץ בלבד'], ['source_page', 'דף מקור מייחס'],
        ['note_only', 'הערה בלבד'], ['other_speaker', 'דובר נוסף'], ['not_author', 'הרב אינו המחבר'] ] },
      { key: 'attributionNote', label: 'הערת ייחוס', type: 'text', full: true },
      { key: 'eventDate', label: 'תאריך האירוע', type: 'date', hint: 'רק אם צוין במפורש במקור' },
      { key: 'eventDateText', label: 'תאריך כטקסט (עברי / כפי שבמקור)', type: 'text' },
      { key: 'sourcePublishedDate', label: 'תאריך פרסום במקור', type: 'date' },
      { key: 'durationText', label: 'משך (למשל 24:26)', type: 'text', dir: 'ltr' },
      { key: 'verification', label: 'מצב אימות', type: 'select', options: [['located', 'אותר'], ['archive', 'ארכיון'], ['candidate', 'מועמד — טעון בדיקה'], ['historical', 'היסטורי'], ['blocked', 'חסום']] },
      { key: 'featured', label: 'להציג כשיעור נבחר', type: 'checkbox' },
      { key: 'body', label: 'תוכן בבלוקים', type: 'blocks', full: true },
    ],
  },
  topics: {
    label: 'נושאים', singular: 'נושא', route: 'topics',
    titleOf: (r) => ('name' in r ? String(r.name) : ''),
    publicPath: (r) => ('slug' in r ? `/topics/${r.slug}` : null),
    defaults: { sort: 0 },
    fields: [
      { key: 'name', label: 'שם', type: 'text', required: true },
      { key: 'slug', label: 'כתובת (slug)', type: 'text', dir: 'ltr', hint: SLUG_HINT },
      { key: 'description', label: 'תיאור', type: 'textarea', full: true },
      { key: 'sort', label: 'מיקום בסדר', type: 'number' },
    ],
  },
  series: {
    label: 'סדרות', singular: 'סדרה', route: 'series',
    titleOf: (r) => ('title' in r ? String(r.title) : ''),
    publicPath: (r) => ('slug' in r ? `/series/${r.slug}` : null),
    defaults: { kind: 'system', sort: 0, items: [] },
    fields: [
      { key: 'title', label: 'שם הסדרה', type: 'text', required: true, full: true },
      { key: 'slug', label: 'כתובת (slug)', type: 'text', dir: 'ltr', hint: SLUG_HINT },
      { key: 'kind', label: 'סוג', type: 'select', options: [['system', 'נבנתה באתר'], ['source', 'פלייליסט מקור']], hint: '„פלייליסט מקור” רק כשקיים פלייליסט כזה במקור, עם קישור.' },
      { key: 'sourceUrl', label: 'קישור לפלייליסט במקור', type: 'text', dir: 'ltr' },
      { key: 'description', label: 'תיאור', type: 'textarea', full: true },
      { key: 'sort', label: 'מיקום בסדר', type: 'number' },
    ],
  },
  pages: {
    label: 'עמודים', singular: 'עמוד', route: 'pages',
    titleOf: (r) => ('title' in r ? String(r.title) : ''),
    publicPath: (r) => ('slug' in r ? (r.slug === 'about' ? '/about' : `/p/${r.slug}`) : null),
    defaults: { blocks: [] },
    fields: [
      { key: 'title', label: 'כותרת', type: 'text', required: true, full: true },
      { key: 'slug', label: 'כתובת (slug)', type: 'text', dir: 'ltr', required: true },
      { key: 'description', label: 'תיאור למנועי חיפוש', type: 'textarea', full: true },
      { key: 'blocks', label: 'תוכן', type: 'blocks', full: true },
    ],
  },
  institutions: {
    label: 'מוסדות', singular: 'מוסד', route: 'institutions',
    titleOf: (r) => ('name' in r ? String(r.name) : ''),
    publicPath: () => '/institutions',
    defaults: { sourceUrls: [] },
    fields: [
      { key: 'name', label: 'שם', type: 'text', required: true, full: true },
      { key: 'slug', label: 'כתובת (slug)', type: 'text', dir: 'ltr', hint: SLUG_HINT },
      { key: 'description', label: 'תיאור (מגובה מקורות)', type: 'textarea', full: true },
      { key: 'sourceUrls', label: 'קישורי מקור (שורה לכל קישור)', type: 'urls', full: true },
    ],
  },
  events: {
    label: 'אירועים', singular: 'אירוע', route: 'events',
    titleOf: (r) => ('title' in r ? String(r.title) : ''),
    publicPath: () => '/institutions',
    defaults: { sourceUrls: [] },
    fields: [
      { key: 'title', label: 'כותרת', type: 'text', required: true, full: true },
      { key: 'slug', label: 'כתובת (slug)', type: 'text', dir: 'ltr', hint: SLUG_HINT },
      { key: 'institutionId', label: 'מוסד', type: 'ref-institution' },
      { key: 'eventDate', label: 'תאריך האירוע', type: 'date', hint: 'רק אם ידוע במפורש' },
      { key: 'dateText', label: 'תאריך כטקסט', type: 'text' },
      { key: 'summary', label: 'תקציר', type: 'textarea', full: true },
      { key: 'sourceUrls', label: 'קישורי מקור', type: 'urls', full: true },
    ],
  },
  publicQuestions: {
    label: 'שו״ת מפורסם', singular: 'תשובה', route: 'public-questions',
    titleOf: (r) => ('questionText' in r ? String(r.questionText).slice(0, 80) : ''),
    publicPath: (r) => ('slug' in r ? `/responsa/${r.slug}` : null),
    defaults: { answerBlocks: [], approvedByRabbi: false, attribution: 'הרב ליאור כהן' },
    fields: [
      { key: 'questionText', label: 'השאלה (ערוכה, ללא פרטים מזהים)', type: 'textarea', required: true, full: true },
      { key: 'topicId', label: 'נושא', type: 'ref-topic' },
      { key: 'attribution', label: 'ייחוס התשובה', type: 'text', required: true },
      { key: 'answerBlocks', label: 'התשובה', type: 'blocks', full: true },
    ],
  },
};

/** Field-level validation with Hebrew messages. */
export function validateRecord(entity: EntityName, data: Record<string, unknown>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of ENTITIES[entity].fields) {
    const v = data[f.key];
    if (f.required && (v === undefined || v === null || (typeof v === 'string' && !v.trim()))) errors[f.key] = 'שדה חובה';
    if (f.key === 'slug' && typeof v === 'string' && v && !/^[^\s/?#]{1,120}$/.test(v)) errors[f.key] = 'ללא רווחים, / ? או #';
    if (f.type === 'urls' && Array.isArray(v)) {
      const bad = v.filter((u) => typeof u !== 'string' || !safeUrl(u) || !u.startsWith('https://'));
      if (bad.length) errors[f.key] = `קישורים לא תקינים (נדרש https): ${bad.join(', ')}`;
    }
    if (f.key === 'sourceUrl' && typeof v === 'string' && v && !v.startsWith('https://')) errors[f.key] = 'נדרש קישור https';
    if (f.key === 'durationText' && typeof v === 'string' && v && !/^\d+:\d{2}(:\d{2})?$/.test(v)) errors[f.key] = 'פורמט: דקות:שניות או שעות:דקות:שניות';
  }
  if (entity === 'series' && data.kind === 'source' && !data.sourceUrl) errors.sourceUrl = 'פלייליסט מקור מחייב קישור';
  return errors;
}
