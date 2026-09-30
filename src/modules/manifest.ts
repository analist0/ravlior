import type { Role } from '../shared/types.ts';

// Typed module contract. Keep this file free of JSX/React imports: it is loaded by Node
// (tests, seed generator) as well as by the browser. UI is attached via lazy `load*` functions.

export interface SettingField {
  key: string;
  label: string;
  type: 'boolean' | 'number' | 'text';
  default: boolean | number | string;
  help?: string;
}

export interface ModuleManifest {
  id: string;
  version: string; // semver
  name: string;
  description: string;
  /** Core modules cannot be disabled. */
  core?: boolean;
  dependsOn: string[];
  /** Public route patterns owned by this module. */
  routes: string[];
  /** Admin sections owned by this module. */
  adminSections: { id: string; label: string }[];
  navigation: { label: string; href: string }[];
  permissions: { action: string; roles: Role[] }[];
  settings: SettingField[];
  /** SQL migration files (under supabase/migrations) this module relies on. */
  migrations: string[];
  /** Feature flag name; its value lives in public.modules.enabled. */
  featureFlag: string;
  /** Default state for a fresh install. */
  enabledByDefault: boolean;
}

const CORE_SQL = ['20260930000100_core_schema.sql', '20260930000200_workflow_audit.sql', '20260930000300_rls.sql'];
const EDIT: Role[] = ['owner', 'admin', 'editor'];
const REVIEW: Role[] = ['owner', 'admin', 'reviewer', 'rabbi'];

