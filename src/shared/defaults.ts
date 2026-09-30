import type { HomeSection, Menu, Page } from './types.ts';

// Initial editorial content. Every factual sentence here is taken from the research dossier and
// cites its source. Pages are editable in the CMS; nothing here invents contact details or titles.

const P = (slug: string, title: string, description: string, blocks: Page['blocks']): Omit<Page, 'id'> => ({
  slug, title, description, blocks, status: 'published', version: 1, deletedAt: null,
});

export const DEFAULT_PAGES: Omit<Page, 'id'>[] = [
  P('about', 'הרב והמוסדות', 'מידע מגובה מקורות על הרב ליאור כהן ומוסדות אור המאיר.', [
    { type: 'paragraph', text: 'הרב מופיע במקורות בעיקר בשם הרב ליאור כהן, ולעיתים ליאור הכהן. מקורות מוסדיים מתארים אותו כחתנו ונאמן ביתו של הרב מאיר מאזוז זצ״ל, ראש ישיבת מאור יוסף וראש מוסדות אור המאיר באלעד.' },
    { type: 'quote', text: 'ייסוד הישיבה הגדולה אורחות מאיר בראשותו', source: 'כתר מלוכה — https://www.ktr.org.il/post/_1110' },
    { type: 'paragraph', text: 'נמצא תיעוד על קהילת היכל משה במגדל משה אביב ברמת גן. זמני שיעורים ופעילות עדכניים טרם אומתו.' },
    { type: 'heading', level: 2, text: 'מה עדיין חסר' },
    { type: 'paragraph', text: 'ביוגרפיה מאושרת, תמונה רשמית, פרטי קשר רשמיים של המוסדות ולוחות שיעורים עדכניים טרם התקבלו. פרטים אלה יתווספו רק לאחר אישור מטעם הרב או המוסדות.' },
    { type: 'cta', label: 'למוסדות ולפעילות המתועדת', href: '/institutions' },
  ]),
  P('accessibility', 'הצהרת נגישות', 'מצב הנגישות של האתר ודרכי פנייה.', [
    { type: 'paragraph', text: 'האתר נבנה במטרה לעמוד ברמה AA של הנחיות WCAG 2.2: ניווט מלא במקלדת, תוויות לשדות, ניגודיות צבעים, תמיכה בהגדלת טקסט וכיבוד העדפת "הפחתת תנועה".' },
    { type: 'paragraph', text: 'בכל עמוד ניתן להפעיל "הפחתת תנועה" ולבחור מצב כהה או בהיר מתפריט התצוגה. אודיו ווידאו אינם מתנגנים אוטומטית.' },
    { type: 'paragraph', text: 'בדיקה מקיפה עם קוראי מסך טרם הושלמה. אם נתקלתם בקושי, נשמח לשמוע דרך טופס השאלות תחת הנושא "פנייה כללית".' },
  ]),
  P('privacy', 'מדיניות פרטיות', 'איזה מידע נשמר ואיך.', [
    { type: 'paragraph', text: 'אין צורך להירשם כדי לצפות, להאזין או לעיין. העדפות תצוגה, מועדפים והתקדמות האזנה נשמרים בדפדפן שלכם בלבד (localStorage) ואינם נשלחים אלינו.' },
    { type: 'heading', level: 2, text: 'שאלות לרב' },
    { type: 'paragraph', text: 'שאלה נשלחת לצוות בלבד. אפשר לשאול בעילום שם. שאלה לא תפורסם ללא הסכמה נפרדת ומפורשת ורק לאחר אישור הרב. מספר המעקב והקוד הסודי מוצגים לכם פעם אחת; אנו שומרים רק גיבוב (hash) של הקוד ולא את הקוד עצמו.' },
    { type: 'paragraph', text: 'לצורך מניעת הצפה נשמר מזהה מגובב של הפונה לפרק זמן קצר. כתובת IP אינה נשמרת כטקסט גלוי.' },
  ]),
  P('terms', 'תנאי שימוש', 'תנאי השימוש באתר.', [
    { type: 'paragraph', text: 'התכנים באתר מוצגים עם ייחוס למקורם. סרטוני YouTube מוצגים בנגן הרשמי בלבד. קבצים, תמונות והקלטות אינם מופצים מחדש אלא אם ניתנה לכך הרשאה.' },
    { type: 'paragraph', text: 'תשובות הלכתיות המוצגות באתר נמסרו לשואל מסוים ובנסיבות מסוימות. לשאלה מעשית יש לפנות לרב.' },
  ]),
  P('contact', 'יצירת קשר', 'דרכי פנייה.', [
    { type: 'paragraph', text: 'פרטי קשר רשמיים של הרב ושל מוסדות אור המאיר טרם אומתו ולכן אינם מוצגים כאן.' },
    { type: 'paragraph', text: 'בינתיים ניתן לפנות דרך טופס השאלה — גם לפניות כלליות.' },
    { type: 'cta', label: 'לטופס הפנייה', href: '/ask' },
  ]),
];

export const DEFAULT_MENUS: Omit<Menu, 'id'>[] = [
  { location: 'header', version: 1, items: [
    { label: 'ספרייה', href: '/library' }, { label: 'סדרות', href: '/series' }, { label: 'נושאים', href: '/topics' },
    { label: 'ספרים ועלונים', href: '/books' }, { label: 'שו״ת', href: '/responsa' }, { label: 'הרב והמוסדות', href: '/about' },
  ] },
  { location: 'footer', version: 1, items: [
    { label: 'נגישות', href: '/p/accessibility' }, { label: 'פרטיות', href: '/p/privacy' }, { label: 'תנאי שימוש', href: '/p/terms' },
    { label: 'יצירת קשר', href: '/p/contact' }, { label: 'מקורות', href: '/sources' },
  ] },
];

export const DEFAULT_HOME: Omit<HomeSection, 'id'>[] = [
  { kind: 'actions', title: 'מה תרצו לעשות?', enabled: true, position: 0, config: {}, version: 1 },
  { kind: 'continue', title: 'המשך האזנה', enabled: true, position: 1, config: {}, version: 1 },
  { kind: 'featured', title: 'שיעור נבחר', enabled: true, position: 2, config: {}, version: 1 },
  { kind: 'latest', title: 'חדש בערוץ', enabled: true, position: 3, config: { limit: 8 }, version: 1 },
  { kind: 'series', title: 'סדרות', enabled: true, position: 4, config: {}, version: 1 },
  { kind: 'topics', title: 'לפי נושא', enabled: true, position: 5, config: {}, version: 1 },
  { kind: 'books', title: 'ספרים ועלונים', enabled: true, position: 6, config: { limit: 4 }, version: 1 },
  { kind: 'answers', title: 'תשובות אחרונות', enabled: true, position: 7, config: { limit: 4 }, version: 1 },
];
