// Repository operations executed under RLS (withActor). Column names are whitelisted.
import { validateArchive } from '../src/shared/archives.ts';
import { slugify } from '../src/shared/hebrew.ts';
import { newToken, sha256Hex } from '../src/shared/questions.ts';
import { buildPublicFromApproved } from '../src/shared/responsa.ts';
import { questionTransitionNeedsReason } from '../src/shared/workflow.ts';
import { notifyAnswerReady, notifyStaff } from './mailer.ts';
import { previewRows } from '../src/shared/importer.ts';
import { canonicalizeUrl, detectProvider, parseDuration, youtubeId } from '../src/shared/media.ts';
import { relatedItems } from '../src/shared/query.ts';
import type {
  ContactMessage, ContentItem, ContentQuery, EventRecord, HomeSection, Institution, MediaSource, Menu, ModuleState, Page,
  PublicQuestion, QuestionStatus, QuestionSubmission, Series, SourceArchive, Topic,
} from '../src/shared/types.ts';
import type { ArchiveInput, EntityName, EntityRecord, ImportRow, ListOptions, MediaCatalogRow } from '../src/data/repo.ts';
import { ApiError, asOwner, withActor, type Row, type Sql } from './db.ts';
import { signMedia } from './media-sign.ts';

const JSON_COLS = new Set(['body', 'provenance', 'blocks', 'source_urls', 'answer_blocks', 'items', 'config', 'settings', 'toc', 'sample']);
const camel = (k: string) => k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
const snake = (k: string) => k.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
const fromRow = <T,>(r: Row): T => Object.fromEntries(Object.entries(r).map(([k, v]) => [camel(k), v])) as T;
const like = (s: string) => s.replace(/[%_\\]/g, ' ').trim();

const TABLE: Record<EntityName, string> = {
  content: 'content_items', topics: 'topics', series: 'series', pages: 'pages',
  institutions: 'institutions', events: 'events', publicQuestions: 'public_questions',
};
const WRITABLE: Record<EntityName, string[]> = {
  content: ['slug', 'type', 'title', 'summary', 'body', 'speaker', 'attribution_status', 'attribution_note', 'event_date', 'event_date_text', 'source_published_date', 'duration_seconds', 'duration_text', 'status', 'featured', 'verification', 'provenance', 'duplicate_group', 'catalog_order', 'publish_at'],
  topics: ['slug', 'name', 'description', 'sort', 'auto', 'status'],
  series: ['slug', 'title', 'description', 'kind', 'source_url', 'status', 'sort'],
  pages: ['slug', 'title', 'description', 'blocks', 'status', 'publish_at'],
  institutions: ['slug', 'name', 'description', 'source_urls', 'place_label', 'map_url', 'status', 'publish_at'],
  events: ['slug', 'institution_id', 'title', 'event_date', 'date_text', 'summary', 'source_urls', 'location_label', 'map_url', 'starts_at', 'ends_at', 'status', 'publish_at'],
  publicQuestions: ['slug', 'question_text', 'answer_blocks', 'answer_audio_url', 'topic_id', 'attribution', 'approved_by_rabbi', 'status', 'source_submission_id'],
};
const TITLE_COL: Record<EntityName, string> = {
  content: 'title', topics: 'name', series: 'title', pages: 'title', institutions: 'name', events: 'title', publicQuestions: 'question_text',
};
const SEARCH_COL: Record<EntityName, string> = {
  content: 'search_text', topics: 'name', series: 'title', pages: 'title', institutions: 'name', events: 'title', publicQuestions: 'question_text',
};

const BOOK_COLS = ['content_id', 'author_text', 'editor_text', 'publisher', 'authored_by_rabbi', 'cover_path', 'pdf_access', 'located_status', 'toc', 'sample', 'purchase_url', 'donation_url'];
const PUBLIC_READY = `(publish_at is null or publish_at <= now())`;

const CONTENT_SQL = `select c.*,
  coalesce((select jsonb_agg(to_jsonb(m) order by m.is_primary desc) from public.media_sources m where m.content_id = c.id), '[]'::jsonb) as sources,
  coalesce((select jsonb_agg(ct.topic_id) from public.content_topics ct where ct.content_id = c.id), '[]'::jsonb) as topic_ids,
  coalesce((select jsonb_agg(si.series_id) from public.series_items si where si.content_id = c.id), '[]'::jsonb) as series_ids,
  (select to_jsonb(b) from public.book_details b where b.content_id = c.id) as book_details
  from public.content_items c`;

function mapContent(row: Row): ContentItem {
  const sources = Array.isArray(row.sources) ? row.sources as Row[] : [];
  const book = row.book_details && typeof row.book_details === 'object' ? row.book_details as Row : null;
  const rest = { ...row };
  delete rest.sources; delete rest.topic_ids; delete rest.series_ids; delete rest.book_details;
  delete rest.search_text; delete rest.created_by; delete rest.updated_by;
  const item = fromRow<ContentItem>(rest);
  item.sources = sources.map((m) => fromRow<MediaSource>(m)).sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
  item.topicIds = Array.isArray(row.topic_ids) ? row.topic_ids as string[] : [];
  item.seriesIds = Array.isArray(row.series_ids) ? row.series_ids as string[] : [];
  item.bookDetails = book ? fromRow(book) : null;
  item.body = Array.isArray(item.body) ? item.body : [];
  item.provenance = Array.isArray(item.provenance) ? item.provenance : [];
  return item;
}

async function fetchContent(sql: Sql, ids: string[]): Promise<ContentItem[]> {
  if (!ids.length) return [];
  const rows = await sql(`${CONTENT_SQL} where c.id = any($1::uuid[])`, [ids]);
  const map = new Map(rows.map((r) => [String(r.id), mapContent(r)]));
  return ids.map((id) => map.get(id)).filter((c): c is ContentItem => !!c);
}

function blank(v: unknown): string | null {
  if (v === '' || v == null) return null;
  return String(v);
}

function vals(data: Record<string, unknown>, cols: string[]): { cols: string[]; params: unknown[]; casts: string[] } {
  const row = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined).map(([k, v]) => [snake(k), v]));
  const used = cols.filter((c) => c in row);
  return {
    cols: used,
    params: used.map((c) => (JSON_COLS.has(c) && row[c] != null ? JSON.stringify(row[c]) : row[c])),
    casts: used.map((c) => (JSON_COLS.has(c) ? '::jsonb' : '')),
  };
}

async function mustWrite(sql: Sql, text: string, params: unknown[], what: string): Promise<void> {
  const rows = await sql(text, params);
  if (!rows.length) throw new ApiError(403, `${what} נחסמה (הרשאה, או שהרשומה אינה קיימת).`, '42501');
}