export const MODULES: ModuleManifest[] = [
  {
    id: 'library', version: '1.0.0', name: 'ספרייה', description: 'קטלוג שיעורים, חיפוש, סינון ודף שיעור.',
    core: true, dependsOn: ['media'], routes: ['/library', '/item/:slug', '/series', '/series/:slug', '/topics', '/topics/:slug'],
    adminSections: [{ id: 'content', label: 'תכנים' }, { id: 'series', label: 'סדרות' }, { id: 'topics', label: 'נושאים' }],
    navigation: [{ label: 'ספרייה', href: '/library' }],
    permissions: [{ action: 'content.edit', roles: EDIT }, { action: 'content.publish', roles: REVIEW }],
    settings: [{ key: 'pageSize', label: 'פריטים בעמוד', type: 'number', default: 24 }],
    migrations: [...CORE_SQL, '20260930000400_storage_search.sql'], featureFlag: 'module.library', enabledByDefault: true,
  },
  {
    id: 'media', version: '1.0.0', name: 'מדיה ונגנים', description: 'מתאמי ספקים, נגן אודיו מתמשך, העלאות ל-Storage.',
    core: true, dependsOn: [], routes: [],
    adminSections: [{ id: 'media', label: 'מקורות מדיה' }, { id: 'uploads', label: 'העלאות' }],
    navigation: [],
    permissions: [{ action: 'media.upload', roles: EDIT }],
    settings: [{ key: 'allowUploads', label: 'לאפשר העלאות קבצים', type: 'boolean', default: true }],
    migrations: [...CORE_SQL, '20260930000400_storage_search.sql'], featureFlag: 'module.media', enabledByDefault: true,
  },
  {
    id: 'books', version: '1.0.0', name: 'ספרים ועלונים', description: 'ספרים, קונטרסים ועלונים עם פרטי מקור.',
    dependsOn: ['library'], routes: ['/books'], adminSections: [], navigation: [{ label: 'ספרים ועלונים', href: '/books' }],
    permissions: [{ action: 'books.edit', roles: EDIT }], settings: [], migrations: CORE_SQL,
    featureFlag: 'module.books', enabledByDefault: true,
  },
  {
    id: 'responsa', version: '1.0.0', name: 'שו״ת ושאל את הרב', description: 'טופס שאלה, מעקב פרטי, תיבת שאלות ואישור הרב.',
    dependsOn: ['library'], routes: ['/responsa', '/responsa/:slug', '/ask', '/track'],
    adminSections: [{ id: 'questions', label: 'שאלות' }, { id: 'public-questions', label: 'שו״ת מפורסם' }],
    navigation: [{ label: 'שו״ת', href: '/responsa' }],
    permissions: [
      { action: 'questions.triage', roles: ['owner', 'admin', 'editor', 'reviewer'] },
      { action: 'questions.answer', roles: ['owner', 'admin', 'editor', 'rabbi'] },
      { action: 'questions.approve', roles: ['rabbi'] },
    ],
    settings: [
      { key: 'acceptQuestions', label: 'קבלת שאלות חדשות', type: 'boolean', default: true },
      { key: 'voiceAnswers', label: 'תשובות קוליות', type: 'boolean', default: true },
    ],
    migrations: CORE_SQL, featureFlag: 'module.responsa', enabledByDefault: true,
  },
  {
    id: 'institutions', version: '1.0.0', name: 'מוסדות ופעילות', description: 'מוסדות, קהילות וארכיון פעילות מתועדת.',
    dependsOn: [], routes: ['/institutions'], adminSections: [{ id: 'institutions', label: 'מוסדות' }, { id: 'events', label: 'אירועים' }],
    navigation: [{ label: 'מוסדות', href: '/institutions' }],
    permissions: [{ action: 'institutions.edit', roles: EDIT }], settings: [], migrations: CORE_SQL,
    featureFlag: 'module.institutions', enabledByDefault: true,
  },
  {
    id: 'pages', version: '1.0.0', name: 'עמודים ותפריטים', description: 'עמודי תוכן בבלוקים ותפריטי ניווט.',
    core: true, dependsOn: [], routes: ['/p/:slug', '/about'], adminSections: [{ id: 'pages', label: 'עמודים' }, { id: 'menus', label: 'תפריטים' }],
    navigation: [], permissions: [{ action: 'pages.edit', roles: EDIT }], settings: [], migrations: CORE_SQL,
    featureFlag: 'module.pages', enabledByDefault: true,
  },
  {
    id: 'home-builder', version: '1.0.0', name: 'בניית דף הבית', description: 'בחירת מקטעים וסדרם בדף הבית.',
    dependsOn: ['library'], routes: ['/'], adminSections: [{ id: 'home', label: 'דף הבית' }], navigation: [],
    permissions: [{ action: 'home.edit', roles: EDIT }], settings: [], migrations: CORE_SQL,
    featureFlag: 'module.home-builder', enabledByDefault: true,
  },
  {
    id: 'users-audit', version: '1.0.0', name: 'משתמשים ויומן', description: 'תפקידים, הרשאות ויומן פעולות מוגן.',
    core: true, dependsOn: [], routes: [], adminSections: [{ id: 'users', label: 'משתמשים' }, { id: 'audit', label: 'יומן פעולות' }],
    navigation: [], permissions: [{ action: 'users.manage', roles: ['owner', 'admin'] }], settings: [], migrations: CORE_SQL,
    featureFlag: 'module.users-audit', enabledByDefault: true,
  },
  // ——— Example module (see MODULES.md): a small, related, optional feature. ———
  {
    id: 'parasha-shelf', version: '0.1.0', name: 'מדף פרשת השבוע (דוגמה)', description: 'עמוד המרכז תכנים בנושא פרשת השבוע. מודול דוגמה להרחבה.',
    dependsOn: ['library'], routes: ['/parasha'], adminSections: [], navigation: [{ label: 'פרשת השבוע', href: '/parasha' }],
    permissions: [], settings: [{ key: 'limit', label: 'מספר פריטים', type: 'number', default: 12 }], migrations: CORE_SQL,
    featureFlag: 'module.parasha-shelf', enabledByDefault: false,
  },
];

export function getManifest(id: string): ModuleManifest | undefined {
  return MODULES.find((m) => m.id === id);
}

/** Returns a Hebrew error string if the toggle would leave the system inconsistent, else null. */
export function validateToggle(id: string, enabled: boolean, state: Record<string, boolean>): string | null {
  const m = getManifest(id);
  if (!m) return 'מודול לא מוכר';
  if (!enabled && m.core) return `"${m.name}" הוא מודול ליבה ואי אפשר לכבות אותו`;
  if (enabled) {
    const missing = m.dependsOn.filter((d) => !state[d]);
    if (missing.length) return `יש להפעיל קודם: ${missing.map((d) => getManifest(d)?.name ?? d).join(', ')}`;
  } else {
    const dependents = MODULES.filter((o) => state[o.id] && o.dependsOn.includes(id));
    if (dependents.length) return `מודולים פעילים תלויים בו: ${dependents.map((d) => d.name).join(', ')}`;
  }
  return null;
}

export function defaultModuleState(): Record<string, boolean> {
  return Object.fromEntries(MODULES.map((m) => [m.id, m.enabledByDefault]));
}

export function moduleForPath(path: string): ModuleManifest | undefined {
  return MODULES.find((m) =>
    m.routes.some((r) => {
      const re = new RegExp('^' + r.replace(/:[a-z]+/g, '[^/]+') + '$');
      return re.test(path);
    }),
  );
}
