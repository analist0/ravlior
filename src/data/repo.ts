import { createContext, useContext, useEffect, useRef, useState, type DependencyList } from 'react';
import type {
  Block, ContentItem, ContentQuery, ContentStatus, EventRecord, HomeSection, Institution, Menu, MediaSource, ModuleState,
  Page, PageResult, PublicQuestion, QuestionStatus, QuestionSubmission, Role, Series, SourceArchive, Topic,
} from '../shared/types.ts';
import type { BucketId } from '../shared/upload-policy.ts';

// One repository contract, two implementations:
//  - DemoRepository  (src/data/demo-repo.ts): in-browser, seeded, clearly marked as DEMO.
//  - SupabaseRepository (src/data/supabase-repo.ts): real DB/Auth/Storage behind RLS.

export type EntityName = 'content' | 'topics' | 'series' | 'pages' | 'institutions' | 'events' | 'publicQuestions';
export type EntityRecord = ContentItem | Topic | Series | Page | Institution | EventRecord | PublicQuestion;

export interface Session { userId: string; email: string; roles: Role[]; demo: boolean }

export interface ListOptions { q?: string; status?: ContentStatus | ''; type?: string; view?: 'active' | 'trash'; page?: number; pageSize?: number }

export interface Revision { version: number; createdAt: string; createdBy: string | null; snapshot: Record<string, unknown> }
export interface AuditEntry { id: string; actor: string | null; action: string; entity: string; entityId: string | null; meta: Record<string, unknown>; createdAt: string }
export interface StaffUser { userId: string; email: string; displayName: string | null; roles: Role[] }

export interface TrackResult { trackingCode: string; status: QuestionStatus; createdAt: string; answerText: string | null; publicSlug: string | null; hasAudio: boolean }

export interface QuestionInput {
  questionText: string;
  topicId: string | null;
  isAnonymous: boolean;
  askerName: string | null;
  contactEmail: string | null;
  publishConsent: boolean;
  website: string; // honeypot — must stay empty
  startedAt: number; // form render time (anti-bot)
}

export interface ImportRow {
  title: string;
  type: ContentItem['type'];
  url: string;
  summary?: string;
  speaker?: string;
  durationText?: string;
}
export interface ImportPreview { row: ImportRow; action: 'create' | 'duplicate' | 'invalid'; reason?: string; existingId?: string }

export interface UploadResult { bucket: BucketId; path: string; publicUrl: string | null }

export interface AdminRepo {
  list(entity: EntityName, opts: ListOptions): Promise<PageResult<EntityRecord>>;
  get(entity: EntityName, id: string): Promise<EntityRecord | null>;
  create(entity: EntityName, data: Partial<EntityRecord>): Promise<EntityRecord>;
  update(entity: EntityName, id: string, patch: Partial<EntityRecord>, expectedVersion: number): Promise<EntityRecord>;
  transition(entity: EntityName, id: string, to: ContentStatus, expectedVersion: number): Promise<EntityRecord>;
  softDelete(entity: EntityName, id: string, expectedVersion: number): Promise<void>;
  restore(entity: EntityName, id: string, expectedVersion: number): Promise<void>;
  destroy(entity: EntityName, id: string): Promise<void>;
  revisions(entity: EntityName, id: string): Promise<Revision[]>;
  audit(page: number): Promise<PageResult<AuditEntry>>;

  saveSources(contentId: string, sources: MediaSource[]): Promise<void>;
  setSeriesItems(seriesId: string, contentIds: string[]): Promise<void>;
  saveMenu(menu: Menu): Promise<Menu>;
  saveHomeSections(sections: HomeSection[]): Promise<HomeSection[]>;
  setModule(id: string, enabled: boolean, settings: Record<string, unknown>): Promise<void>;

  listQuestions(opts: { status?: QuestionStatus | ''; page?: number }): Promise<PageResult<QuestionSubmission>>;
  getQuestion(id: string): Promise<QuestionSubmission | null>;
  updateQuestion(id: string, patch: Partial<QuestionSubmission>, expectedVersion: number): Promise<QuestionSubmission>;
  transitionQuestion(id: string, to: QuestionStatus, expectedVersion: number): Promise<QuestionSubmission>;
  /** Creates the public, edited copy after approval + consent, and marks the submission published. */
  publishQuestion(id: string, expectedVersion: number, pub: { questionText: string; answerBlocks: Block[]; topicId: string | null; attribution: string }): Promise<void>;