async function staff(sql: Sql): Promise<void> {
  const rows = await sql(`select public.is_staff() as ok`);
  if (rows[0]?.ok !== true) throw new ApiError(403, 'הפעולה שמורה לצוות.', '42501');
}

function entityOf(v: unknown): EntityName {
  if (typeof v === 'string' && v in TABLE) return v as EntityName;
  throw new ApiError(400, 'ישות לא מוכרת');
}

async function getOne(sql: Sql, entity: EntityName, id: string): Promise<EntityRecord | null> {
  if (entity === 'content') return (await fetchContent(sql, [id]))[0] ?? null;
  if (entity === 'series') {
    const rows = await sql(`select * from public.series where id = $1`, [id]);
    const row = rows[0];
    if (!row) return null;
    const items = await sql(`select content_id from public.series_items where series_id = $1 order by position`, [id]);
    return { ...fromRow<Series>(row), items: items.map((i) => String(i.content_id)) };
  }
  const rows = await sql(`select * from public.${TABLE[entity]} where id = $1`, [id]);
  if (!rows[0]) return null;
  const rec = fromRow<EntityRecord>(rows[0]);
  if (entity !== 'publicQuestions') return rec;
  const tags = await sql(`select tag from public.public_question_tags where question_id = $1 order by tag`, [id]);
  return { ...rec, tags: tags.map((t) => String(t.tag)) };
}

function quiet(p: Promise<unknown>): void {
  void p.catch((e) => console.error('[notify] failed:', e instanceof Error ? e.message.slice(0, 120) : 'unknown'));
}

async function replaceTags(sql: Sql, id: string, tags: unknown): Promise<void> {
  const list = (Array.isArray(tags) ? tags : []).map((t) => String(t).trim()).filter((t) => t.length >= 1 && t.length <= 40).slice(0, 12);
  await sql(`delete from public.public_question_tags where question_id = $1`, [id]);
  for (const tag of list) await sql(`insert into public.public_question_tags (question_id, tag) values ($1, $2) on conflict do nothing`, [id, tag]);
}

export async function loadPrerender(sql: Sql) {
  const content = (await sql(`${CONTENT_SQL} where c.status = 'published' and c.deleted_at is null and (c.publish_at is null or c.publish_at <= now())`)).map(mapContent);
  const topics = (await sql(`select * from public.topics where status = 'published' and deleted_at is null order by sort`)).map((r) => fromRow<Topic>(r));
  const series = (await sql(`select s.*, coalesce((select jsonb_agg(si.content_id order by si.position) from public.series_items si where si.series_id = s.id), '[]'::jsonb) as items
    from public.series s where s.status = 'published' and s.deleted_at is null order by s.sort`)).map((r) => ({ ...fromRow<Series>(r), items: Array.isArray(r.items) ? r.items as string[] : [] }));
  const pages = (await sql(`select * from public.pages where status = 'published' and deleted_at is null and ${PUBLIC_READY}`)).map((r) => fromRow<Page>(r));
  const institutions = (await sql(`select * from public.institutions where status = 'published' and deleted_at is null and ${PUBLIC_READY}`)).map((r) => fromRow<Institution>(r));
  const events = (await sql(`select * from public.events where status = 'published' and deleted_at is null and ${PUBLIC_READY}`)).map((r) => fromRow<EventRecord>(r));
  const questions = (await sql(`select * from public.public_questions where status = 'published' and deleted_at is null and hidden = false order by published_at desc nulls last`)).map((r) => publicPq(r));
  return { content, topics, series, pages, questions, institutions, events };
}

