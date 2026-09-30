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
import { slugify } from '../shared/hebrew.ts';
import { storagePath, BUCKETS, type BucketId } from '../shared/upload-policy.ts';
import {
  contentTransitionAllowed, canEdit, canReview, isAdmin, isStaff, questionTransitionAllowed, PermissionError, VersionConflictError,
} from '../shared/workflow.ts';
import { defaultModuleState, MODULES } from '../modules/manifest.ts';
import type {
  ContentItem, ContentStatus, EventRecord, HomeSection, Institution, MediaSource, Menu, ModuleState, Page, PageResult,
  PublicQuestion, QuestionSubmission, Role, SeedData, Series, SourceArchive, Topic,
} from '../shared/types.ts';
import type {
  AdminRepo, AuditEntry, EntityName, EntityRecord, ImportRow, ListOptions, QuestionInput, Repository, Revision, Session, StaffUser, TrackResult,
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
}

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
    async listPublicQuestions(q) {
      return clone(pub(db.publicQuestions).filter((p) => !q || heMatches(p.questionText, q)));
    },
    async getPublicQuestion(slug) {
      const p = db.publicQuestions.find((x) => x.slug === slug && isPublic(x));
      return p ? clone(p) : null;
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
      throw new Error('במצב הדגמה אין חיבור ל-Supabase Auth. בחרו תפקיד הדגמה.');
    },
    async signOut() {
      session = null;
      removeKey(SESSION_KEY);
      listeners.forEach((l) => l(null));
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
      const sorted = [...rows].sort((a, b) => ((b as ContentItem).updatedAt ?? '').localeCompare((a as ContentItem).updatedAt ?? '') || ((a as ContentItem).catalogOrder ?? 0) - ((b as ContentItem).catalogOrder ?? 0));
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
        if ('slug' in rec && !rec.slug) (rec as Topic).slug = `${slugify(('title' in rec ? rec.title : '') || ('name' in rec ? (rec as Topic).name : '') || 'item')}-${base.id.slice(0, 4)}`;
        if (entity === 'series') Object.assign(rec, { items: (rec as Series).items ?? [], kind: (rec as Series).kind ?? 'system', sort: (rec as Series).sort ?? 0 });
      }
      if ('slug' in rec && table(entity).some((r) => 'slug' in r && r.slug === rec.slug)) throw new Error('הכתובת (slug) כבר קיימת. בחרו כתובת אחרת.');
      table(entity).unshift(rec);
      log('insert', entity, rec.id);
      persist();
      return clone(rec);
    },
    async update(entity, id, patch, expectedVersion) {
      await delay(120);
      if (!canEdit(roles()) && !canReview(roles())) throw new PermissionError();
      const rec = find(entity, id);
      if (!rec) throw new Error('הרשומה לא נמצאה');
      checkVersion(rec, expectedVersion);
      const { status, version: _v, id: _i, ...rest } = patch as Record<string, unknown>;
      void _v; void _i;
      if (status !== undefined && status !== (rec as { status: string }).status) throw new Error('שינוי סטטוס נעשה דרך פעולות תהליך העבודה');
      if ('slug' in rest && table(entity).some((r) => r.id !== id && 'slug' in r && r.slug === rest.slug)) throw new Error('הכתובת (slug) כבר קיימת.');
      bump(entity, rec);
      Object.assign(rec, rest);
      if (entity === 'content' && 'durationText' in rest) (rec as ContentItem).durationSeconds = parseDuration(rest.durationText as string);
      log('update', entity, id);
      persist();
      return clone(rec);
    },
    async transition(entity, id, to, expectedVersion) {
      await delay(120);
      const rec = find(entity, id) as (EntityRecord & { status: ContentStatus }) | undefined;
      if (!rec) throw new Error('הרשומה לא נמצאה');
      checkVersion(rec, expectedVersion);
      if (!contentTransitionAllowed(rec.status, to, roles())) throw new PermissionError(`מעבר ${rec.status} ← ${to} אינו מותר לתפקיד שלך`);
      if (entity === 'publicQuestions' && to === 'published' && !(rec as PublicQuestion).approvedByRabbi) throw new PermissionError('תשובה מתפרסמת רק לאחר אישור הרב');
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
    async audit(page) {
      if (!isAdmin(roles())) throw new PermissionError('יומן הפעולות זמין למנהלים בלבד.');
      const pageSize = 50;
      return clone({ items: db.audit.slice((page - 1) * pageSize, page * pageSize), total: db.audit.length, page, pageSize });
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
      const rows = db.questions.filter((q) => !opts.status || q.status === opts.status);
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
      const allowed: (keyof QuestionSubmission)[] = ['answerText', 'answerAudioPath', 'assignedTo', 'topicId'];
      for (const k of allowed) if (k in patch) (q as unknown as Record<string, unknown>)[k] = patch[k];
      q.version += 1;
      q.updatedAt = now();
      log('update', 'question_submissions', q.id);
      persist();
      return clone(q);
    },
    async transitionQuestion(id, to, expectedVersion) {
      const q = db.questions.find((x) => x.id === id);
      if (!q) throw new Error('השאלה לא נמצאה');
      checkVersion(q, expectedVersion);
      if (!questionTransitionAllowed(q.status, to, roles(), q.publishConsent)) {
        throw new PermissionError(to === 'approved' ? 'רק הרב מאשר תשובה הניתנת בשמו.' : to === 'published' && !q.publishConsent ? 'השואל לא הסכים לפרסום.' : 'המעבר אינו מותר לתפקיד שלך.');
      }
      const from = q.status;
      q.status = to;
      if (to === 'answered') q.answeredBy = actor();
      if (to === 'approved') q.approvedBy = actor();
      q.version += 1;
      q.updatedAt = now();
      log('update', 'question_submissions', q.id, { from, to });
      persist();
      return clone(q);
    },
    async publishQuestion(id, expectedVersion, p) {
      const q = db.questions.find((x) => x.id === id);
      if (!q) throw new Error('השאלה לא נמצאה');
      if (q.status !== 'approved' || !q.approvedBy) throw new PermissionError('פרסום אפשרי רק אחרי אישור הרב.');
      if (!q.publishConsent) throw new PermissionError('השואל לא הסכים לפרסום.');
      checkVersion(q, expectedVersion);
      if (!questionTransitionAllowed('approved', 'published', roles(), true)) throw new PermissionError();
      const pq: PublicQuestion = {
        id: uid(), slug: `${slugify(p.questionText).slice(0, 40)}-${q.trackingCode.slice(0, 4).toLowerCase()}`, questionText: p.questionText,
        answerBlocks: p.answerBlocks, answerAudioUrl: null, topicId: p.topicId, attribution: p.attribution, approvedByRabbi: true,
        publishedAt: now(), status: 'published', version: 1, deletedAt: null,
      };
      db.publicQuestions.unshift(pq);
      q.publicQuestionId = pq.id;
      q.status = 'published';
      q.version += 1;
      log('insert', 'public_questions', pq.id);
      persist();
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
