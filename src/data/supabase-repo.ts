// Supabase repository — real DB / Auth / Storage. Uses ONLY the publishable key; every
// read/write is authorised by RLS policies and workflow triggers in supabase/migrations.
import { createClient, type PostgrestError, type SupabaseClient } from '@supabase/supabase-js';
import { API_BASE, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '../app/config.ts';
import { previewRows } from '../shared/importer.ts';
import { canonicalizeUrl, detectProvider, parseDuration, youtubeId } from '../shared/media.ts';
import { relatedItems } from '../shared/query.ts';
import { slugify } from '../shared/hebrew.ts';
import { storagePath, BUCKETS, type BucketId } from '../shared/upload-policy.ts';
import { PermissionError, VersionConflictError } from '../shared/workflow.ts';
import type {
  ContentItem, EventRecord, HomeSection, Institution, MediaSource, Menu, ModuleState, Page, PublicQuestion,
  QuestionSubmission, Role, Series, SourceArchive, Topic,
} from '../shared/types.ts';
import type { AdminRepo, EntityName, EntityRecord, Repository, Session, StaffUser } from './repo.ts';

type Row = Record<string, unknown>;
const snake = (k: string) => k.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
const camel = (k: string) => k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
const fromRow = <T,>(r: Row): T => Object.fromEntries(Object.entries(r).map(([k, v]) => [camel(k), v])) as T;
const toRow = (o: Record<string, unknown>, omit: string[] = []): Row =>
  Object.fromEntries(Object.entries(o).filter(([k, v]) => !omit.includes(k) && v !== undefined).map(([k, v]) => [snake(k), v]));

const TABLE: Record<EntityName, string> = {
  content: 'content_items', topics: 'topics', series: 'series', pages: 'pages', institutions: 'institutions', events: 'events', publicQuestions: 'public_questions',
};
const CONTENT_SELECT = '*, media_sources(*), content_topics(topic_id), series_items(series_id, position), book_details(*)';
const CONTENT_OMIT = ['id', 'topicIds', 'seriesIds', 'sources', 'bookDetails', 'createdAt', 'updatedAt', 'searchText', 'createdBy', 'updatedBy'];

function mapContent(r: Row): ContentItem {
  const { media_sources, content_topics, series_items, book_details, search_text: _s, created_by: _c, updated_by: _u, ...rest } = r as Row & {
    media_sources?: Row[]; content_topics?: { topic_id: string }[]; series_items?: { series_id: string }[]; book_details?: Row | Row[] | null;
  };
  void _s; void _c; void _u;
  const bd = Array.isArray(book_details) ? book_details[0] : book_details;
  const item = fromRow<ContentItem>(rest);
  item.sources = (media_sources ?? []).map((m) => fromRow<MediaSource>(m)).sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
  item.topicIds = (content_topics ?? []).map((t) => t.topic_id);
  item.seriesIds = (series_items ?? []).map((s) => s.series_id);
  item.bookDetails = bd ? fromRow(bd) : null;
  item.body = Array.isArray(item.body) ? item.body : [];
  item.provenance = Array.isArray(item.provenance) ? item.provenance : [];
  return item;
}

function fail(error: PostgrestError | null, context: string): never | void {
  if (!error) return;
  if (error.code === '40001' || /version conflict/i.test(error.message)) throw new VersionConflictError();
  if (error.code === '42501' || /row-level security|not allowed|permission/i.test(error.message)) throw new PermissionError(`אין הרשאה: ${error.message}`);
  if (error.code === '23505') throw new Error('רשומה עם אותו מזהה/כתובת כבר קיימת.');
  throw new Error(`${context}: ${error.message}`);
}

export async function createSupabaseRepository(): Promise<Repository> {
  const sb: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
  });

  const loadSession = async (): Promise<Session | null> => {
    const { data } = await sb.auth.getSession();
    const u = data.session?.user;
    if (!u) return null;
    const { data: roles } = await sb.from('user_roles').select('role').eq('user_id', u.id);
    return { userId: u.id, email: u.email ?? '', roles: (roles ?? []).map((r) => r.role as Role), demo: false };
  };
  const token = async () => (await sb.auth.getSession()).data.session?.access_token ?? null;

  const fetchContent = async (ids: string[]): Promise<ContentItem[]> => {
    if (!ids.length) return [];
    const { data, error } = await sb.from('content_items').select(CONTENT_SELECT).in('id', ids);
    fail(error, 'טעינת תכנים');
    const map = new Map((data ?? []).map((r) => [r.id as string, mapContent(r)]));
    return ids.map((id) => map.get(id)).filter((c): c is ContentItem => !!c);
  };
  const api = async <T,>(path: string, init: RequestInit & { auth?: boolean } = {}): Promise<T> => {
    const headers = new Headers(init.headers);
    headers.set('content-type', 'application/json');
    if (init.auth) {
      const t = await token();
      if (t) headers.set('authorization', `Bearer ${t}`);
    }
    const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
    const body = (await res.json().catch(() => ({}))) as { error?: string } & T;
    if (!res.ok) throw new Error(body.error ?? `שגיאת שרת (${res.status})`);
    return body;
  };

  const repo: Repository = {
    mode: 'supabase',
    async listContent(q) {
      const page = Math.max(1, q.page ?? 1);
      const pageSize = Math.min(100, q.pageSize ?? 24);
      const { data, error } = await sb.rpc('search_content', {
        q: q.q ?? '', p_type: q.type || null, p_topic: q.topic || null, p_series: q.series || null, p_provider: q.provider || null,
        p_sort: q.sort ?? 'newest', p_limit: pageSize, p_offset: (page - 1) * pageSize,
      });
      fail(error, 'חיפוש');
      const rows = (data ?? []) as { id: string; total: number }[];
      return { items: await fetchContent(rows.map((r) => r.id)), total: Number(rows[0]?.total ?? 0), page, pageSize };
    },
    async getContent(slug) {
      const { data, error } = await sb.from('content_items').select(CONTENT_SELECT).eq('slug', slug).maybeSingle();
      fail(error, 'טעינת פריט');
      return data ? mapContent(data) : null;
    },
    getContentByIds: fetchContent,
    async related(item, limit) {
      const ors = [
        item.topicIds.length ? sb.from('content_topics').select('content_id').in('topic_id', item.topicIds).limit(80) : null,
        item.seriesIds.length ? sb.from('series_items').select('content_id').in('series_id', item.seriesIds).limit(80) : null,
        item.duplicateGroup ? sb.from('content_items').select('content_id:id').eq('duplicate_group', item.duplicateGroup).limit(10) : null,
      ].filter(Boolean);
      const results = await Promise.all(ors);
      const ids = [...new Set(results.flatMap((r) => ((r?.data ?? []) as { content_id: string }[]).map((x) => x.content_id)))].slice(0, 120);
      return relatedItems(await fetchContent(ids), item, limit);
    },
    async listTopics() {
      const { data, error } = await sb.from('topics').select('*').is('deleted_at', null).eq('status', 'published').order('sort');
      fail(error, 'נושאים');
      return (data ?? []).map((r) => fromRow<Topic>(r));
    },
    async listSeries() {
      const { data, error } = await sb.from('series').select('*, series_items(content_id, position)').eq('status', 'published').is('deleted_at', null).order('sort');
      fail(error, 'סדרות');
      return (data ?? []).map(({ series_items, ...r }) => ({
        ...fromRow<Series>(r),
        items: ((series_items ?? []) as { content_id: string; position: number }[]).sort((a, b) => a.position - b.position).map((x) => x.content_id),
      }));
    },
    async getSeries(slug) {
      const all = await repo.listSeries();
      const series = all.find((s) => s.slug === slug);
      return series ? { series, items: await fetchContent(series.items) } : null;
    },
    async listInstitutions() {
      const { data, error } = await sb.from('institutions').select('*').eq('status', 'published').is('deleted_at', null);
      fail(error, 'מוסדות');
      return (data ?? []).map((r) => fromRow<Institution>(r));
    },
    async listEvents() {
      const { data, error } = await sb.from('events').select('*').eq('status', 'published').is('deleted_at', null);
      fail(error, 'אירועים');
      return (data ?? []).map((r) => fromRow<EventRecord>(r));
    },
    async listArchives() {
      const { data, error } = await sb.from('source_archives').select('*');
      fail(error, 'מקורות');
      return (data ?? []).map((r) => fromRow<SourceArchive>(r));
    },
    async getPage(slug) {
      const { data, error } = await sb.from('pages').select('*').eq('slug', slug).is('deleted_at', null).maybeSingle();
      fail(error, 'עמוד');
      return data ? fromRow<Page>(data) : null;
    },
    async getMenus() {
      const { data, error } = await sb.from('menus').select('*');
      fail(error, 'תפריטים');
      return (data ?? []).map((r) => fromRow<Menu>(r));
    },
    async getHomeSections() {
      const { data, error } = await sb.from('homepage_sections').select('*').order('position');
      fail(error, 'דף הבית');
      return (data ?? []).map((r) => fromRow<HomeSection>(r));
    },
    async listPublicQuestions(q) {
      let query = sb.from('public_questions').select('*').eq('status', 'published').is('deleted_at', null).order('published_at', { ascending: false }).limit(100);
      if (q) query = query.ilike('question_text', `%${q.replace(/[%_]/g, '')}%`);
      const { data, error } = await query;
      fail(error, 'שו״ת');
      return (data ?? []).map((r) => fromRow<PublicQuestion>(r));
    },
    async getPublicQuestion(slug) {
      const { data, error } = await sb.from('public_questions').select('*').eq('slug', slug).maybeSingle();
      fail(error, 'תשובה');
      return data ? fromRow<PublicQuestion>(data) : null;
    },
    async getModules() {
      const { data, error } = await sb.from('modules').select('*');
      fail(error, 'מודולים');
      return (data ?? []).map((r) => fromRow<ModuleState>(r));
    },
    async submitQuestion(input) {
      return api<{ trackingCode: string; token: string }>('/api/questions', { method: 'POST', body: JSON.stringify(input) });
    },
    async trackQuestion(code, tok) {
      const { data, error } = await sb.rpc('track_question', { p_code: code, p_token: tok });
      fail(error, 'מעקב');
      const r = (data as Row[] | null)?.[0];
      return r ? fromRow(r) : null;
    },
    async answerAudioUrl(code, tok) {
      return (await api<{ url: string }>('/api/questions/voice', { method: 'POST', body: JSON.stringify({ code, token: tok }) })).url;
    },
    getSession: loadSession,
    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange(() => { void loadSession().then(cb); });
      return () => data.subscription.unsubscribe();
    },
    async signIn(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message === 'Invalid login credentials' ? 'פרטי הכניסה שגויים.' : error.message);
      const s = await loadSession();
      if (!s) throw new Error('הכניסה נכשלה.');
      return s;
    },
    async signOut() {
      await sb.auth.signOut();
    },
    admin: undefined as unknown as AdminRepo,
  };

  const getOne = async (entity: EntityName, id: string): Promise<EntityRecord | null> => {
    if (entity === 'content') return (await fetchContent([id]))[0] ?? null;
    if (entity === 'series') {
      const { data, error } = await sb.from('series').select('*, series_items(content_id, position)').eq('id', id).maybeSingle();
      fail(error, 'סדרה');
      if (!data) return null;
      const { series_items, ...r } = data as Row & { series_items: { content_id: string; position: number }[] };
      return { ...fromRow<Series>(r), items: series_items.sort((a, b) => a.position - b.position).map((x) => x.content_id) };
    }
    const { data, error } = await sb.from(TABLE[entity]).select('*').eq('id', id).maybeSingle();
    fail(error, 'טעינה');
    return data ? fromRow<EntityRecord>(data) : null;
  };
  const omitFor = (entity: EntityName) => (entity === 'content' ? CONTENT_OMIT : entity === 'series' ? ['id', 'items', 'createdAt', 'updatedAt'] : ['id', 'createdAt', 'updatedAt']);
  const updateRow = async (entity: EntityName, id: string, row: Row) => {
    const { data, error } = await sb.from(TABLE[entity]).update(row).eq('id', id).select('id');
    fail(error, 'שמירה');
    if (!data?.length) throw new PermissionError('השמירה נחסמה (הרשאות או שהרשומה נמחקה).');
  };

  const admin: AdminRepo = {
    async list(entity, opts) {
      const page = opts.page ?? 1;
      const pageSize = opts.pageSize ?? 25;
      let q = sb.from(TABLE[entity]).select(entity === 'content' ? CONTENT_SELECT : '*', { count: 'exact' });
      q = opts.view === 'trash' ? q.not('deleted_at', 'is', null) : q.is('deleted_at', null);
      if (opts.status) q = q.eq('status', opts.status);
      if (opts.type && entity === 'content') q = q.eq('type', opts.type);
      if (opts.q) {
        const term = opts.q.replace(/[%_,()]/g, ' ').trim();
        q = entity === 'content' ? q.ilike('search_text', `%${term}%`) : entity === 'topics' || entity === 'institutions' ? q.ilike('name', `%${term}%`)
          : entity === 'publicQuestions' ? q.ilike('question_text', `%${term}%`) : q.ilike('title', `%${term}%`);
      }
      const { data, error, count } = await q.order('updated_at', { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1);
      fail(error, 'רשימה');
      const items = (data ?? []).map((r) => (entity === 'content' ? mapContent(r as unknown as Row) : fromRow<EntityRecord>(r as unknown as Row)));
      return { items, total: count ?? items.length, page, pageSize };
    },
    get: getOne,
    async create(entity, data) {
      const d = { ...(data as Record<string, unknown>) };
      if (!d.slug && entity !== 'content') d.slug = `${slugify(String(d.title ?? d.name ?? d.questionText ?? 'item'))}-${crypto.randomUUID().slice(0, 4)}`;
      if (entity === 'content') {
        d.slug ||= `${slugify(String(d.title ?? 'item'))}-${crypto.randomUUID().slice(0, 6)}`;
        d.durationSeconds ??= parseDuration(d.durationText as string | null);
        d.catalogOrder = -Math.floor(Date.now() / 1000);
      }
      const { data: row, error } = await sb.from(TABLE[entity]).insert(toRow(d, omitFor(entity).filter((k) => k !== 'id'))).select('id').single();
      fail(error, 'יצירה');
      const id = (row as Row).id as string;
      if (entity === 'content') {
        const c = data as Partial<ContentItem>;
        if (c.topicIds?.length) fail((await sb.from('content_topics').insert(c.topicIds.map((t) => ({ content_id: id, topic_id: t })))).error, 'נושאים');
        if (c.bookDetails) fail((await sb.from('book_details').insert({ content_id: id, ...toRow(c.bookDetails as unknown as Record<string, unknown>) })).error, 'פרטי ספר');
      }
      return (await getOne(entity, id))!;
    },
    async update(entity, id, patch, expectedVersion) {
      const p = { ...(patch as Record<string, unknown>) };
      delete p.status;
      if (entity === 'content' && 'durationText' in p) p.durationSeconds = parseDuration(p.durationText as string | null);
      await updateRow(entity, id, { ...toRow(p, omitFor(entity)), version: expectedVersion });
      if (entity === 'content') {
        const c = patch as Partial<ContentItem>;
        if (c.topicIds) {
          fail((await sb.from('content_topics').delete().eq('content_id', id)).error, 'נושאים');
          if (c.topicIds.length) fail((await sb.from('content_topics').insert(c.topicIds.map((t) => ({ content_id: id, topic_id: t })))).error, 'נושאים');
        }
        if (c.bookDetails !== undefined) {
          if (c.bookDetails) fail((await sb.from('book_details').upsert({ content_id: id, ...toRow(c.bookDetails as unknown as Record<string, unknown>) })).error, 'פרטי ספר');
          else fail((await sb.from('book_details').delete().eq('content_id', id)).error, 'פרטי ספר');
        }
      }
      return (await getOne(entity, id))!;
    },
    async transition(entity, id, to, expectedVersion) {
      await updateRow(entity, id, { status: to, version: expectedVersion });
      return (await getOne(entity, id))!;
    },
    async softDelete(entity, id, v) { await updateRow(entity, id, { deleted_at: new Date().toISOString(), version: v }); },
    async restore(entity, id, v) { await updateRow(entity, id, { deleted_at: null, version: v }); },
    async destroy(entity, id) {
      const { data, error } = await sb.from(TABLE[entity]).delete().eq('id', id).select('id');
      fail(error, 'מחיקה');
      if (!data?.length) throw new PermissionError('מחיקה קבועה מותרת למנהלים בלבד, ורק לאחר העברה לסל המחזור.');
    },
    async revisions(entity, id) {
      const { data, error } = await sb.from('revisions').select('*').eq('entity', TABLE[entity]).eq('entity_id', id).order('version', { ascending: false }).limit(50);
      fail(error, 'היסטוריה');
      return (data ?? []).map((r) => ({ version: r.version, createdAt: r.created_at, createdBy: r.created_by, snapshot: r.snapshot }));
    },
    async audit(page) {
      const pageSize = 50;
      const { data, error, count } = await sb.from('audit_log').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range((page - 1) * pageSize, page * pageSize - 1);
      fail(error, 'יומן');
      return { items: (data ?? []).map((r) => ({ ...fromRow<import('./repo.ts').AuditEntry>(r), id: String(r.id) })), total: count ?? 0, page, pageSize };
    },
    async saveSources(contentId, sources) {
      const { data: existing, error } = await sb.from('media_sources').select('id').eq('content_id', contentId);
      fail(error, 'מקורות');
      const keep = new Set(sources.map((s) => s.id));
      const remove = (existing ?? []).map((r) => r.id as string).filter((id) => !keep.has(id));
      if (remove.length) fail((await sb.from('media_sources').delete().in('id', remove)).error, 'מחיקת מקור');
      if (sources.length) {
        const rows = sources.map((s) => toRow({ ...s, contentId, canonicalUrl: canonicalizeUrl(s.url) } as unknown as Record<string, unknown>));
        fail((await sb.from('media_sources').upsert(rows)).error, 'שמירת מקורות');
      }
    },
    async setSeriesItems(seriesId, ids) {
      fail((await sb.from('series_items').delete().eq('series_id', seriesId)).error, 'סדרה');
      if (ids.length) fail((await sb.from('series_items').insert(ids.map((content_id, position) => ({ series_id: seriesId, content_id, position })))).error, 'סדרה');
    },
    async saveMenu(menu) {
      const { data, error } = await sb.from('menus').update({ items: menu.items, version: menu.version }).eq('id', menu.id).select('*').single();
      fail(error, 'תפריט');
      return fromRow<Menu>(data);
    },
    async saveHomeSections(sections) {
      for (const [i, s] of sections.entries()) {
        const { error } = await sb.from('homepage_sections').update({ title: s.title, enabled: s.enabled, position: i, config: s.config, version: s.version }).eq('id', s.id);
        fail(error, 'דף הבית');
      }
      return repo.getHomeSections();
    },
    async setModule(id, enabled, settings) {
      const { data, error } = await sb.from('modules').update({ enabled, settings, updated_at: new Date().toISOString() }).eq('id', id).select('id');
      fail(error, 'מודול');
      if (!data?.length) throw new PermissionError('ניהול מודולים למנהלים בלבד.');
    },
    async listQuestions(opts) {
      const page = opts.page ?? 1;
      let q = sb.from('question_submissions').select('*', { count: 'exact' });
      if (opts.status) q = q.eq('status', opts.status);
      const { data, error, count } = await q.order('created_at', { ascending: false }).range((page - 1) * 25, page * 25 - 1);
      fail(error, 'שאלות');
      return { items: (data ?? []).map((r) => fromRow<QuestionSubmission>(r)), total: count ?? 0, page, pageSize: 25 };
    },
    async getQuestion(id) {
      const { data, error } = await sb.from('question_submissions').select('*').eq('id', id).maybeSingle();
      fail(error, 'שאלה');
      return data ? fromRow<QuestionSubmission>(data) : null;
    },
    async updateQuestion(id, patch, v) {
      const allowed = ['answerText', 'answerAudioPath', 'assignedTo', 'topicId'] as const;
      const row: Row = { version: v };
      for (const k of allowed) if (k in patch) row[snake(k)] = patch[k];
      const { data, error } = await sb.from('question_submissions').update(row).eq('id', id).select('*').single();
      fail(error, 'שמירת שאלה');
      return fromRow<QuestionSubmission>(data);
    },
    async transitionQuestion(id, to, v) {
      const { data, error } = await sb.from('question_submissions').update({ status: to, version: v }).eq('id', id).select('*').single();
      fail(error, 'מעבר סטטוס');
      return fromRow<QuestionSubmission>(data);
    },
    async publishQuestion(id, v, p) {
      const slug = `${slugify(p.questionText).slice(0, 40)}-${crypto.randomUUID().slice(0, 4)}`;
      // Created as draft, then moved through the same workflow — the DB checks approval + consent.
      const { data: pq, error } = await sb.from('public_questions')
        .insert({ slug, question_text: p.questionText, answer_blocks: p.answerBlocks, topic_id: p.topicId, attribution: p.attribution, approved_by_rabbi: true, status: 'in_review', source_submission_id: id })
        .select('id, version').single();
      fail(error, 'יצירת שו״ת ציבורי');
      if (!pq) throw new Error('יצירת שו״ת ציבורי נכשלה');
      await updateRow('publicQuestions', pq.id, { status: 'approved', version: pq.version });
      await updateRow('publicQuestions', pq.id, { status: 'published', version: pq.version + 1 });
      const { error: e2 } = await sb.from('question_submissions').update({ status: 'published', public_question_id: pq.id, version: v }).eq('id', id);
      fail(e2, 'עדכון השאלה');
    },
    async listUsers() {
      return (await api<{ users: StaffUser[] }>('/api/admin/users', { auth: true })).users;
    },
    async setRole(userId, role, grant) {
      const res = grant ? await sb.from('user_roles').insert({ user_id: userId, role }) : await sb.from('user_roles').delete().eq('user_id', userId).eq('role', role);
      fail(res.error, 'תפקיד');
    },
    async inviteUser(email) {
      await api('/api/admin/users', { method: 'POST', auth: true, body: JSON.stringify({ email }) });
    },
    async upload(bucket: BucketId, file, onProgress, signal) {
      const path = storagePath(file.name, crypto.randomUUID());
      const t = await token();
      if (!t) throw new PermissionError('נדרשת כניסה.');
      if (file.size <= 6 * 1024 * 1024) {
        onProgress(5);
        const { error } = await sb.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false, cacheControl: '3600' });
        if (error) throw new Error(`העלאה נכשלה: ${error.message}`);
        onProgress(100);
      } else {
        // Resumable (TUS) upload straight from the browser to Supabase Storage.
        const tus = await import('tus-js-client');
        await new Promise<void>((resolve, reject) => {
          const up = new tus.Upload(file, {
            endpoint: `${SUPABASE_URL}/storage/v1/upload/resumable`,
            retryDelays: [0, 3000, 5000, 10000, 20000],
            headers: { authorization: `Bearer ${t}`, 'x-upsert': 'false' },
            uploadDataDuringCreation: true,
            removeFingerprintOnSuccess: true,
            metadata: { bucketName: bucket, objectName: path, contentType: file.type, cacheControl: '3600' },
            chunkSize: 6 * 1024 * 1024, // Supabase requires exactly 6MB chunks
            onError: (e) => reject(new Error(`העלאה נכשלה: ${e.message}`)),
            onProgress: (sent, total) => onProgress(Math.round((sent / total) * 100)),
            onSuccess: () => resolve(),
          });
          signal?.addEventListener('abort', () => { void up.abort(); reject(new DOMException('בוטל', 'AbortError')); });
          void up.findPreviousUploads().then((prev) => {
            if (prev[0]) up.resumeFromPreviousUpload(prev[0]);
            up.start();
          });
        });
      }
      const publicUrl = BUCKETS[bucket].public ? sb.storage.from(bucket).getPublicUrl(path).data.publicUrl : null;
      return { bucket, path, publicUrl };
    },
    async signedUrl(bucket, path, seconds) {
      const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, seconds);
      if (error || !data) throw new Error(`יצירת קישור זמני נכשלה: ${error?.message ?? ''}`);
      return { url: data.signedUrl, expiresAt: Date.now() + seconds * 1000 };
    },
    async previewImport(rows) {
      const { data, error } = await sb.from('media_sources').select('content_id, provider, provider_id, canonical_url').limit(10000);
      fail(error, 'בדיקת כפילויות');
      const byContent = new Map<string, MediaSource[]>();
      for (const r of data ?? []) {
        const list = byContent.get(r.content_id) ?? [];
        list.push(fromRow<MediaSource>(r));
        byContent.set(r.content_id, list);
      }
      return previewRows(rows, [...byContent].map(([id, sources]) => ({ id, sources })));
    },
    async commitImport(rows) {
      const preview = await admin.previewImport(rows);
      let created = 0;
      for (const p of preview) {
        if (p.action !== 'create') continue;
        const rec = (await admin.create('content', {
          title: p.row.title, type: p.row.type, summary: p.row.summary ?? null, speaker: p.row.speaker ?? null, durationText: p.row.durationText ?? null,
          provenance: [{ section: 'import', note: 'יובא ב-CMS' }], status: 'draft',
        } as Partial<ContentItem>)) as ContentItem;
        const yt = youtubeId(p.row.url);
        await admin.saveSources(rec.id, [{
          id: crypto.randomUUID(), contentId: rec.id, provider: detectProvider(p.row.url), providerId: yt, url: p.row.url, canonicalUrl: canonicalizeUrl(p.row.url),
          deliveryMode: yt ? 'embed' : 'link', kind: 'media', mime: null, filesize: null, durationSeconds: null, checksum: null,
          rightsStatus: yt ? 'embed_only' : 'unverified', rightsEvidence: null, embedStatus: 'unchecked', lastCheckedAt: null, error: null,
          isPrimary: true, storageBucket: null, storagePath: null,
        }]);
        created++;
      }
      return { created, skipped: preview.length - created };
    },
    async probeUrl(url) {
      return api<Record<string, unknown>>('/api/import/probe', { method: 'POST', auth: true, body: JSON.stringify({ url }) });
    },
    async exportAll() {
      const out: Record<string, unknown> = { exportedAt: new Date().toISOString(), mode: 'supabase' };
      for (const t of ['content_items', 'media_sources', 'book_details', 'topics', 'content_topics', 'series', 'series_items', 'pages', 'menus',
        'homepage_sections', 'institutions', 'events', 'public_questions', 'modules', 'source_archives']) {
        const { data, error } = await sb.from(t).select('*').limit(10000);
        fail(error, `ייצוא ${t}`);
        out[t] = data;
      }
      return out;
    },
  };
  repo.admin = admin;
  return repo;
}
