// Browser repository. Talks only to /api — the database password never reaches this file.
import { API_BASE, SITE_URL } from '../app/config.ts';
import { mergeNav, type SiteHit } from '../shared/site-search.ts';
import type { UpdateInput } from '../shared/updates.ts';
import { BUCKETS, checkUpload, storagePath, type BucketId } from '../shared/upload-policy.ts';
import { PermissionError, VersionConflictError } from '../shared/workflow.ts';
import type { ContentItem, ContentQuery, Role } from '../shared/types.ts';
import type { AdminRepo, QuestionInput, Repository, Session } from './repo.ts';

type Listener = (s: Session | null) => void;
const listeners = new Set<Listener>();
const tell = (s: Session | null) => { for (const l of listeners) l(s); };
const abs = (url: string) => (url.startsWith('/') ? `${API_BASE}${url}` : url);

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers, credentials: 'include' });
  const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string; data?: T; session?: T };
  if (!res.ok) {
    if (body.code === '40001' || res.status === 409 && /שונתה/.test(body.error ?? '')) throw new VersionConflictError();
    if (body.code === '42501' || res.status === 403) throw new PermissionError(body.error);
    throw new Error(body.error ?? `שגיאת שרת (${res.status})`);
  }
  return body as T;
}
const rpc = async <T>(op: string, args: Record<string, unknown> = {}): Promise<T> => (await call<{ data: T }>('/api/rpc', { method: 'POST', body: JSON.stringify({ op, args }) })).data;

async function loadSession(): Promise<Session | null> {
  const body = await call<{ session: Session | null }>('/api/auth/me');
  return body.session;
}

