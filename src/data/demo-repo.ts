// DEMO repository — runs entirely in the browser, seeded from the research dossier.
// It enforces the same workflow/role rules as the database so the CMS can be explored,
// but it is NOT a backend: data lives in this browser's localStorage only. The UI shows a
// permanent "מצב הדגמה" banner whenever this repository is active.
import { readJSON, removeKey, writeJSON } from '../app/storage.ts';
import { DEFAULT_HOME, DEFAULT_MENUS, DEFAULT_PAGES } from '../shared/defaults.ts';
import { heMatches } from '../shared/hebrew.ts';
import { previewRows } from '../shared/importer.ts';
import { canonicalizeUrl, detectProvider, parseDuration, youtubeId } from '../shared/media.ts';
import { applyQuery, isPublic, relatedItems } from '../shared/query.ts';
import { newToken, newTrackingCode, sha256Hex, validateQuestion } from '../shared/questions.ts';
import { applyAnswerEdit, applyPublicEdit, buildPublicFromApproved } from '../shared/responsa.ts';
import { slugify } from '../shared/hebrew.ts';
import { validateArchive } from '../shared/archives.ts';
import { storagePath, BUCKETS, type BucketId } from '../shared/upload-policy.ts';
import {
  contentTransitionAllowed, canEdit, canReview, isAdmin, isStaff, questionTransitionAllowed, questionTransitionNeedsReason, PermissionError, VersionConflictError,
} from '../shared/workflow.ts';
import { defaultModuleState, MODULES } from '../modules/manifest.ts';
import type {
  ContentItem, ContentStatus, EventRecord, HomeSection, Institution, MediaSource, Menu, ModuleState, Page, PageResult,
  PublicQuestion, QuestionSubmission, Role, SeedData, Series, SourceArchive, Topic,
} from '../shared/types.ts';
import type {
  AdminRepo, ArchiveInput, AuditEntry, EntityName, EntityRecord, ImportRow, ListOptions, MediaCatalogRow, QuestionInput, Repository, Revision, Session, StaffUser, TrackResult,
} from './repo.ts';

const DB_KEY = 'demo-db.v1';
const SESSION_KEY = 'demo-session.v1';

interface DemoDB {
  schema: 1;
  content: ContentItem[];
  topics: Topic[];
  series: Series[];
  pages: Page[];
  institutions: Institution[];
  events: EventRecord[];
  publicQuestions: PublicQuestion[];
  menus: Menu[];
  home: HomeSection[];
  modules: ModuleState[];
  archives: SourceArchive[];
  questions: QuestionSubmission[];
  revisions: (Revision & { entity: string; entityId: string })[];
  audit: AuditEntry[];
  users: StaffUser[];
  templates?: { id: string; title: string; body: string }[];
  etaDays?: number;
}

const dbCategories = [
  { id: 'c1000000-0000-4000-a000-000000000001', slug: 'orach-chaim', name: 'אורח חיים' },
  { id: 'c1000000-0000-4000-a000-000000000002', slug: 'yoreh-deah', name: 'יורה דעה' },
  { id: 'c1000000-0000-4000-a000-000000000003', slug: 'even-haezer', name: 'אבן העזר' },
  { id: 'c1000000-0000-4000-a000-000000000004', slug: 'choshen-mishpat', name: 'חושן משפט' },
  { id: 'c1000000-0000-4000-a000-000000000005', slug: 'emunah', name: 'אמונה ומחשבה' },
  { id: 'c1000000-0000-4000-a000-000000000006', slug: 'moadim', name: 'מועדים' },
  { id: 'c1000000-0000-4000-a000-000000000007', slug: 'tefillah', name: 'תפילה' },
  { id: 'c1000000-0000-4000-a000-000000000008', slug: 'klali', name: 'כללי' },
];

const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const clone = <T,>(v: T): T => structuredClone(v);
const delay = (ms = 60) => new Promise((r) => setTimeout(r, ms));

const DEMO_USERS: StaffUser[] = (['owner', 'admin', 'editor', 'reviewer', 'rabbi', 'viewer'] as Role[]).map((role) => ({
  userId: `demo-${role}`, email: `${role}@demo.invalid`, displayName: `משתמש הדגמה (${role})`, roles: [role],
}));

type SeedLoader = () => Promise<SeedData>;
const defaultLoader: SeedLoader = async () => (await import('./seed.json')).default as unknown as SeedData;

async function buildDb(load: SeedLoader): Promise<DemoDB> {
  const seed = await load();
  const state = defaultModuleState();
  return {
    schema: 1,
    content: seed.content,
    topics: seed.topics,
    series: seed.series,
    pages: DEFAULT_PAGES.map((p) => ({ ...p, id: uid() })),
    institutions: seed.institutions,
    events: seed.events,
    publicQuestions: [],
    menus: DEFAULT_MENUS.map((m) => ({ ...m, id: uid() })),
    home: DEFAULT_HOME.map((h) => ({ ...h, id: uid() })),
    modules: MODULES.map((m) => ({ id: m.id, enabled: state[m.id] ?? false, settings: Object.fromEntries(m.settings.map((s) => [s.key, s.default])) })),
    archives: seed.archives,
    questions: [],
    revisions: [],
    audit: [],
    users: DEMO_USERS,
  };
}