async function run(userId: string | null, op: string, a: Record<string, unknown>, secret: string): Promise<unknown> {
  const admin = op.startsWith('admin.');
  if (admin && !userId) throw new ApiError(401, 'נדרשת כניסה');
  return withActor(userId, async (sql) => {
    if (admin) await staff(sql);
    switch (op) {
      case 'content.list': {
        const q = (a.q ?? {}) as ContentQuery;
        const page = Math.max(1, Number(q.page ?? 1));
        const pageSize = Math.min(100, Math.max(1, Number(q.pageSize ?? 24)));
        const rows = await sql(
          `select id, total from public.search_content($1, $2::public.content_type, $3, $4, $5::public.media_provider, $6, $7, $8)`,
          [q.q ?? '', blank(q.type), blank(q.topic), blank(q.series), blank(q.provider), q.sort ?? 'newest', pageSize, (page - 1) * pageSize],
        );
        return { items: await fetchContent(sql, rows.map((r) => String(r.id))), total: Number(rows[0]?.total ?? 0), page, pageSize };
      }
      case 'site.search': {
        const q = String(a.q ?? '').slice(0, 80);
        const rows = await sql(`select kind, id, title, href, label, score from public.search_site($1, 12)`, [q]);
        return rows.map((r) => ({
          kind: String(r.kind),
          id: String(r.id),
          title: String(r.title),
          href: String(r.href),
          label: String(r.label),
          score: Number(r.score),
          fuzzy: Number(r.score) < 5,
        }));
      }
      case 'content.get': {
        const rows = await sql(`select id from public.content_items where slug = $1`, [a.slug]);
        return rows[0] ? (await fetchContent(sql, [String(rows[0].id)]))[0] ?? null : null;
      }
      case 'content.byIds':
        return fetchContent(sql, Array.isArray(a.ids) ? a.ids.map(String) : []);
      case 'content.related': {
        const item = a.item as ContentItem;
        const limit = Number(a.limit ?? 6);
        const ids = new Set<string>();
        if (item.topicIds?.length) for (const r of await sql(`select content_id from public.content_topics where topic_id = any($1::uuid[]) limit 80`, [item.topicIds])) ids.add(String(r.content_id));
        if (item.seriesIds?.length) for (const r of await sql(`select content_id from public.series_items where series_id = any($1::uuid[]) limit 80`, [item.seriesIds])) ids.add(String(r.content_id));
        if (item.duplicateGroup) for (const r of await sql(`select id from public.content_items where duplicate_group = $1 limit 10`, [item.duplicateGroup])) ids.add(String(r.id));
        return relatedItems(await fetchContent(sql, [...ids].slice(0, 120)), item, limit);
      }
      case 'topics.list':
        return (await sql(`select * from public.topics where deleted_at is null and status = 'published' order by sort`)).map((r) => fromRow<Topic>(r));
      case 'series.list':
        return (await sql(`select s.*, coalesce((select jsonb_agg(jsonb_build_object('id', si.content_id, 'position', si.position) order by si.position) from public.series_items si where si.series_id = s.id), '[]'::jsonb) as items
          from public.series s where s.status = 'published' and s.deleted_at is null order by s.sort`)).map((r) => ({
          ...fromRow<Series>(r),
          items: (Array.isArray(r.items) ? r.items as { id: string }[] : []).map((x) => x.id),
        }));
      case 'series.get': {
        const all = (await run(userId, 'series.list', {}, secret)) as Series[];
        const series = all.find((s) => s.slug === a.slug);
        return series ? { series, items: await fetchContent(sql, series.items) } : null;
      }
      case 'institutions.list':
        return (await sql(`select * from public.institutions where status = 'published' and deleted_at is null and ${PUBLIC_READY}`)).map((r) => fromRow<Institution>(r));
      case 'events.list':
        return (await sql(`select * from public.events where status = 'published' and deleted_at is null and ${PUBLIC_READY} order by event_date nulls last, title`)).map((r) => fromRow<EventRecord>(r));
      case 'archives.list':
        return (await sql(`select * from public.source_archives`)).map((r) => fromRow<SourceArchive>(r));
      case 'page.get': {
        const rows = await sql(`select * from public.pages where slug = $1 and deleted_at is null`, [a.slug]);
        return rows[0] ? fromRow<Page>(rows[0]) : null;
      }
      case 'menus':
        return (await sql(`select * from public.menus`)).map((r) => fromRow<Menu>(r));
      case 'home':
        return (await sql(`select * from public.homepage_sections order by position`)).map((r) => fromRow<HomeSection>(r));
      case 'modules':
        return (await sql(`select * from public.modules`)).map((r) => fromRow<ModuleState>(r));
      case 'pq.list':
      case 'pq.search': {
        const page = Math.max(1, Number(a.page ?? 1));
        const pageSize = Math.min(50, Math.max(1, Number(a.pageSize ?? (op === 'pq.list' ? 100 : 20))));
        const rows = await sql(
          `select id, total from public.search_public_questions($1, $2, $3, $4, $5)`,
          [String(a.q ?? ''), blank(a.topic), blank(a.category), pageSize, (page - 1) * pageSize],
        );
        const ids = rows.map((r) => String(r.id));
        if (!ids.length) return op === 'pq.list' ? [] : { items: [], total: 0, page, pageSize };
        const full = await sql(`select * from public.public_questions where id = any($1::uuid[]) and status = 'published' and deleted_at is null and hidden = false`, [ids]);
        const map = new Map<string, PublicQuestion>();
        for (const r of full) map.set(String(r.id), await withTags(sql, publicPq(r)));
        const items = ids.map((id) => map.get(id)).filter((x): x is PublicQuestion => !!x);
        if (op === 'pq.list') return items;
        return { items, total: Number(rows[0]?.total ?? 0), page, pageSize };
      }
      case 'pq.suggest': {
        const q = like(String(a.q ?? ''));
        if (q.length < 2) return [];
        const rows = await sql(
          `select slug, question_text from public.public_questions
           where status = 'published' and deleted_at is null and hidden = false
             and search_text like '%' || public.he_normalize($1) || '%'
           order by published_at desc nulls last limit 5`,
          [q],
        );
        return rows.map((r) => ({ slug: String(r.slug), questionText: String(r.question_text) }));
      }
      case 'pq.categories':
        return (await sql(`select id, slug, name, sort from public.halacha_categories order by sort`)).map((r) => fromRow(r));
      case 'pq.eta': {
        const rows = await sql(`select value from public.site_settings where key = 'public.responsa_eta_days'`);
        const raw = rows[0]?.value;
        const days = typeof raw === 'number' ? raw : Number(raw ?? 14);
        return Number.isFinite(days) ? days : 14;
      }
      case 'pq.get': {
        const rows = await sql(
          `select * from public.public_questions where slug = $1 and status = 'published' and deleted_at is null and hidden = false`,
          [a.slug],
        );
        if (!rows[0]) return null;
        const question = await withTags(sql, publicPq(rows[0]));
        const related = question.topicId
          ? (await sql(
            `select * from public.public_questions
             where status = 'published' and deleted_at is null and hidden = false and topic_id = $1 and id <> $2
             order by published_at desc nulls last limit 4`,
            [question.topicId, question.id],
          )).map((r) => publicPq(r))
          : [];
        return { ...question, related };
      }
      case 'pq.week':
        return (await sql(
          `select * from public.public_questions
           where status = 'published' and deleted_at is null and hidden = false and week_pick = true
           order by published_at desc nulls last limit 1`,
        )).map((r) => publicPq(r));
      case 'track': {
        const rows = await sql(`select * from public.track_question($1, $2)`, [a.code, a.token]);
        return rows[0] ? fromRow(rows[0]) : null;
      }
      case 'admin.list': {
        const entity = entityOf(a.entity);
        const opts = (a.opts ?? {}) as ListOptions;
        const page = Math.max(1, Number(opts.page ?? 1));
        const pageSize = Math.min(100, Math.max(1, Number(opts.pageSize ?? 25)));
        const params: unknown[] = [opts.view === 'trash'];
        const where = [`(($1::bool and deleted_at is not null) or (not $1::bool and deleted_at is null))`];
        if (opts.status) { params.push(opts.status); where.push(`status = $${params.length}`); }
        if (opts.type && entity === 'content') { params.push(opts.type); where.push(`type = $${params.length}`); }
        if (opts.scheduled && (entity === 'content' || entity === 'pages' || entity === 'institutions' || entity === 'events')) {
          where.push(`publish_at is not null and publish_at > now()`);
        }
        if (opts.q?.trim()) { params.push(like(opts.q)); where.push(`${SEARCH_COL[entity]} ilike '%' || $${params.length} || '%'`); }
        const sort = opts.sort ?? 'updated';
        const order = sort === 'title' ? `${TITLE_COL[entity]} asc` : sort === 'status' ? `status asc, updated_at desc` : `updated_at desc`;
        params.push(pageSize, (page - 1) * pageSize);
        const rows = await sql(`select id, count(*) over () as total from public.${TABLE[entity]} where ${where.join(' and ')} order by ${order} limit $${params.length - 1} offset $${params.length}`, params);
        const ids = rows.map((r) => String(r.id));
        const items = entity === 'content' ? await fetchContent(sql, ids) : (await Promise.all(ids.map((id) => getOne(sql, entity, id)))).filter((x): x is EntityRecord => !!x);
        return { items, total: Number(rows[0]?.total ?? 0), page, pageSize };
      }
      case 'admin.get':
        return getOne(sql, entityOf(a.entity), String(a.id));
      case 'admin.create': {
        const entity = entityOf(a.entity);
        const d = { ...(a.data as Record<string, unknown>) };
        if (!d.slug) d.slug = `${slugify(String(d.title ?? d.name ?? d.questionText ?? 'item'))}-${crypto.randomUUID().slice(0, entity === 'content' ? 6 : 4)}`;
        if (entity === 'content') {
          d.durationSeconds ??= parseDuration((d.durationText as string | null) ?? null);
          d.catalogOrder ??= -Math.floor(Date.now() / 1000);
        }
        const built = vals(d, WRITABLE[entity].filter((c) => c !== 'status' || d.status != null));
        if (!built.cols.length) throw new ApiError(400, 'אין נתונים לשמירה');
        const placeholders = built.cols.map((c, i) => `$${i + 1}${built.casts[i]}`).join(', ');
        const rows = await sql(`insert into public.${TABLE[entity]} (${built.cols.join(', ')}) values (${placeholders}) returning id`, built.params);
        const id = String(rows[0]?.id ?? '');
        if (!id) throw new ApiError(403, 'היצירה נחסמה.', '42501');
        if (entity === 'content') {
          const c = a.data as Partial<ContentItem>;
          if (c.topicIds?.length) await sql(`insert into public.content_topics (content_id, topic_id) select $1, x from unnest($2::uuid[]) x`, [id, c.topicIds]);
          if (c.bookDetails) {
            const b = vals({ ...c.bookDetails, contentId: id }, BOOK_COLS);
            await sql(`insert into public.book_details (${b.cols.join(', ')}) values (${b.cols.map((_, i) => `$${i + 1}${b.casts[i]}`).join(', ')})`, b.params);
          }
        }
        return getOne(sql, entity, id);
      }
      case 'admin.update': {
        const entity = entityOf(a.entity);
        if (typeof a.reason === 'string') await sql(`select set_config('app.audit_reason', $1, true)`, [String(a.reason).slice(0, 200)]);
        const patch = { ...(a.patch as Record<string, unknown>) };
        delete patch.status; delete patch.deletedAt;
        if (entity === 'content' && 'durationText' in patch) patch.durationSeconds = parseDuration(patch.durationText as string | null);
        const built = vals(patch, WRITABLE[entity].filter((c) => c !== 'status'));
        const sets = built.cols.map((c, i) => `${c} = $${i + 1}${built.casts[i]}`);
        const params = [...built.params, a.expectedVersion, a.id];
        const versionAt = built.cols.length + 1;
        await mustWrite(sql, `update public.${TABLE[entity]} set ${sets.length ? sets.join(', ') + ',' : ''} version = $${versionAt} where id = $${versionAt + 1} returning id`, params, 'השמירה');
        if (entity === 'content') {
          const c = a.patch as Partial<ContentItem>;
          if (c.topicIds) {
            await sql(`delete from public.content_topics where content_id = $1`, [a.id]);
            if (c.topicIds.length) await sql(`insert into public.content_topics (content_id, topic_id) select $1, x from unnest($2::uuid[]) x`, [a.id, c.topicIds]);
          }
          if (c.bookDetails !== undefined) {
            if (c.bookDetails) {
              const b = vals({ ...c.bookDetails, contentId: a.id }, BOOK_COLS);
              const upd = b.cols.filter((c) => c !== 'content_id').map((c) => `${c} = excluded.${c}`).join(', ');
              await sql(`insert into public.book_details (${b.cols.join(', ')}) values (${b.cols.map((_, i) => `$${i + 1}${b.casts[i]}`).join(', ')}) on conflict (content_id) do update set ${upd}`, b.params);
            } else await sql(`delete from public.book_details where content_id = $1`, [a.id]);
          }
        }
        if (entity === 'publicQuestions' && Array.isArray((a.patch as { tags?: unknown }).tags)) {
          await replaceTags(sql, String(a.id), (a.patch as { tags: unknown }).tags);
        }
        return getOne(sql, entity, String(a.id));
      }
      case 'admin.transition': {
        const entity = entityOf(a.entity);
        if (typeof a.reason === 'string') await sql(`select set_config('app.audit_reason', $1, true)`, [String(a.reason).slice(0, 200)]);
        await mustWrite(sql, `update public.${TABLE[entity]} set status = $1, version = $2 where id = $3 returning id`, [a.to, a.expectedVersion, a.id], 'המעבר');
        return getOne(sql, entity, String(a.id));
      }
      case 'admin.softDelete':
        await mustWrite(sql, `update public.${TABLE[entityOf(a.entity)]} set deleted_at = now(), version = $1 where id = $2 returning id`, [a.expectedVersion, a.id], 'ההעברה לסל');
        return null;
      case 'admin.restore':
        await mustWrite(sql, `update public.${TABLE[entityOf(a.entity)]} set deleted_at = null, version = $1 where id = $2 returning id`, [a.expectedVersion, a.id], 'השחזור');
        return null;
      case 'admin.destroy':
        await mustWrite(sql, `delete from public.${TABLE[entityOf(a.entity)]} where id = $1 returning id`, [a.id], 'המחיקה');
        return null;
      case 'admin.revisions': {
        const rows = await sql(`select version, created_at, created_by, snapshot from public.revisions where entity = $1 and entity_id = $2 order by version desc limit 50`, [TABLE[entityOf(a.entity)], a.id]);
        return rows.map((r) => ({ version: r.version, createdAt: r.created_at, createdBy: r.created_by, snapshot: r.snapshot }));
      }
      case 'admin.audit': {
        const page = Math.max(1, Number(a.page ?? 1));
        const opts = (a.opts ?? {}) as { q?: string; entity?: string };
        const q = like(String(opts.q ?? ''));
        const entity = String(opts.entity ?? '');
        const rows = await sql(
          `select *, count(*) over () as total from public.audit_log
           where ($1 = '' or action ilike '%' || $1 || '%' or entity ilike '%' || $1 || '%' or coalesce(meta::text, '') ilike '%' || $1 || '%')
             and ($2 = '' or entity = $2)
           order by created_at desc limit 50 offset $3`,
          [q, entity, (page - 1) * 50],
        );
        return { items: rows.map((r) => ({ ...fromRow<{ id: unknown }>(r), id: String(r.id) })), total: Number(rows[0]?.total ?? 0), page, pageSize: 50 };
      }
      case 'admin.listMedia': {
        const opts = a.opts as { q?: string; kind?: string; provider?: string; page?: number; pageSize?: number; sort?: string };
        const page = Math.max(1, Number(opts.page ?? 1));
        const pageSize = Math.min(100, Number(opts.pageSize ?? 25));
        const rows = await sql(
          `select m.id, m.content_id, m.provider, m.provider_id, m.kind, m.url, m.rights_status, c.title, c.slug, count(*) over () as total
           from public.media_sources m join public.content_items c on c.id = m.content_id
           where ($1 = '' or m.kind = $1) and ($2 = '' or m.provider::text = $2)
             and ($3 = '' or m.url ilike '%' || $3 || '%' or coalesce(m.provider_id, '') ilike '%' || $3 || '%')
           order by case when $4 = 'provider' then m.provider::text else m.url end
           limit $5 offset $6`,
          [opts.kind ?? '', opts.provider ?? '', like(opts.q ?? ''), opts.sort === 'provider' ? 'provider' : 'url', pageSize, (page - 1) * pageSize],
        );
        const items: MediaCatalogRow[] = rows.map((r) => ({
          id: String(r.id), contentId: String(r.content_id), contentTitle: String(r.title ?? ''), contentSlug: String(r.slug ?? ''),
          provider: String(r.provider), providerId: r.provider_id ? String(r.provider_id) : null, kind: String(r.kind), url: String(r.url), rightsStatus: String(r.rights_status),
        }));
        return { items, total: Number(rows[0]?.total ?? 0), page, pageSize };
      }
      case 'admin.removeMedia': {
        const rows = await sql(`select * from public.media_sources where content_id = $1`, [a.contentId]);
        const sources = rows.map((r) => fromRow<MediaSource>(r));
        if (!sources.some((s) => s.id === a.sourceId)) throw new ApiError(404, 'המקור לא נמצא');
        await saveSources(sql, String(a.contentId), sources.filter((s) => s.id !== a.sourceId));
        return null;
      }
      case 'admin.listArchives': {
        const opts = a.opts as { q?: string; verification?: string; page?: number; pageSize?: number; sort?: string };
        const page = Math.max(1, Number(opts.page ?? 1));
        const pageSize = Math.min(100, Number(opts.pageSize ?? 25));
        const rows = await sql(
          `select *, count(*) over () as total from public.source_archives
           where ($1 = '' or verification = $1) and ($2 = '' or name ilike '%' || $2 || '%' or url ilike '%' || $2 || '%' or coalesce(material,'') ilike '%' || $2 || '%')
           order by case when $3 = 'verification' then verification else name end
           limit $4 offset $5`,
          [opts.verification ?? '', like(opts.q ?? ''), opts.sort === 'verification' ? 'verification' : 'name', pageSize, (page - 1) * pageSize],
        );
        return { items: rows.map((r) => fromRow<SourceArchive>(r)), total: Number(rows[0]?.total ?? 0), page, pageSize };
      }
      case 'admin.createArchive':
        return writeArchive(sql, null, a.data as ArchiveInput);
      case 'admin.updateArchive':
        return writeArchive(sql, String(a.id), a.patch as Partial<ArchiveInput>);
      case 'admin.deleteArchive':
        await mustWrite(sql, `delete from public.source_archives where id = $1 returning id`, [a.id], 'מחיקת הארכיון');
        return null;
      case 'admin.saveSources':
        await saveSources(sql, String(a.contentId), a.sources as MediaSource[]);
        return null;
      case 'admin.setSeriesItems': {
        await sql(`delete from public.series_items where series_id = $1`, [a.seriesId]);
        const ids = (a.contentIds as string[]) ?? [];
        if (ids.length) await sql(`insert into public.series_items (series_id, content_id, position) select $1, x, ordinality - 1 from unnest($2::uuid[]) with ordinality as t(x, ordinality)`, [a.seriesId, ids]);
        return null;
      }
      case 'admin.saveMenu': {
        const menu = a.menu as Menu;
        const rows = await sql(`update public.menus set items = $1::jsonb, version = $2 where id = $3 returning *`, [JSON.stringify(menu.items), menu.version, menu.id]);
        if (!rows[0]) throw new ApiError(403, 'שמירת התפריט נחסמה.', '42501');
        return fromRow<Menu>(rows[0]);
      }
      case 'admin.saveHome': {
        const sections = a.sections as HomeSection[];
        for (const [i, s] of sections.entries()) {
          await mustWrite(sql, `update public.homepage_sections set title = $1, enabled = $2, position = $3, config = $4::jsonb, version = $5 where id = $6 returning id`, [s.title, s.enabled, i, JSON.stringify(s.config), s.version, s.id], 'שמירת דף הבית');
        }
        return (await sql(`select * from public.homepage_sections order by position`)).map((r) => fromRow<HomeSection>(r));
      }
      case 'admin.setModule':
        await mustWrite(sql, `update public.modules set enabled = $1, settings = $2::jsonb, updated_at = now() where id = $3 returning id`, [a.enabled, JSON.stringify(a.settings ?? {}), a.id], 'עדכון המודול');
        return null;
      case 'admin.questions': {
        const opts = a.opts as { status?: string; page?: number; q?: string; sort?: string };
        const page = Math.max(1, Number(opts.page ?? 1));
        const order = opts.sort === 'status' ? 'status asc, created_at desc'
          : opts.sort === 'code' ? 'tracking_code asc'
          : opts.sort === 'oldest' ? 'created_at asc'
          : opts.sort === 'priority' ? 'priority desc, created_at asc'
          : 'created_at desc';
        const rows = await sql(
          `select *, count(*) over () as total from public.question_submissions
           where ($1 = '' or status::text = $1) and ($2 = '' or question_text ilike '%' || $2 || '%' or tracking_code ilike '%' || $2 || '%')
           order by ${order} limit 25 offset $3`,
          [opts.status ?? '', like(opts.q ?? ''), (page - 1) * 25],
        );
        return { items: rows.map(questionRow), total: Number(rows[0]?.total ?? 0), page, pageSize: 25 };
      }
      case 'admin.question': {
        const rows = await sql(`select * from public.question_submissions where id = $1`, [a.id]);
        return rows[0] ? questionRow(rows[0]) : null;
      }
      case 'admin.updateQuestion': {
        const patch = (a.patch ?? {}) as Record<string, unknown>;
        const cur = await sql(`select status, answer_text, answer_audio_path from public.question_submissions where id = $1`, [a.id]);
        const status = String(cur[0]?.status ?? '');
        const answerTouched = ('answerText' in patch && patch.answerText !== cur[0]?.answer_text) || ('answerAudioPath' in patch && patch.answerAudioPath !== cur[0]?.answer_audio_path);
        if (answerTouched && ['published', 'private_delivered', 'closed'].includes(status)) {
          throw new ApiError(403, 'התשובה נעולה לאחר שנמסרה. אי אפשר לשנות אותה בלי להסיר את הפרסום.', '42501');
        }
        const rows = await sql(
          `update public.question_submissions set
             answer_text = case when $3::bool then $4 else answer_text end,
             answer_audio_path = case when $5::bool then $6 else answer_audio_path end,
             assigned_to = case when $7::bool then $8::uuid else assigned_to end,
             topic_id = case when $9::bool then $10::uuid else topic_id end,
             priority = case when $11::bool then $12::smallint else priority end,
             due_at = case when $13::bool then $14::timestamptz else due_at end,
             answer_sources = case when $15::bool then $16 else answer_sources end,
             answer_kind = case when $17::bool then $18 else answer_kind end,
             version = $2
           where id = $1 returning *`,
          [a.id, a.expectedVersion, 'answerText' in patch, patch.answerText ?? null, 'answerAudioPath' in patch, patch.answerAudioPath ?? null, 'assignedTo' in patch, patch.assignedTo || null, 'topicId' in patch, patch.topicId || null, 'priority' in patch, Number(patch.priority ?? 1), 'dueAt' in patch, patch.dueAt || null, 'answerSources' in patch, patch.answerSources ?? null, 'answerKind' in patch, patch.answerKind ?? 'written'],
        );
        if (!rows[0]) throw new ApiError(403, 'שמירת השאלה נחסמה.', '42501');
        return questionRow(rows[0]);
      }
      case 'admin.transitionQuestion': {
        const reason = String(a.reason ?? '').trim().slice(0, 200);
        const cur = await sql(`select status, contact_email, tracking_code from public.question_submissions where id = $1`, [a.id]);
        if (!cur[0]) throw new ApiError(404, 'השאלה לא נמצאה');
        const from = String(cur[0].status);
        if (questionTransitionNeedsReason(from as QuestionStatus, a.to as QuestionStatus) && !reason) {
          throw new ApiError(422, 'נדרשת סיבה ליומן עבור המעבר הזה.');
        }
        await sql(`select set_config('app.audit_reason', $1, true)`, [reason]);
        let notifyHash: string | null = null;
        let notifyToken = '';
        const delivering = a.to === 'private_delivered' || a.to === 'published';
        if (delivering && cur[0].contact_email) {
          notifyToken = newToken();
          notifyHash = await sha256Hex(notifyToken);
        }
        const rows = await sql(
          `update public.question_submissions set status = $1, version = $2,
             notify_token_hash = case when $4::bool then $5 else notify_token_hash end
           where id = $3 returning *`,
          [a.to, a.expectedVersion, a.id, notifyHash !== null, notifyHash],
        );
        if (!rows[0]) throw new ApiError(403, 'המעבר נחסם.', '42501');
        const saved = questionRow(rows[0]);
        if (a.to === 'answered') {
          quiet(notifyStaff('תשובה ממתינה לאישור הרב', `מספר מעקב: ${saved.trackingCode}\n${process.env.VITE_SITE_URL ?? ''}/admin/questions/${saved.id}`));
        }
        if (notifyToken && saved.contactEmail) quiet(notifyAnswerReady(saved.contactEmail, saved.trackingCode, notifyToken));
        return saved;
      }
      case 'admin.publishQuestion': {
        const p = a.pub as { questionText: string; topicId?: string | null; attribution: string; categoryId?: string | null; answerKind?: string };
        const found = await sql(`select * from public.question_submissions where id = $1`, [a.id]);
        if (!found[0]) throw new ApiError(404, 'השאלה לא נמצאה');
        const sub = questionRow(found[0]);
        let built: ReturnType<typeof buildPublicFromApproved>;
        try { built = buildPublicFromApproved(sub, String(p.questionText ?? '')); }
        catch (e) { throw new ApiError(403, (e as Error).message, '42501'); }
        const audioUrl = await copyApprovedAudio(sub.answerAudioPath);
        const slug = `${slugify(p.questionText).slice(0, 40)}-${crypto.randomUUID().slice(0, 4)}`;
        const created = await sql(
          `insert into public.public_questions (slug, question_text, answer_blocks, answer_audio_url, topic_id, attribution, approved_by_rabbi, status, source_submission_id, sources, answer_kind, category_id)
           values ($1, $2, $3::jsonb, $4, $5, $6, $7, 'in_review', $8, $9, $10, $11) returning id, version`,
          [slug, p.questionText, JSON.stringify(built.blocks), audioUrl, p.topicId || null, p.attribution, built.approvedByRabbi, a.id, sub.answerSources ?? null, p.answerKind || sub.answerKind || 'written', p.categoryId || null],
        );
        const pq = created[0];
        if (!pq) throw new ApiError(403, 'יצירת השו״ת נחסמה.', '42501');
        if (!built.approvedByRabbi) {
          // Link the pending public entry so staff can find it from the submission.
          await mustWrite(sql, `update public.question_submissions set public_question_id = $1, version = $2 where id = $3 returning id`, [pq.id, a.expectedVersion, a.id], 'עדכון השאלה');
          return { published: false, needsReapproval: true, id: String(pq.id) };
        }
        await mustWrite(sql, `update public.public_questions set status = 'approved', version = $2 where id = $1 returning id`, [pq.id, pq.version], 'אישור השו״ת');
        await mustWrite(sql, `update public.public_questions set status = 'published', published_at = coalesce(published_at, now()), version = $2 where id = $1 returning id`, [pq.id, Number(pq.version) + 1], 'פרסום השו״ת');
        const reason = '';
        await sql(`select set_config('app.audit_reason', $1, true)`, [reason]);
        let notifyToken = '';
        let notifyHash: string | null = null;
        if (sub.contactEmail) { notifyToken = newToken(); notifyHash = await sha256Hex(notifyToken); }
        await mustWrite(sql, `update public.question_submissions set status = 'published', public_question_id = $1, version = $2, notify_token_hash = coalesce($4, notify_token_hash) where id = $3 returning id`, [pq.id, a.expectedVersion, a.id, notifyHash], 'עדכון השאלה');
        if (notifyToken && sub.contactEmail) quiet(notifyAnswerReady(sub.contactEmail, sub.trackingCode, notifyToken));
        return { published: true, needsReapproval: false, id: String(pq.id) };
      }
      case 'admin.unpublishPublic': {
        const reason = String(a.reason ?? '').trim().slice(0, 200);
        if (!reason) throw new ApiError(422, 'נדרשת סיבה ליומן כדי להסיר פרסום.');
        await sql(`select set_config('app.audit_reason', $1, true)`, [reason]);
        if (a.mode === 'hidden') {
          await mustWrite(sql, `update public.public_questions set hidden = true, version = $2 where id = $1 returning id`, [a.id, a.expectedVersion], 'הסתרת השו״ת');
        } else {
          await mustWrite(sql, `update public.public_questions set status = 'draft', version = $2 where id = $1 returning id`, [a.id, a.expectedVersion], 'הסרת פרסום');
        }
        return null;
      }
      case 'admin.questionStats': {
        const rows = await sql(`
          select
            count(*) filter (where status = 'answered')::int as pending_rabbi,
            count(*) filter (where status not in ('published','private_delivered','closed'))::int as open,
            count(*) filter (where due_at is not null and due_at < now() and status not in ('published','private_delivered','closed'))::int as overdue,
            avg(extract(epoch from (coalesce(answered_at, approved_at) - created_at)) / 86400.0) filter (where answered_at is not null or approved_at is not null) as avg_days
          from public.question_submissions`);
        const byTopic = await sql(`
          select topic_id, count(*)::int as count from public.question_submissions
          group by topic_id order by count desc`);
        const s = rows[0] ?? {};
        return {
          pendingRabbi: Number(s.pending_rabbi ?? 0),
          open: Number(s.open ?? 0),
          overdue: Number(s.overdue ?? 0),
          avgResponseDays: s.avg_days == null ? null : Math.round(Number(s.avg_days) * 10) / 10,
          byTopic: byTopic.map((r) => ({ topicId: r.topic_id ? String(r.topic_id) : null, count: Number(r.count) })),
        };
      }
      case 'admin.staff': {
        await staff(sql);
        const people = await asOwner((q) => q(
          `select distinct u.id, u.display_name from public.app_users u
           join public.user_roles r on r.user_id = u.id
           where r.role in ('owner','admin','editor','reviewer','rabbi')
           order by u.display_name nulls last`,
        ));
        return people.map((r) => ({ id: String(r.id), displayName: r.display_name ? String(r.display_name) : 'איש צוות' }));
      }
      case 'admin.templates':
        return (await sql(`select * from public.answer_templates order by title`)).map((r) => fromRow(r));
      case 'admin.saveTemplate': {
        const title = String(a.title ?? '').trim();
        const body = String(a.body ?? '').trim();
        if (!title || !body) throw new ApiError(422, 'לתבנית נדרשים כותרת ונוסח.');
        if (a.id) {
          const rows = await sql(`update public.answer_templates set title = $1, body = $2, updated_at = now() where id = $3 returning *`, [title, body, a.id]);
          if (!rows[0]) throw new ApiError(403, 'שמירת התבנית נחסמה.', '42501');
          return fromRow(rows[0]);
        }
        const rows = await sql(`insert into public.answer_templates (title, body, created_by) values ($1, $2, public.app_uid()) returning *`, [title, body]);
        if (!rows[0]) throw new ApiError(403, 'שמירת התבנית נחסמה.', '42501');
        return fromRow(rows[0]);
      }
      case 'admin.deleteTemplate':
        await mustWrite(sql, `delete from public.answer_templates where id = $1 returning id`, [a.id], 'מחיקת התבנית');
        return null;
      case 'admin.setEta': {
        const days = Math.min(90, Math.max(1, Number(a.days ?? 14)));
        await mustWrite(sql, `insert into public.site_settings (key, value) values ('public.responsa_eta_days', to_jsonb($1::int)) on conflict (key) do update set value = excluded.value, updated_at = now() returning key`, [days], 'עדכון זמן המענה');
        return days;
      }
      case 'admin.users': {
        if ((await sql(`select public.is_admin() as ok`))[0]?.ok !== true) throw new ApiError(403, 'ניהול משתמשים למנהלים בלבד.', '42501');
        const rows = await asOwner((q) => q(
          `select u.id, u.email, u.display_name, coalesce(jsonb_agg(r.role) filter (where r.role is not null), '[]'::jsonb) as roles
           from public.app_users u left join public.user_roles r on r.user_id = u.id
           group by u.id order by u.email`,
        ));
        return rows.map((u) => ({ userId: String(u.id), email: String(u.email ?? ''), displayName: u.display_name ? String(u.display_name) : null, roles: u.roles }));
      }
      case 'admin.setRole': {
        if (a.grant) await sql(`insert into public.user_roles (user_id, role) values ($1, $2::public.app_role)`, [a.userId, a.role]);
        else await mustWrite(sql, `delete from public.user_roles where user_id = $1 and role = $2::public.app_role returning user_id`, [a.userId, a.role], 'עדכון התפקיד');
        return null;
      }
      case 'admin.previewImport': {
        const rows = await sql(`select content_id, provider, provider_id, canonical_url, url from public.media_sources limit 10000`);
        const by = new Map<string, MediaSource[]>();
        for (const r of rows) {
          const id = String(r.content_id);
          const list = by.get(id) ?? [];
          list.push(fromRow<MediaSource>(r));
          by.set(id, list);
        }
        return previewRows((a.rows as ImportRow[]) ?? [], [...by].map(([id, sources]) => ({ id, sources })));
      }
      case 'admin.commitImport': {
        const preview = (await run(userId, 'admin.previewImport', { rows: a.rows }, secret)) as { action: string; row: ImportRow }[];
        let created = 0;
        for (const p of preview) {
          if (p.action !== 'create') continue;
          const rec = (await run(userId, 'admin.create', { entity: 'content', data: { title: p.row.title, type: p.row.type, summary: p.row.summary ?? null, speaker: p.row.speaker ?? null, durationText: p.row.durationText ?? null, provenance: [{ section: 'import', note: 'יובא ב-CMS' }], status: 'draft' } }, secret)) as ContentItem;
          const yt = youtubeId(p.row.url);
          await saveSources(sql, rec.id, [{
            id: crypto.randomUUID(), contentId: rec.id, provider: detectProvider(p.row.url), providerId: yt, url: p.row.url, canonicalUrl: canonicalizeUrl(p.row.url),
            deliveryMode: yt ? 'embed' : 'link', kind: 'media', mime: null, filesize: null, durationSeconds: null, checksum: null,
            rightsStatus: yt ? 'embed_only' : 'unverified', rightsEvidence: null, embedStatus: 'unchecked', lastCheckedAt: null, error: null,
            isPrimary: true, storageBucket: null, storagePath: null,
          }]);
          created++;
        }
        return { created, skipped: preview.length - created };
      }
      case 'admin.export': {
        const out: Record<string, unknown> = { exportedAt: new Date().toISOString(), mode: 'api' };
        for (const t of ['content_items', 'media_sources', 'book_details', 'topics', 'content_topics', 'series', 'series_items', 'pages', 'menus', 'homepage_sections', 'institutions', 'events', 'public_questions', 'modules', 'source_archives']) {
          out[t] = await sql(`select * from public.${t} limit 10000`);
        }
        return out;
      }
      case 'admin.contacts': {
        const page = Math.max(1, Number(a.page ?? 1));
        const pageSize = Math.min(50, Math.max(1, Number(a.pageSize ?? 25)));
        const params: unknown[] = [];
        const where = ['true'];
        if (typeof a.status === 'string' && a.status) { params.push(a.status); where.push(`status = $${params.length}`); }
        if (typeof a.q === 'string' && a.q.trim()) { params.push(a.q.trim().replace(/[%_\\]/g, ' ')); where.push(`(subject ilike '%' || $${params.length} || '%' or email ilike '%' || $${params.length} || '%' or coalesce(name,'') ilike '%' || $${params.length} || '%')`); }
        params.push(pageSize, (page - 1) * pageSize);
        const rows = await sql(`select *, count(*) over () as total from public.contact_messages where ${where.join(' and ')} order by created_at desc limit $${params.length - 1} offset $${params.length}`, params);
        return {
          items: rows.map((r) => { const copy = { ...r }; delete copy.total; return fromRow<ContactMessage>(copy); }),
          total: Number(rows[0]?.total ?? 0), page, pageSize,
        };
      }
      case 'admin.contactStatus': {
        const status = String(a.status ?? '');
        if (!['new', 'read', 'archived'].includes(status)) throw new ApiError(400, 'סטטוס לא מוכר');
        await mustWrite(sql, `update public.contact_messages set status = $1, read_at = case when $1 = 'new' then null else coalesce(read_at, now()) end where id = $2 returning id`, [status, a.id], 'עדכון הפנייה');
        return { ok: true };
      }
      case 'admin.signedUrl': {
        const seconds = Math.min(600, Math.max(30, Number(a.seconds ?? 300)));
        const rows = await sql(`select 1 from public.storage_objects where bucket_id = $1 and name = $2`, [a.bucket, a.path]);
        if (!rows.length) throw new ApiError(404, 'הקובץ לא נמצא');
        const exp = Math.floor(Date.now() / 1000) + seconds;
        return { url: signMedia(secret, String(a.bucket), String(a.path), exp), expiresAt: exp * 1000 };
      }
      default:
        throw new ApiError(404, 'פעולה לא מוכרת');
    }
  });
}