  listUsers(): Promise<StaffUser[]>;
  setRole(userId: string, role: Role, grant: boolean): Promise<void>;
  inviteUser(email: string): Promise<void>;

  upload(bucket: BucketId, file: File, onProgress: (pct: number) => void, signal?: AbortSignal): Promise<UploadResult>;
  signedUrl(bucket: BucketId, path: string, seconds: number): Promise<{ url: string; expiresAt: number }>;

  previewImport(rows: ImportRow[]): Promise<ImportPreview[]>;
  commitImport(rows: ImportRow[]): Promise<{ created: number; skipped: number }>;
  exportAll(): Promise<Record<string, unknown>>;
  /** Server-side, SSRF-guarded metadata probe of a direct media URL (staff only). */
  probeUrl(url: string): Promise<Record<string, unknown>>;
}

export interface Repository {
  mode: 'demo' | 'supabase';
  listContent(q: ContentQuery): Promise<PageResult<ContentItem>>;
  getContent(slug: string): Promise<ContentItem | null>;
  getContentByIds(ids: string[]): Promise<ContentItem[]>;
  related(item: ContentItem, limit: number): Promise<ContentItem[]>;
  listTopics(): Promise<Topic[]>;
  listSeries(): Promise<Series[]>;
  getSeries(slug: string): Promise<{ series: Series; items: ContentItem[] } | null>;
  listInstitutions(): Promise<Institution[]>;
  listEvents(): Promise<EventRecord[]>;
  listArchives(): Promise<SourceArchive[]>;
  getPage(slug: string): Promise<Page | null>;
  getMenus(): Promise<Menu[]>;
  getHomeSections(): Promise<HomeSection[]>;
  listPublicQuestions(q?: string): Promise<PublicQuestion[]>;
  getPublicQuestion(slug: string): Promise<PublicQuestion | null>;
  getModules(): Promise<ModuleState[]>;
  submitQuestion(input: QuestionInput): Promise<{ trackingCode: string; token: string }>;
  trackQuestion(code: string, token: string): Promise<TrackResult | null>;
  /** Short-lived signed URL for a delivered voice answer (verified by code + token on the server). */
  answerAudioUrl(code: string, token: string): Promise<string>;

  getSession(): Promise<Session | null>;
  onAuthChange(cb: (s: Session | null) => void): () => void;
  signIn(email: string, password: string): Promise<Session>;
  signOut(): Promise<void>;
  /** Demo only: pick a role to explore the CMS. Not available when connected. */
  demoSignIn?(role: Role): Promise<Session>;
  /** Demo only: wipe local demo data back to the seed. */
  demoReset?(): Promise<void>;

  admin: AdminRepo;
}

export const RepoContext = createContext<Repository | null>(null);
export function useRepo(): Repository {
  const r = useContext(RepoContext);
  if (!r) throw new Error('useRepo outside provider');
  return r;
}

export interface AsyncState<T> { data: T | undefined; error: Error | null; loading: boolean; reload: () => void }

/** Small data hook with cancellation and a reload trigger. */
export function useAsync<T>(fn: () => Promise<T>, deps: DependencyList): AsyncState<T> {
  const [state, setState] = useState<{ data: T | undefined; error: Error | null; loading: boolean }>({ data: undefined, error: null, loading: true });
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    fnRef.current().then(
      (data) => alive && setState({ data, error: null, loading: false }),
      (error: unknown) => alive && setState({ data: undefined, error: error instanceof Error ? error : new Error(String(error)), loading: false }),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { ...state, reload: () => setTick((t) => t + 1) };
}

/** Human-readable Hebrew error for UI surfaces. */
export function errorMessage(e: unknown): string {
  if (e instanceof Error) {
    if (/Failed to fetch|NetworkError|network/i.test(e.message)) return 'אין חיבור לרשת או שהשרת אינו זמין. נסו שוב.';
    return e.message;
  }
  return 'אירעה שגיאה לא צפויה.';
}