export async function createDemoRepository(load: SeedLoader = defaultLoader): Promise<Repository> {
  let db: DemoDB = readJSON<DemoDB | null>(DB_KEY, null) ?? (await buildDb(load));
  if (db.schema !== 1) db = await buildDb(load);
  let session: Session | null = readJSON<Session | null>(SESSION_KEY, null);
  const listeners = new Set<(s: Session | null) => void>();
  const blobs = new Map<string, string>(); // demo uploads: path -> object URL (memory only)

  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  const persist = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => writeJSON(DB_KEY, db), 150);
  };
  const roles = (): Role[] => session?.roles ?? [];
  const actor = () => session?.userId ?? null;
  const requireStaff = () => { if (!isStaff(roles())) throw new PermissionError('נדרשת כניסה לניהול.'); };
  const requireEdit = () => { if (!canEdit(roles())) throw new PermissionError(); };
  const log = (action: string, entity: string, entityId: string | null, meta: Record<string, unknown> = {}) => {
    db.audit.unshift({ id: uid(), actor: session?.email ?? null, action, entity, entityId, meta, createdAt: now() });
    db.audit = db.audit.slice(0, 2000);
  };
  const table = (e: EntityName): EntityRecord[] => db[e] as EntityRecord[];
  const find = (e: EntityName, id: string) => table(e).find((r) => r.id === id);

  const pub = <T extends { status: string; deletedAt: string | null }>(xs: T[]) => xs.filter(isPublic);
  const recordTitle = (r: EntityRecord): string => {
    if ('title' in r && r.title) return String(r.title);
    if ('name' in r && r.name) return String(r.name);
    if ('questionText' in r && r.questionText) return String(r.questionText);
    return '';
  };
  const cleanArchive = (data: Partial<ArchiveInput>, base?: SourceArchive): ArchiveInput => ({
    name: String(data.name ?? base?.name ?? '').trim(),
    material: String(data.material ?? base?.material ?? '').trim(),
    url: String(data.url ?? base?.url ?? '').trim(),
    verification: data.verification ?? base?.verification ?? 'archive',
    note: String(data.note ?? base?.note ?? '').trim() || null,
  });

  const repo: Repository = {
    mode: 'demo',

    async listContent(q) {
      await delay();
      return clone(applyQuery(db.content, q, db.topics, db.series));
    },
    async getContent(slug) {
      const c = db.content.find((x) => x.slug === slug);
      if (!c) return null;
      if (!isPublic(c) && !isStaff(roles())) return null;
      return clone(c);
    },
    async getContentByIds(ids) {
      return clone(ids.map((id) => db.content.find((c) => c.id === id)).filter((c): c is ContentItem => !!c && isPublic(c)));
    },
    async related(item, limit) {
      return clone(relatedItems(db.content, item, limit));
    },
    async listTopics() {
      return clone(pub(db.topics).sort((a, b) => a.sort - b.sort));
    },
    async listSeries() {
      return clone(pub(db.series).sort((a, b) => a.sort - b.sort));
    },
    async getSeries(slug) {
      const s = db.series.find((x) => x.slug === slug && isPublic(x));
      if (!s) return null;
      const items = s.items.map((id) => db.content.find((c) => c.id === id)).filter((c): c is ContentItem => !!c && isPublic(c));
      return clone({ series: s, items });
    },
    async listInstitutions() { return clone(pub(db.institutions)); },
    async listEvents() { return clone(pub(db.events)); },
    async listArchives() { return clone(db.archives); },
    async getPage(slug) {
      const p = db.pages.find((x) => x.slug === slug);
      return p && (isPublic(p) || isStaff(roles())) ? clone(p) : null;
    },
    async getMenus() { return clone(db.menus); },
    async getHomeSections() { return clone([...db.home].sort((a, b) => a.position - b.position)); },
    async searchResponsa(opts) {
      const page = opts.page ?? 1;
      let rows = db.publicQuestions.filter((p) => p.status === 'published' && !p.deletedAt && !p.hidden);
      if (opts.topic) rows = rows.filter((p) => db.topics.find((t) => t.id === p.topicId)?.slug === opts.topic);
      if (opts.category) rows = rows.filter((p) => p.categoryId === opts.category || dbCategories.find((c) => c.id === p.categoryId)?.slug === opts.category);
      if (opts.q) rows = rows.filter((p) => heMatches([p.questionText, p.sources ?? '', ...(p.tags ?? [])].join(' '), opts.q!));
      return clone({ items: rows.slice((page - 1) * 20, page * 20), total: rows.length, page, pageSize: 20 });
    },
    async suggestQuestions(q) {
      if (q.trim().length < 2) return [];
      return db.publicQuestions.filter((p) => p.status === 'published' && !p.deletedAt && !p.hidden && heMatches(p.questionText, q)).slice(0, 5).map((p) => ({ slug: p.slug, questionText: p.questionText }));
    },
    async listCategories() { return clone(dbCategories); },
    async weekQuestion() { return clone(db.publicQuestions.find((p) => p.weekPick && p.status === 'published' && !p.deletedAt && !p.hidden) ?? null); },
    async etaDays() { return db.etaDays ?? 14; },
    async followUp(code, token, questionText) {
      const parent = await this.trackQuestion(code, token);
      if (!parent || !['private_delivered', 'published', 'closed'].includes(parent.status)) throw new PermissionError('לא נמצאה תשובה שאפשר להמשיך.');
      const v = validateQuestion({ questionText, isAnonymous: true, publishConsent: false, website: '', startedAt: Date.now() - 5000 });
      if (!v.ok) throw new Error(Object.values(v.errors)[0] ?? 'השאלה אינה תקינה');
      const src = db.questions.find((q) => q.trackingCode === parent.trackingCode);
      const created = await this.submitQuestion({ ...v.value, topicId: src?.topicId ?? null, contactEmail: src?.contactEmail ?? null, isAnonymous: src?.isAnonymous ?? true, askerName: src?.askerName ?? null });
      const child = db.questions.find((q) => q.trackingCode === created.trackingCode);
      if (child && src) child.parentId = src.id;
      persist();
      return created;
    },
    async submitVoice() { return; },
    async listPublicQuestions(q) {
      return clone(pub(db.publicQuestions).filter((p) => !p.hidden && (!q || heMatches(p.questionText, q))));
    },
    async getPublicQuestion(slug) {
      const p = db.publicQuestions.find((x) => x.slug === slug && isPublic(x) && !x.hidden);
      if (!p) return null;
      const related = db.publicQuestions.filter((x) => x.id !== p.id && !!p.topicId && x.topicId === p.topicId && isPublic(x) && !x.hidden).slice(0, 4);
      return clone({ ...p, related });
    },
    async getModules() { return clone(db.modules); },

    async submitQuestion(input: QuestionInput) {
      await delay(300);
      const v = validateQuestion(input);
      if (!v.ok) throw new Error(Object.values(v.errors)[0] ?? 'הטופס אינו תקין');
      const recent = db.questions.filter((q) => Date.now() - Date.parse(q.createdAt) < 60_000).length;
      if (recent >= 3) throw new Error('נשלחו כמה שאלות ברצף. נסו שוב בעוד דקה.');
      const token = newToken();
      const trackingCode = newTrackingCode();
      db.questions.unshift({
        id: uid(), trackingCode, tokenHash: await sha256Hex(token), isAnonymous: v.value.isAnonymous, askerName: v.value.askerName,
        contactEmail: v.value.contactEmail, topicId: v.value.topicId, questionText: v.value.questionText, publishConsent: v.value.publishConsent,
        status: 'submitted', assignedTo: null, answerText: null, answerAudioPath: null, answeredBy: null, approvedBy: null,
        publicQuestionId: null, createdAt: now(), updatedAt: now(), version: 1,
      });
      log('insert', 'question_submissions', trackingCode);
      persist();
      return { trackingCode, token };
    },
    async trackQuestion(code, token): Promise<TrackResult | null> {
      await delay(200);
      const hash = await sha256Hex(token);
      const q = db.questions.find((x) => x.trackingCode === code.toUpperCase() && x.tokenHash === hash);
      if (!q) return null;
      const delivered = ['private_delivered', 'published', 'closed'].includes(q.status) && q.approvedBy;
      const pq = q.publicQuestionId ? db.publicQuestions.find((p) => p.id === q.publicQuestionId && isPublic(p)) : undefined;
      return { trackingCode: q.trackingCode, status: q.status, createdAt: q.createdAt, answerText: delivered ? q.answerText : null, publicSlug: pq?.slug ?? null, hasAudio: !!delivered && !!q.answerAudioPath };
    },

    async answerAudioUrl(code, token) {
      const hash = await sha256Hex(token);
      const q = db.questions.find((x) => x.trackingCode === code.toUpperCase() && x.tokenHash === hash);
      const url = q?.answerAudioPath ? blobs.get(`private-submissions/${q.answerAudioPath}`) : undefined;
      if (!url) throw new Error('בהדגמה קבצים נשמרים בזיכרון הדפדפן עד רענון בלבד.');
      return url;
    },
    async getSession() { return session; },
    onAuthChange(cb) { listeners.add(cb); return () => listeners.delete(cb); },
    async signIn() {
      throw new Error('במצב הדגמה אין חשבון אמיתי. בחרו תפקיד הדגמה.');
    },
    async signOut() {
      session = null;
      removeKey(SESSION_KEY);
      listeners.forEach((l) => l(null));
    },
    async acceptInvite() {
      throw new Error('הזמנות פועלות רק כשהאתר מחובר למסד.');
    },
    async demoSignIn(role) {
      const u = db.users.find((x) => x.roles.includes(role)) ?? DEMO_USERS[0]!;
      session = { userId: u.userId, email: u.email, roles: u.roles, demo: true };
      writeJSON(SESSION_KEY, session);
      listeners.forEach((l) => l(session));
      return session;
    },
    async demoReset() {
      removeKey(DB_KEY);
      db = await buildDb(load);
      persist();
    },

    admin: undefined as unknown as AdminRepo,
  };

  // ——— admin ———
  const snapshot = (e: EntityName, rec: EntityRecord) => {
    db.revisions.unshift({ entity: e, entityId: rec.id, version: rec.version, createdAt: now(), createdBy: session?.email ?? null, snapshot: clone(rec) as unknown as Record<string, unknown> });
    db.revisions = db.revisions.slice(0, 3000);
  };
  const checkVersion = (rec: { version: number }, expected: number) => {
    if (rec.version !== expected) throw new VersionConflictError();
  };
  const bump = (e: EntityName, rec: EntityRecord) => {
    snapshot(e, rec);
    rec.version += 1;
    if ('updatedAt' in rec) (rec as ContentItem).updatedAt = now();
  };

  const admin: AdminRepo = {
    async list(entity, opts: ListOptions) {
      requireStaff();
      await delay();
      const page = opts.page ?? 1;
      const pageSize = opts.pageSize ?? 25;
      let rows = table(entity).filter((r) => ('deletedAt' in r ? (opts.view === 'trash' ? r.deletedAt !== null : r.deletedAt === null) : opts.view !== 'trash'));
      if (opts.status) rows = rows.filter((r) => 'status' in r && r.status === opts.status);
      if (opts.type) rows = rows.filter((r) => 'type' in r && r.type === opts.type);
      if (opts.q) rows = rows.filter((r) => heMatches(JSON.stringify([('title' in r && r.title) || '', ('name' in r && r.name) || '', ('questionText' in r && r.questionText) || '', ('slug' in r && r.slug) || '']), opts.q!));
      const sort = opts.sort ?? 'updated';
      const sorted = [...rows].sort((a, b) => {
        if (sort === 'title') return recordTitle(a).localeCompare(recordTitle(b), 'he');
        if (sort === 'status') {
          const sa = 'status' in a ? String(a.status) : '';
          const sb = 'status' in b ? String(b.status) : '';
          return sa.localeCompare(sb) || recordTitle(a).localeCompare(recordTitle(b), 'he');
        }
        const ua = 'updatedAt' in a ? String((a as { updatedAt?: string }).updatedAt ?? '') : '';
        const ub = 'updatedAt' in b ? String((b as { updatedAt?: string }).updatedAt ?? '') : '';
        return ub.localeCompare(ua) || recordTitle(a).localeCompare(recordTitle(b), 'he');
      });
      return clone({ items: sorted.slice((page - 1) * pageSize, page * pageSize), total: sorted.length, page, pageSize });
    },
    async get(entity, id) {
      requireStaff();
      const r = find(entity, id);
      return r ? clone(r) : null;
    },
    async create(entity, data) {
      requireEdit();
      await delay(120);
      const status = (data as { status?: ContentStatus }).status ?? 'draft';
      if (!['draft', 'in_review'].includes(status)) throw new PermissionError('רשומה חדשה נוצרת כטיוטה או לבדיקה.');
      const base = { id: uid(), version: 1, status, deletedAt: null };
      let rec: EntityRecord;
      if (entity === 'content') {
        const d = data as Partial<ContentItem>;
        const id = base.id;
        rec = {
          slug: d.slug || `${slugify(d.title ?? 'item')}-${id.slice(0, 6)}`, type: d.type ?? 'video', title: d.title ?? '', summary: d.summary ?? null,
          body: d.body ?? [], speaker: d.speaker ?? null, attributionStatus: d.attributionStatus ?? 'source_page', attributionNote: d.attributionNote ?? null,
          eventDate: d.eventDate ?? null, eventDateText: d.eventDateText ?? null, sourcePublishedDate: d.sourcePublishedDate ?? null,
          durationSeconds: d.durationSeconds ?? parseDuration(d.durationText) ?? null, durationText: d.durationText ?? null, publishedAt: null,
          featured: d.featured ?? false, verification: d.verification ?? 'located', provenance: d.provenance ?? [{ section: 'cms', note: 'נוצר ב-CMS' }],
          duplicateGroup: null, catalogOrder: -Date.now(), topicIds: d.topicIds ?? [], seriesIds: [], sources: [], bookDetails: d.bookDetails ?? null,
          createdAt: now(), updatedAt: now(), ...base,
        } as ContentItem;
      } else {
        rec = { ...(data as object), ...base } as EntityRecord;
        const currentSlug = 'slug' in rec ? String((rec as { slug?: string }).slug ?? '') : '';
        if (!currentSlug) {
          const label = ('title' in rec && rec.title) || ('name' in rec && (rec as Topic).name) || ('questionText' in rec && (rec as PublicQuestion).questionText) || 'item';
          (rec as Topic).slug = `${slugify(String(label))}-${base.id.slice(0, 4)}`;
        }
        if (entity === 'series') Object.assign(rec, { items: (rec as Series).items ?? [], kind: (rec as Series).kind ?? 'system', sort: (rec as Series).sort ?? 0 });
      }
      if ('slug' in rec && table(entity).some((r) => 'slug' in r && r.slug === rec.slug)) throw new Error('הכתובת (slug) כבר קיימת. בחרו כתובת אחרת.');
      table(entity).unshift(rec);
      log('insert', entity, rec.id);
      persist();
      return clone(rec);
    },
    async update(entity, id, patch, expectedVersion, reason) {
      await delay(120);
      if (!canEdit(roles()) && !canReview(roles())) throw new PermissionError();
      const rec = find(entity, id);
      if (!rec) throw new Error('הרשומה לא נמצאה');
      checkVersion(rec, expectedVersion);
      const { status, version: _v, id: _i, ...rest } = patch as Record<string, unknown>;
      void _v; void _i;
      if (status !== undefined && status !== (rec as { status: string }).status) throw new Error('שינוי סטטוס נעשה דרך פעולות תהליך העבודה');
      if ('slug' in rest && table(entity).some((r) => r.id !== id && 'slug' in r && r.slug === rest.slug)) throw new Error('הכתובת (slug) כבר קיימת.');
      if (entity === 'publicQuestions') {
        const next = applyPublicEdit(rec as PublicQuestion, { questionText: rest.questionText as string | undefined, answerBlocks: rest.answerBlocks as PublicQuestion['answerBlocks'] }, reason);
        (rec as PublicQuestion).status = next.status;
        (rec as PublicQuestion).approvedByRabbi = next.approvedByRabbi;
      }
      bump(entity, rec);
      Object.assign(rec, rest);
      if (entity === 'content' && 'durationText' in rest) (rec as ContentItem).durationSeconds = parseDuration(rest.durationText as string);
      log('update', entity, id);
      persist();
      return clone(rec);
    },
    async transition(entity, id, to, expectedVersion, reason) {
      await delay(120);
      const rec = find(entity, id) as (EntityRecord & { status: ContentStatus }) | undefined;
      if (!rec) throw new Error('הרשומה לא נמצאה');
      checkVersion(rec, expectedVersion);
      if (!contentTransitionAllowed(rec.status, to, roles())) throw new PermissionError(`מעבר ${rec.status} ← ${to} אינו מותר לתפקיד שלך`);
      if (entity === 'publicQuestions' && to === 'published' && !(rec as PublicQuestion).approvedByRabbi) throw new PermissionError('תשובה מתפרסמת רק לאחר אישור הרב');
      if (entity === 'publicQuestions' && rec.status === 'published' && to === 'draft' && !reason?.trim()) throw new PermissionError('נדרשת סיבה ליומן כדי להסיר פרסום.');
      const from = rec.status;
      bump(entity, rec);
      rec.status = to;
      if (to === 'published' && 'publishedAt' in rec && !rec.publishedAt) (rec as ContentItem).publishedAt = now();
      log('update', entity, id, { from, to });
      persist();
      return clone(rec);
    },
    async softDelete(entity, id, expectedVersion) {
      requireEdit();
      const rec = find(entity, id) as (EntityRecord & { deletedAt: string | null }) | undefined;
      if (!rec) throw new Error('הרשומה לא נמצאה');
      checkVersion(rec, expectedVersion);
      bump(entity, rec);
      rec.deletedAt = now();
      log('soft_delete', entity, id);
      persist();
    },
    async restore(entity, id, expectedVersion) {
      requireEdit();
      const rec = find(entity, id) as (EntityRecord & { deletedAt: string | null }) | undefined;
      if (!rec) throw new Error('הרשומה לא נמצאה');
      checkVersion(rec, expectedVersion);
      bump(entity, rec);
      rec.deletedAt = null;
      log('restore', entity, id);
      persist();
    },
    async destroy(entity, id) {
      if (!isAdmin(roles())) throw new PermissionError('מחיקה קבועה מותרת למנהלים בלבד.');
      const rec = find(entity, id) as (EntityRecord & { deletedAt: string | null }) | undefined;
      if (!rec) return;
      if (!rec.deletedAt) throw new PermissionError('יש להעביר לסל המחזור לפני מחיקה קבועה.');
      (db[entity] as EntityRecord[]) = table(entity).filter((r) => r.id !== id);
      if (entity === 'content') for (const s of db.series) s.items = s.items.filter((x) => x !== id);
      log('delete', entity, id);
      persist();
    },
    async revisions(entity, id) {
      requireStaff();
      return clone(db.revisions.filter((r) => r.entity === entity && r.entityId === id));
    },
    async audit(page, opts) {
      if (!isAdmin(roles())) throw new PermissionError('יומן הפעולות זמין למנהלים בלבד.');
      const pageSize = 50;
      const q = opts?.q?.trim();
      const rows = q ? db.audit.filter((a) => heMatches([a.action, a.entity, a.actor ?? '', a.entityId ?? ''].join(' '), q)) : db.audit;
      return clone({ items: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, page, pageSize });
    },
    async listMedia(opts) {
      requireStaff();
      let rows: MediaCatalogRow[] = db.content.flatMap((c) => c.sources.map((s) => ({
        id: s.id, contentId: c.id, contentTitle: c.title, contentSlug: c.slug,
        provider: s.provider, providerId: s.providerId, kind: s.kind, url: s.url, rightsStatus: s.rightsStatus,
      })));
      if (opts.kind) rows = rows.filter((r) => r.kind === opts.kind);
      if (opts.provider) rows = rows.filter((r) => r.provider === opts.provider);
      if (opts.q) rows = rows.filter((r) => heMatches([r.contentTitle, r.url, r.provider, r.providerId ?? ''].join(' '), opts.q!));
      rows.sort((a, b) => (opts.sort === 'provider'
        ? a.provider.localeCompare(b.provider) || a.contentTitle.localeCompare(b.contentTitle, 'he')
        : a.contentTitle.localeCompare(b.contentTitle, 'he')));
      const page = opts.page ?? 1;
      const pageSize = opts.pageSize ?? 25;
      return clone({ items: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, page, pageSize });
    },
    async removeMedia(contentId, sourceId) {
      requireEdit();
      const c = db.content.find((x) => x.id === contentId);
      if (!c) throw new Error('הפריט לא נמצא');
      if (!c.sources.some((s) => s.id === sourceId)) throw new Error('המקור לא נמצא');
      await admin.saveSources(contentId, c.sources.filter((s) => s.id !== sourceId));
    },
    async listArchivesAdmin(opts) {
      requireStaff();
      let rows = [...db.archives];
      if (opts.verification) rows = rows.filter((a) => a.verification === opts.verification);
      if (opts.q) rows = rows.filter((a) => heMatches([a.name, a.material ?? '', a.url, a.note ?? ''].join(' '), opts.q!));
      rows.sort((a, b) => (opts.sort === 'verification'
        ? a.verification.localeCompare(b.verification) || a.name.localeCompare(b.name, 'he')
        : a.name.localeCompare(b.name, 'he')));
      const page = opts.page ?? 1;
      const pageSize = opts.pageSize ?? 25;
      return clone({ items: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, page, pageSize });
    },
    async createArchive(data) {
      requireEdit();
      const next = cleanArchive(data);
      const errors = validateArchive(next);
      if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
      if (db.archives.some((a) => a.url === next.url)) throw new Error('הקישור כבר קיים בארכיון.');
      const rec: SourceArchive = { id: uid(), ...next };
      db.archives.unshift(rec);
      log('insert', 'source_archives', rec.id);
      persist();
      return clone(rec);
    },
    async updateArchive(id, patch) {
      requireEdit();
      const rec = db.archives.find((a) => a.id === id);
      if (!rec) throw new Error('הארכיון לא נמצא');
      const next = cleanArchive(patch, rec);
      const errors = validateArchive(next);
      if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
      if (db.archives.some((a) => a.id !== id && a.url === next.url)) throw new Error('הקישור כבר קיים בארכיון.');
      Object.assign(rec, next);
      log('update', 'source_archives', id);
      persist();
      return clone(rec);
    },
    async deleteArchive(id) {
      requireEdit();
      if (!db.archives.some((a) => a.id === id)) throw new Error('הארכיון לא נמצא');
      db.archives = db.archives.filter((a) => a.id !== id);
      log('delete', 'source_archives', id);
      persist();
    },

    async saveSources(contentId, sources: MediaSource[]) {
      requireEdit();
      const c = db.content.find((x) => x.id === contentId);
      if (!c) throw new Error('הפריט לא נמצא');
      for (const s of sources) {
        const clash = db.content.find((o) => o.id !== contentId && o.sources.some((x) => x.kind === 'media' && s.kind === 'media' && x.providerId && x.providerId === s.providerId && x.provider === s.provider));
        if (clash) throw new Error(`המקור ${s.providerId} כבר משויך ל"${clash.title}"`);
      }
      c.sources = sources.map((s) => ({ ...s, contentId, canonicalUrl: canonicalizeUrl(s.url) }));
      log('update', 'media_sources', contentId, { count: sources.length });
      persist();
    },
    async setSeriesItems(seriesId, contentIds) {
      requireEdit();
      const s = db.series.find((x) => x.id === seriesId);
      if (!s) throw new Error('הסדרה לא נמצאה');
      for (const c of db.content) {
        const inNew = contentIds.includes(c.id);
        const had = c.seriesIds.includes(seriesId);
        if (inNew && !had) c.seriesIds.push(seriesId);
        if (!inNew && had) c.seriesIds = c.seriesIds.filter((x) => x !== seriesId);
      }
      s.items = [...contentIds];
      log('update', 'series_items', seriesId, { count: contentIds.length });
      persist();
    },
    async saveMenu(menu) {
      requireEdit();
      const m = db.menus.find((x) => x.id === menu.id);
      if (!m) throw new Error('התפריט לא נמצא');
      checkVersion(m, menu.version);
      Object.assign(m, { items: menu.items, version: m.version + 1 });
      log('update', 'menus', m.id);
      persist();
      return clone(m);
    },
    async saveHomeSections(sections) {
      requireEdit();
      for (const s of sections) {
        const cur = db.home.find((x) => x.id === s.id);
        if (cur && cur.version !== s.version) throw new VersionConflictError();
      }
      db.home = sections.map((s, i) => ({ ...s, position: i, version: s.version + 1 }));
      log('update', 'homepage_sections', null);
      persist();
      return clone(db.home);
    },
    async setModule(id, enabled, settings) {
      if (!isAdmin(roles())) throw new PermissionError('ניהול מודולים למנהלים בלבד.');
      const m = db.modules.find((x) => x.id === id);
      if (!m) throw new Error('מודול לא מוכר');
      m.enabled = enabled;
      m.settings = settings;
      log('update', 'modules', id, { enabled });
      persist();
    },

    async listQuestions(opts) {
      if (!roles().some((r) => r !== 'viewer')) throw new PermissionError('תיבת השאלות אינה זמינה לתפקיד צופה.');
      const page = opts.page ?? 1;
      let rows = db.questions.filter((q) => !opts.status || q.status === opts.status);
      if (opts.q) rows = rows.filter((q) => heMatches([q.questionText, q.trackingCode, q.askerName ?? ''].join(' '), opts.q!));
      const sort = opts.sort ?? 'newest';
      rows = [...rows].sort((a, b) => {
        if (sort === 'status') return a.status.localeCompare(b.status) || b.createdAt.localeCompare(a.createdAt);
        if (sort === 'code') return a.trackingCode.localeCompare(b.trackingCode);
        if (sort === 'oldest') return a.createdAt.localeCompare(b.createdAt);
        if (sort === 'priority') return (b.priority ?? 1) - (a.priority ?? 1) || a.createdAt.localeCompare(b.createdAt);
        return b.createdAt.localeCompare(a.createdAt);
      });
      return clone({ items: rows.slice((page - 1) * 25, page * 25), total: rows.length, page, pageSize: 25 });
    },
    async getQuestion(id) {
      if (!roles().some((r) => r !== 'viewer')) throw new PermissionError();
      const q = db.questions.find((x) => x.id === id);
      return q ? clone(q) : null;
    },
    async updateQuestion(id, patch, expectedVersion) {
      if (!roles().some((r) => ['owner', 'admin', 'editor', 'reviewer', 'rabbi'].includes(r))) throw new PermissionError();
      const q = db.questions.find((x) => x.id === id);
      if (!q) throw new Error('השאלה לא נמצאה');
      checkVersion(q, expectedVersion);
      const edited = applyAnswerEdit(q, patch);
      q.status = edited.status;
      q.approvedBy = edited.approvedBy;
      q.answerText = edited.answerText;
      q.answerAudioPath = edited.answerAudioPath;
      const allowed: (keyof QuestionSubmission)[] = ['assignedTo', 'topicId', 'priority', 'dueAt', 'answerSources', 'answerKind'];
      for (const k of allowed) if (k in patch) (q as unknown as Record<string, unknown>)[k] = patch[k];
      q.version += 1;
      q.updatedAt = now();
      log('update', 'question_submissions', q.id);
      persist();
      return clone(q);
    },
    async transitionQuestion(id, to, expectedVersion, reason) {
      const q = db.questions.find((x) => x.id === id);
      if (!q) throw new Error('השאלה לא נמצאה');
      checkVersion(q, expectedVersion);
      if (questionTransitionNeedsReason(q.status, to) && !reason?.trim()) throw new PermissionError('נדרשת סיבה ליומן עבור המעבר הזה.');
      if (!questionTransitionAllowed(q.status, to, roles(), q.publishConsent)) {
        throw new PermissionError(to === 'approved' ? 'רק הרב מאשר תשובה הניתנת בשמו.' : to === 'published' && !q.publishConsent ? 'השואל לא הסכים לפרסום.' : 'המעבר אינו מותר לתפקיד שלך.');
      }
      const from = q.status;
      q.status = to;
      if (to === 'answered') q.answeredBy = actor();
      if (to === 'approved') q.approvedBy = actor();
      if (from === 'approved' && (to === 'answered' || to === 'assigned')) q.approvedBy = null;
      q.version += 1;
      q.updatedAt = now();
      log('update', 'question_submissions', q.id, { from, to });
      persist();
      return clone(q);
    },
    async publishQuestion(id, expectedVersion, p) {
      const q = db.questions.find((x) => x.id === id);
      if (!q) throw new Error('השאלה לא נמצאה');
      const built = buildPublicFromApproved(q, p.questionText);
      checkVersion(q, expectedVersion);
      if (!built.needsReapproval && !questionTransitionAllowed('approved', 'published', roles(), true)) throw new PermissionError();
      const pq: PublicQuestion = {
        id: uid(), slug: `${slugify(p.questionText).slice(0, 40)}-${q.trackingCode.slice(0, 4).toLowerCase()}`, questionText: p.questionText,
        answerBlocks: built.blocks, answerAudioUrl: q.answerAudioPath ? `blob:public/${q.answerAudioPath}` : null, topicId: p.topicId, attribution: p.attribution,
        approvedByRabbi: built.approvedByRabbi, publishedAt: built.approvedByRabbi ? now() : null, status: built.approvedByRabbi ? 'published' : 'in_review', version: 1, deletedAt: null,
        sources: q.answerSources ?? null, answerKind: (p.answerKind as PublicQuestion['answerKind']) ?? q.answerKind ?? 'written', categoryId: p.categoryId ?? null,
      };
      db.publicQuestions.unshift(pq);
      if (built.approvedByRabbi) {
        q.publicQuestionId = pq.id;
        q.status = 'published';
        q.version += 1;
      }
      log('insert', 'public_questions', pq.id);
      persist();
      return { published: built.approvedByRabbi, needsReapproval: built.needsReapproval, id: pq.id };
    },
    async unpublishPublic(id, expectedVersion, mode, reason) {
      if (!reason.trim()) throw new PermissionError('נדרשת סיבה ליומן כדי להסיר פרסום.');
      const pq = db.publicQuestions.find((x) => x.id === id);
      if (!pq) throw new Error('השו״ת לא נמצא');
      checkVersion(pq, expectedVersion);
      if (mode === 'hidden') pq.hidden = true;
      else {
        if (!contentTransitionAllowed(pq.status, 'draft', roles())) throw new PermissionError();
        pq.status = 'draft';
        pq.approvedByRabbi = false;
      }
      pq.version += 1;
      persist();
    },
    async questionStats() {
      const open = db.questions.filter((q) => !['published', 'private_delivered', 'closed'].includes(q.status));
      const answered = db.questions.filter((q) => q.answeredAt || q.approvedBy);
      const days = answered.map((q) => (new Date(q.answeredAt ?? q.updatedAt).getTime() - new Date(q.createdAt).getTime()) / 86400000).filter((n) => n >= 0);
      const by = new Map<string | null, number>();
      for (const q of db.questions) by.set(q.topicId, (by.get(q.topicId) ?? 0) + 1);
      return {
        pendingRabbi: db.questions.filter((q) => q.status === 'answered').length,
        open: open.length,
        overdue: open.filter((q) => q.dueAt && new Date(q.dueAt).getTime() < Date.now()).length,
        avgResponseDays: days.length ? Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10 : null,
        byTopic: [...by].map(([topicId, count]) => ({ topicId, count })),
      };
    },
    async listStaff() {
      return db.users.filter((u) => u.roles.some((r) => r !== 'viewer')).map((u) => ({ id: u.userId, displayName: u.displayName ?? u.email }));
    },
    async listTemplates() { db.templates ??= []; return clone(db.templates); },
    async saveTemplate(input) {
      if (!canEdit(roles()) && !roles().includes('rabbi')) throw new PermissionError();
      db.templates ??= [];
      const row = input.id ? db.templates.find((t) => t.id === input.id) : undefined;
      if (row) { row.title = input.title; row.body = input.body; persist(); return clone(row); }
      const created = { id: uid(), title: input.title, body: input.body };
      db.templates.unshift(created);
      persist();
      return created;
    },
    async deleteTemplate(id) {
      db.templates ??= [];
      const i = db.templates.findIndex((t) => t.id === id);
      if (i >= 0) db.templates.splice(i, 1);
      persist();
    },
    async setEta(days) {
      if (!isAdmin(roles())) throw new PermissionError();
      db.etaDays = days;
      persist();
      return days;
    },

    async listUsers() {
      if (!isAdmin(roles())) throw new PermissionError('ניהול משתמשים למנהלים בלבד.');
      return clone(db.users);
    },
    async setRole(userId, role, grant) {
      if (!isAdmin(roles())) throw new PermissionError();
      if ((role === 'owner' || role === 'admin') && !roles().includes('owner')) throw new PermissionError('רק בעלים יכול להעניק או להסיר תפקיד בעלים/מנהל.');
      if (!grant && userId === actor() && role === 'owner') throw new PermissionError('אי אפשר להסיר את תפקיד הבעלים של עצמך.');
      const u = db.users.find((x) => x.userId === userId);
      if (!u) throw new Error('משתמש לא נמצא');
      u.roles = grant ? [...new Set([...u.roles, role])] : u.roles.filter((r) => r !== role);
      log(grant ? 'insert' : 'delete', 'user_roles', userId, { role });
      persist();
    },
    async inviteUser(email) {
      if (!isAdmin(roles())) throw new PermissionError();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('כתובת דוא״ל לא תקינה');
      db.users.push({ userId: `demo-${uid().slice(0, 8)}`, email, displayName: null, roles: ['viewer'] });
      log('insert', 'users', email.replace(/(.).+(@.*)/, '$1***$2'));
      persist();
      return { token: '', expiresAt: '' };
    },

    async upload(bucket: BucketId, file, onProgress, signal) {
      requireEdit();
      const path = storagePath(file.name, crypto.randomUUID());
      for (let p = 0; p <= 100; p += 10) {
        if (signal?.aborted) throw new DOMException('בוטל', 'AbortError');
        onProgress(p);
        await delay(80);
      }
      const url = URL.createObjectURL(file);
      blobs.set(`${bucket}/${path}`, url);
      log('insert', 'storage.objects', `${bucket}/${path}`);
      return { bucket, path, publicUrl: BUCKETS[bucket].public ? url : null };
    },
    async signedUrl(bucket, path, seconds) {
      requireStaff();
      const url = blobs.get(`${bucket}/${path}`);
      if (!url) throw new Error('בהדגמה קבצים נשמרים בזיכרון הדפדפן עד רענון בלבד.');
      return { url, expiresAt: Date.now() + seconds * 1000 };
    },

    async previewImport(rows: ImportRow[]) {
      requireEdit();
      return previewRows(rows, db.content);
    },
    async commitImport(rows: ImportRow[]) {
      requireEdit();
      const preview = previewRows(rows, db.content);
      let created = 0;
      for (const p of preview) {
        if (p.action !== 'create') continue;
        const rec = (await admin.create('content', {
          title: p.row.title, type: p.row.type, summary: p.row.summary ?? null, speaker: p.row.speaker ?? null, durationText: p.row.durationText ?? null,
          provenance: [{ section: 'import', note: 'יובא ב-CMS' }],
        } as Partial<ContentItem>)) as ContentItem;
        const yt = youtubeId(p.row.url);
        const provider = detectProvider(p.row.url);
        await admin.saveSources(rec.id, [{
          id: uid(), contentId: rec.id, provider, providerId: yt, url: p.row.url, canonicalUrl: canonicalizeUrl(p.row.url),
          deliveryMode: yt ? 'embed' : 'link', kind: 'media', mime: null, filesize: null, durationSeconds: null, checksum: null,
          rightsStatus: yt ? 'embed_only' : 'unverified', rightsEvidence: null, embedStatus: 'unchecked', lastCheckedAt: null, error: null,
          isPrimary: true, storageBucket: null, storagePath: null,
        }]);
        created++;
      }
      return { created, skipped: preview.length - created };
    },
    async probeUrl() {
      throw new Error('בדיקת קישור מתבצעת בשרת ה-Node, שאינו פעיל במצב הדגמה.');
    },
    async exportAll() {
      requireStaff();
      const { questions: _q, revisions: _r, audit: _a, users: _u, ...publicish } = db;
      void _q; void _r; void _a; void _u;
      return clone({ exportedAt: now(), mode: 'demo', ...publicish });
    },
  };
  repo.admin = admin;
  return repo;
}