/** Public bank rows never carry the private submission link or the search index. */
function publicPq(r: Row): PublicQuestion {
  const copy = { ...r };
  delete copy.search_text;
  copy.source_submission_id = null;
  return fromRow<PublicQuestion>(copy);
}

async function withTags(sql: Sql, q: PublicQuestion): Promise<PublicQuestion> {
  const tags = await sql(`select tag from public.public_question_tags where question_id = $1 order by tag`, [q.id]);
  return { ...q, tags: tags.map((t) => String(t.tag)) };
}

async function copyApprovedAudio(path: string | null): Promise<string | null> {
  if (!path) return null;
  const ext = (path.split('.').pop() ?? '').toLowerCase();
  if (!['mp3', 'm4a', 'aac', 'ogg', 'webm'].includes(ext)) return null;
  const name = `${new Date().getUTCFullYear()}/${crypto.randomUUID()}/answer.${ext}`;
  const rows = await asOwner((sql) => sql(
    `insert into public.storage_objects (bucket_id, name, mime, bytes, size)
     select 'public-media', $2, mime, bytes, size from public.storage_objects
     where bucket_id = 'private-submissions' and name = $1 and bytes is not null
     returning name`,
    [path, name],
  ));
  const stored = rows[0]?.name ? String(rows[0].name) : '';
  return stored ? `/api/media/public-media/${stored}` : null;
}