export async function createApiRepository(): Promise<Repository> {
  const repo: Repository = {
    mode: 'api',
    listContent: (q: ContentQuery) => rpc('content.list', { q }),
    searchSite: async (q) => mergeNav(await rpc<SiteHit[]>('site.search', { q }), q),
    subscribeUpdates: (input: UpdateInput) => call<{ ok: true }>('/api/updates', { method: 'POST', body: JSON.stringify(input) }),
    getContent: (slug) => rpc('content.get', { slug }),
    getContentByIds: (ids) => rpc('content.byIds', { ids }),
    related: (item, limit) => rpc('content.related', { item, limit }),
    listTopics: () => rpc('topics.list'),
    listSeries: () => rpc('series.list'),
    getSeries: (slug) => rpc('series.get', { slug }),
    listInstitutions: () => rpc('institutions.list'),
    listEvents: () => rpc('events.list'),
    listArchives: () => rpc('archives.list'),
    getPage: (slug) => rpc('page.get', { slug }),
    getMenus: () => rpc('menus'),
    getHomeSections: () => rpc('home'),
    listPublicQuestions: (q) => rpc('pq.list', { q: q ?? '' }),
    getPublicQuestion: (slug) => rpc('pq.get', { slug }),
    getModules: () => rpc('modules'),
    submitQuestion: (input: QuestionInput) => call('/api/questions', { method: 'POST', body: JSON.stringify(input) }),
    trackQuestion: (code, token) => rpc('track', { code, token }),
    async answerAudioUrl(code, token) {
      const body = await call<{ url: string }>('/api/questions/voice', { method: 'POST', body: JSON.stringify({ code, token }) });
      return abs(body.url);
    },
    getSession: loadSession,
    onAuthChange(cb) {
      listeners.add(cb);
      void loadSession().then(cb);
      return () => listeners.delete(cb);
    },
    async signIn(email, password) {
      const body = await call<{ session: Session }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      tell(body.session);
      return body.session;
    },
    async signOut() {
      await call('/api/auth/logout', { method: 'POST', body: '{}' });
      tell(null);
    },
    async acceptInvite(token, password, displayName) {
      const body = await call<{ session: Session }>('/api/auth/accept', { method: 'POST', body: JSON.stringify({ token, password, displayName }) });
      tell(body.session);
      return body.session;
    },
    admin: undefined as unknown as AdminRepo,
  };

  const admin: AdminRepo = {
    list: (entity, opts) => rpc('admin.list', { entity, opts }),
    get: (entity, id) => rpc('admin.get', { entity, id }),
    create: (entity, data) => rpc('admin.create', { entity, data }),
    update: (entity, id, patch, expectedVersion) => rpc('admin.update', { entity, id, patch, expectedVersion }),
    transition: (entity, id, to, expectedVersion) => rpc('admin.transition', { entity, id, to, expectedVersion }),
    softDelete: (entity, id, expectedVersion) => rpc('admin.softDelete', { entity, id, expectedVersion }),
    restore: (entity, id, expectedVersion) => rpc('admin.restore', { entity, id, expectedVersion }),
    destroy: (entity, id) => rpc('admin.destroy', { entity, id }),
    revisions: (entity, id) => rpc('admin.revisions', { entity, id }),
    audit: (page, opts) => rpc('admin.audit', { page, opts }),
    listMedia: (opts) => rpc('admin.listMedia', { opts }),
    removeMedia: (contentId, sourceId) => rpc('admin.removeMedia', { contentId, sourceId }),
    listArchivesAdmin: (opts) => rpc('admin.listArchives', { opts }),
    createArchive: (data) => rpc('admin.createArchive', { data }),
    updateArchive: (id, patch) => rpc('admin.updateArchive', { id, patch }),
    deleteArchive: (id) => rpc('admin.deleteArchive', { id }),
    saveSources: (contentId, sources) => rpc('admin.saveSources', { contentId, sources }),
    setSeriesItems: (seriesId, contentIds) => rpc('admin.setSeriesItems', { seriesId, contentIds }),
    saveMenu: (menu) => rpc('admin.saveMenu', { menu }),
    saveHomeSections: (sections) => rpc('admin.saveHome', { sections }),
    setModule: (id, enabled, settings) => rpc('admin.setModule', { id, enabled, settings }),
    listQuestions: (opts) => rpc('admin.questions', { opts }),
    getQuestion: (id) => rpc('admin.question', { id }),
    updateQuestion: (id, patch, expectedVersion) => rpc('admin.updateQuestion', { id, patch, expectedVersion }),
    transitionQuestion: (id, to, expectedVersion) => rpc('admin.transitionQuestion', { id, to, expectedVersion }),
    publishQuestion: (id, expectedVersion, pub) => rpc('admin.publishQuestion', { id, expectedVersion, pub }),
    listUsers: () => rpc('admin.users'),
    setRole: (userId, role: Role, grant) => rpc('admin.setRole', { userId, role, grant }),
    async inviteUser(email) {
      const body = await call<{ token: string; expiresAt: string }>('/api/admin/users', { method: 'POST', body: JSON.stringify({ email }) });
      return { token: body.token, expiresAt: body.expiresAt };
    },
    async upload(bucket: BucketId, file, onProgress, signal) {
      const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
      const check = checkUpload(bucket, file, head);
      if (!check.ok) throw new Error(check.error ?? 'הקובץ אינו מותר');
      const path = storagePath(file.name, crypto.randomUUID());
      const id = crypto.randomUUID();
      const chunk = 1_500_000;
      for (let offset = 0; offset < file.size; offset += chunk) {
        if (signal?.aborted) throw new DOMException('בוטל', 'AbortError');
        const part = file.slice(offset, Math.min(file.size, offset + chunk));
        const res = await fetch(`${API_BASE}/api/media/upload`, {
          method: 'POST', credentials: 'include', signal,
          headers: {
            'content-type': 'application/octet-stream', 'x-upload-id': id, 'x-bucket': bucket, 'x-path': path,
            'x-offset': String(offset), 'x-size': String(file.size), 'x-mime': check.mime ?? '',
          },
          body: part,
        });
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(body.error ?? 'העלאה נכשלה');
        onProgress(Math.round(((offset + part.size) / file.size) * 100));
      }
      const rel = `/api/media/${bucket}/${path}`;
      return { bucket, path, publicUrl: BUCKETS[bucket].public ? (SITE_URL ? `${SITE_URL}${rel}` : rel) : null };
    },
    async signedUrl(bucket, path, seconds) {
      const signed = await rpc<{ url: string; expiresAt: number }>('admin.signedUrl', { bucket, path, seconds });
      return { url: abs(signed.url), expiresAt: signed.expiresAt };
    },
    previewImport: (rows) => rpc('admin.previewImport', { rows }),
    commitImport: (rows) => rpc('admin.commitImport', { rows }),
    exportAll: () => rpc('admin.export'),
    probeUrl: (url) => call('/api/import/probe', { method: 'POST', body: JSON.stringify({ url }) }),
  };
  repo.admin = admin;
  return repo;
}
