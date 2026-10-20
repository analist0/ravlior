-- Global site search + update signups (additive, idempotent).
-- Apply after 001–008. Does not alter existing tables.
-- search_site ranks with the existing Hebrew normalization, FTS and pg_trgm.
-- update_signups is owner-only: the API inserts rows; nothing is emailed or messaged.

create or replace function public.search_site(q text default '', p_limit integer default 12)
returns table (kind text, id uuid, title text, href text, label text, score real)
language sql stable security invoker set search_path = public, extensions as $$
  with nq as (select public.he_normalize(coalesce(q, '')) as v),
  content_hits as (
    select 'content'::text as kind, c.id, c.title, ('/item/' || c.slug) as href, c.type::text as label,
      case
        when c.search_text like '%' || n.v || '%' then 8 + word_similarity(n.v, c.search_text)
        when not exists (
          select 1 from unnest(string_to_array(n.v, ' ')) tok
          where tok <> '' and c.search_text not like '%' || tok || '%'
        ) then 5 + word_similarity(n.v, c.search_text)
        else word_similarity(n.v, c.search_text)
      end::real as score,
      (
        not exists (
          select 1 from unnest(string_to_array(n.v, ' ')) tok
          where tok <> '' and c.search_text not like '%' || tok || '%'
        )
        or c.search_text like '%' || n.v || '%'
        or to_tsvector('simple', c.search_text) @@ plainto_tsquery('simple', n.v)
        or (char_length(n.v) >= 3 and word_similarity(n.v, c.search_text) >= 0.35)
      ) as hit
    from public.content_items c
    cross join nq n
    where n.v <> '' and c.status = 'published' and c.deleted_at is null
  ),
  topic_hits as (
    select 'topic'::text, t.id, t.name, ('/topics/' || t.slug), 'topic',
      (case
        when public.he_normalize(t.name) like '%' || n.v || '%' then 8
        when public.he_normalize(coalesce(t.name, '') || ' ' || coalesce(t.description, '')) like '%' || n.v || '%' then 5
        else word_similarity(n.v, public.he_normalize(coalesce(t.name, '') || ' ' || coalesce(t.description, '')))
      end)::real as score,
      (
        public.he_normalize(coalesce(t.name, '') || ' ' || coalesce(t.description, '')) like '%' || n.v || '%'
        or (char_length(n.v) >= 3 and word_similarity(n.v, public.he_normalize(coalesce(t.name, '') || ' ' || coalesce(t.description, ''))) >= 0.35)
      ) as hit
    from public.topics t
    cross join nq n
    where n.v <> '' and t.status = 'published' and t.deleted_at is null
  ),
  series_hits as (
    select 'series'::text, s.id, s.title, ('/series/' || s.slug), 'series',
      (case
        when public.he_normalize(s.title) like '%' || n.v || '%' then 8
        else word_similarity(n.v, public.he_normalize(coalesce(s.title, '') || ' ' || coalesce(s.description, '')))
      end)::real as score,
      (
        public.he_normalize(coalesce(s.title, '') || ' ' || coalesce(s.description, '')) like '%' || n.v || '%'
        or (char_length(n.v) >= 3 and word_similarity(n.v, public.he_normalize(coalesce(s.title, '') || ' ' || coalesce(s.description, ''))) >= 0.35)
      ) as hit
    from public.series s
    cross join nq n
    where n.v <> '' and s.status = 'published' and s.deleted_at is null
  ),
  page_hits as (
    select 'page'::text, p.id, p.title,
      (case when p.slug = 'about' then '/about' else '/p/' || p.slug end),
      'page',
      (case
        when public.he_normalize(p.title) like '%' || n.v || '%' then 8
        else word_similarity(n.v, public.he_normalize(coalesce(p.title, '') || ' ' || coalesce(p.description, '')))
      end)::real as score,
      (
        public.he_normalize(coalesce(p.title, '') || ' ' || coalesce(p.description, '')) like '%' || n.v || '%'
        or (char_length(n.v) >= 3 and word_similarity(n.v, public.he_normalize(coalesce(p.title, '') || ' ' || coalesce(p.description, ''))) >= 0.35)
      ) as hit
    from public.pages p
    cross join nq n
    where n.v <> '' and p.status = 'published' and p.deleted_at is null
  ),
  institution_hits as (
    select 'institution'::text, i.id, i.name, '/institutions'::text, 'institution',
      (case
        when public.he_normalize(i.name) like '%' || n.v || '%' then 8
        else word_similarity(n.v, public.he_normalize(coalesce(i.name, '') || ' ' || coalesce(i.description, '')))
      end)::real as score,
      (
        public.he_normalize(coalesce(i.name, '') || ' ' || coalesce(i.description, '')) like '%' || n.v || '%'
        or (char_length(n.v) >= 3 and word_similarity(n.v, public.he_normalize(coalesce(i.name, '') || ' ' || coalesce(i.description, ''))) >= 0.35)
      ) as hit
    from public.institutions i
    cross join nq n
    where n.v <> '' and i.status = 'published' and i.deleted_at is null
  ),
  all_hits as (
    select * from content_hits where hit
    union all select * from topic_hits where hit
    union all select * from series_hits where hit
    union all select * from page_hits where hit
    union all select * from institution_hits where hit
  )
  select a.kind, a.id, a.title, a.href, a.label, a.score
  from all_hits a
  where a.score >= 0.35
  order by a.score desc, a.title asc
  limit least(greatest(coalesce(p_limit, 12), 1), 24);
$$;

revoke all on function public.search_site(text, integer) from public;
grant execute on function public.search_site(text, integer) to app_anon, app_api;

create index if not exists topics_name_trgm on public.topics using gin ((public.he_normalize(name)) extensions.gin_trgm_ops);
create index if not exists series_title_trgm on public.series using gin ((public.he_normalize(title)) extensions.gin_trgm_ops);
create index if not exists pages_title_trgm on public.pages using gin ((public.he_normalize(title)) extensions.gin_trgm_ops);

create table if not exists public.update_signups (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('email', 'whatsapp')),
  contact text not null check (char_length(contact) between 5 and 120),
  consent boolean not null default true check (consent),
  created_at timestamptz not null default now(),
  constraint update_signups_contact_chk check (
    (channel = 'email' and contact ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
    or (channel = 'whatsapp' and contact ~ '^05[0-9]{8}$')
  ),
  unique (channel, contact)
);

alter table public.update_signups enable row level security;
revoke all on table public.update_signups from public, app_anon, app_api;