function questionRow(r: Row): QuestionSubmission {
  const copy = { ...r };
  delete copy.token_hash; delete copy.notify_token_hash; delete copy.client_fingerprint; delete copy.total;
  return fromRow<QuestionSubmission>(copy);
}

async function saveSources(sql: Sql, contentId: string, sources: MediaSource[]): Promise<void> {
  const existing = await sql(`select id from public.media_sources where content_id = $1`, [contentId]);
  const keep = new Set(sources.map((s) => s.id));
  const remove = existing.map((r) => String(r.id)).filter((id) => !keep.has(id));
  if (remove.length) await sql(`delete from public.media_sources where id = any($1::uuid[])`, [remove]);
  for (const s of sources) {
    await sql(
      `insert into public.media_sources (id, content_id, provider, provider_id, url, canonical_url, delivery_mode, kind, mime, filesize, duration_seconds, checksum, rights_status, rights_evidence, embed_status, last_checked_at, error, is_primary, storage_bucket, storage_path)
       values ($1,$2,$3::public.media_provider,$4,$5,$6,$7::public.delivery_mode,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       on conflict (id) do update set provider = excluded.provider, provider_id = excluded.provider_id, url = excluded.url, canonical_url = excluded.canonical_url,
         delivery_mode = excluded.delivery_mode, kind = excluded.kind, mime = excluded.mime, filesize = excluded.filesize, duration_seconds = excluded.duration_seconds,
         checksum = excluded.checksum, rights_status = excluded.rights_status, rights_evidence = excluded.rights_evidence, embed_status = excluded.embed_status,
         last_checked_at = excluded.last_checked_at, error = excluded.error, is_primary = excluded.is_primary, storage_bucket = excluded.storage_bucket, storage_path = excluded.storage_path`,
      [s.id, contentId, s.provider, s.providerId, s.url, canonicalizeUrl(s.url), s.deliveryMode, s.kind, s.mime, s.filesize, s.durationSeconds, s.checksum, s.rightsStatus, s.rightsEvidence, s.embedStatus, s.lastCheckedAt, s.error, s.isPrimary, s.storageBucket, s.storagePath],
    );
  }
}

