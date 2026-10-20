-- Media hall (9). Additive and idempotent.
-- Optional chapters and a plain-text transcript. Both stay empty until staff enter real data.
-- Extends public search with hall (watch/listen), length and date filters.
-- 007 and 008 are not in this tree; this file is numbered after 008 on purpose.

alter table public.content_items
  add column if not exists chapters jsonb not null default '[]'::jsonb;

alter table public.content_items
  add column if not exists transcript text;

-- CHECK cannot contain a subquery. The shape rule lives in an immutable function.
create or replace function public.media_chapters_ok(p jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  e jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'array' or jsonb_array_length(p) > 80 then
    return false;
  end if;
  for e in select value from jsonb_array_elements(p)
  loop
    if jsonb_typeof(e) <> 'object'
      or jsonb_typeof(e->'t') <> 'number'
      or (e->>'t')::numeric < 0
      or (e->>'t')::numeric > 43200
      or length(btrim(coalesce(e->>'label', ''))) = 0
      or length(e->>'label') > 160
      or (e->>'label') ~ '[<>]'
    then
      return false;
    end if;
  end loop;
  return true;
end $$;

revoke all on function public.media_chapters_ok(jsonb) from public;
grant execute on function public.media_chapters_ok(jsonb) to app_anon, app_api;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'content_items_chapters_chk') then
    alter table public.content_items
      add constraint content_items_chapters_chk
      check (public.media_chapters_ok(chapters));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'content_items_transcript_chk') then
    alter table public.content_items
      add constraint content_items_transcript_chk
      check (transcript is null or (char_length(transcript) <= 20000 and transcript !~ '[<>]'));
  end if;
end $$;

-- Fresh signature: length, dated and hall are optional and default to null,
-- so search_content('בדיקה') keeps working.
drop function if exists public.search_content(text, public.content_type, text, text, public.media_provider, text, integer, integer);
drop function if exists public.search_content(text, public.content_type, text, text, public.media_provider, text, integer, integer, text, text, text);

create or replace function public.search_content(
  q text default '',
  p_type public.content_type default null,
  p_topic text default null,
  p_series text default null,
  p_provider public.media_provider default null,
  p_sort text default 'newest',
  p_limit integer default 24,
  p_offset integer default 0,
  p_length text default null,
  p_dated text default null,
  p_hall text default null
)
returns table (id uuid, total bigint)
language sql stable security invoker set search_path = public, extensions as $$
  with nq as (select public.he_normalize(q) as v),
  base as (
    select c.*, (select v from nq) as nv,
      public.he_normalize(
        coalesce(c.transcript, '') || ' ' ||
        coalesce((
          select string_agg(e->>'label', ' ')
          from jsonb_array_elements(case when jsonb_typeof(c.chapters) = 'array' then c.chapters else '[]'::jsonb end) e
        ), '')
      ) as extra
    from public.content_items c
    where c.status = 'published' and c.deleted_at is null
      and (p_type is null or c.type = p_type)
      and (p_hall is null or p_hall = '' or
           (p_hall = 'watch' and c.type in ('video', 'short', 'live')) or
           (p_hall = 'listen' and c.type = 'audio'))
      and (p_length is null or p_length = '' or
           (p_length = 'short' and c.duration_seconds is not null and c.duration_seconds < 600) or
           (p_length = 'medium' and c.duration_seconds >= 600 and c.duration_seconds < 2400) or
           (p_length = 'long' and c.duration_seconds >= 2400) or
           (p_length = 'unknown' and c.duration_seconds is null))
      and (p_dated is null or p_dated = '' or
           (p_dated = 'known' and (c.event_date is not null or c.source_published_date is not null)) or
           (p_dated = 'unknown' and c.event_date is null and c.source_published_date is null))
      and (p_topic is null or exists (
        select 1 from public.content_topics ct
        join public.topics t on t.id = ct.topic_id
        where ct.content_id = c.id and t.slug = p_topic))
      and (p_series is null or exists (
        select 1 from public.series_items si
        join public.series s on s.id = si.series_id
        where si.content_id = c.id and s.slug = p_series))
      and (p_provider is null or exists (
        select 1 from public.media_sources m where m.content_id = c.id and m.provider = p_provider))
  ),
  matched as (
    select b.*, case when b.nv = '' then 0
      else similarity(b.search_text, b.nv)
        + case when b.search_text like '%' || b.nv || '%' or b.extra like '%' || b.nv || '%' then 1 else 0 end
      end as score
    from base b
    where b.nv = '' or (
      not exists (
        select 1 from unnest(string_to_array(b.nv, ' ')) tok
        where b.search_text not like '%' || tok || '%'
          and b.extra not like '%' || tok || '%'
      )
    )
  )
  select m.id, count(*) over () as total
  from matched m
  order by
    case when m.nv <> '' then m.score end desc nulls last,
    case when p_sort = 'title' then m.title end asc,
    case when p_sort = 'duration' then m.duration_seconds end desc nulls last,
    case when p_sort = 'oldest' then m.catalog_order end desc,
    m.catalog_order asc
  limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
$$;

grant execute on function public.search_content(
  text, public.content_type, text, text, public.media_provider, text, integer, integer, text, text, text
) to app_anon, app_api;

-- Header link for installs that already seeded the default menu.
update public.menus
set items = jsonb_build_array(jsonb_build_object('label', 'אודיטוריום', 'href', '/watch')) || items
where location = 'header'
  and not exists (
    select 1 from jsonb_array_elements(items) e where e->>'href' = '/watch'
  );