async function writeArchive(sql: Sql, id: string | null, patch: Partial<ArchiveInput>): Promise<SourceArchive> {
  const current = id ? (await sql(`select * from public.source_archives where id = $1`, [id]))[0] : null;
  if (id && !current) throw new ApiError(404, 'הארכיון לא נמצא');
  const base = current ? fromRow<ArchiveInput>(current) : { name: '', material: '', url: '', verification: 'archive' as const, note: null };
  const next = {
    name: String(patch.name ?? base.name ?? '').trim(),
    material: String(patch.material ?? base.material ?? '').trim(),
    url: String(patch.url ?? base.url ?? '').trim(),
    verification: patch.verification ?? base.verification ?? 'archive',
    note: String(patch.note ?? base.note ?? '').trim() || null,
  };
  const errors = validateArchive(next);
  const first = Object.values(errors)[0];
  if (first) throw new ApiError(422, first);
  const rows = id
    ? await sql(`update public.source_archives set name = $2, material = $3, url = $4, verification = $5, note = $6 where id = $1 returning *`, [id, next.name, next.material, next.url, next.verification, next.note])
    : await sql(`insert into public.source_archives (name, material, url, verification, note) values ($1,$2,$3,$4,$5) returning *`, [next.name, next.material, next.url, next.verification, next.note]);
  if (!rows[0]) throw new ApiError(403, 'שמירת הארכיון נחסמה.', '42501');
  return fromRow<SourceArchive>(rows[0]);
}

export async function dispatch(op: string, args: Record<string, unknown>, userId: string | null, secret: string): Promise<unknown> {
  return run(userId, op, args, secret);
}
