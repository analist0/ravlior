-- PR #12 (originally 013_search_variants.sql), renumbered to 024 in integration. Same 11-arg search_content
-- signature as 021/022: keeps the publish_at gate (020) and the ktiv male/haser skeleton match (022), adds
-- doubled-letter folding and Latin-keyboard queries. Single version; create or replace.
-- Search variants (13). Additive. Do not apply this file to a production database from CI.
-- Query-time only: stored search_text stays he_normalize(). Folded יי/ו and an
-- Israeli QWERTY reading are compared in search_content / admin_search_content.
-- Keep in sync with src/shared/hebrew.ts (heSearchFold, heKeyboard).

create or replace function public.he_keyboard(input text)
returns text
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select translate(
    lower(coalesce(input, '')),
    'qwertyuiopasdfghjkl;zxcvbnm,.',
    '/׳קראטוןםפשדגכעיחלךףזסבהנמצתץ'
  );
$$;

create or replace function public.he_search_fold(input text)
returns text
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select regexp_replace(
    regexp_replace(public.he_normalize(coalesce(input, '')), 'יי+', 'י', 'g'),
    'וו+', 'ו', 'g'
  );
$$;

revoke all on function public.he_keyboard(text) from public;
revoke all on function public.he_search_fold(text) from public;
grant execute on function public.he_keyboard(text) to app_anon, app_api;
grant execute on function public.he_search_fold(text) to app_anon, app_api;

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
  with nq as (
    select
      public.he_search_fold(q) as v,
      case
        when coalesce(q, '') ~ '[A-Za-z]' and coalesce(q, '') !~ '[א-ת]'
        then public.he_search_fold(public.he_keyboard(q))
        else ''
      end as alt
  ),
  base as (
    select c.*,
      (select v from nq) as nv,
      (select alt from nq) as nalt,
      public.he_search_fold(
        coalesce(c.search_text, '') || ' ' ||
        coalesce(c.transcript, '') || ' ' ||
        coalesce((
          select string_agg(e->>'label', ' ')
          from jsonb_array_elements(case when jsonb_typeof(c.chapters) = 'array' then c.chapters else '[]'::jsonb end) e
        ), '')
      ) as hay
    from public.content_items c
    where c.status = 'published' and c.deleted_at is null
      and (c.publish_at is null or c.publish_at <= now())
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
    select b.*, case when b.nv = '' and b.nalt = '' then 0
      else similarity(public.he_search_fold(b.search_text), case when b.nv = '' then b.nalt else b.nv end)
        + case
            when (b.nv <> '' and b.hay like '%' || b.nv || '%')
              or (b.nalt <> '' and b.hay like '%' || b.nalt || '%')
            then 1 else 0 end
      end as score
    from base b
    where (b.nv = '' and b.nalt = '')
      or (
        b.nv <> '' and not exists (
          select 1 from unnest(string_to_array(b.nv, ' ')) tok
          where tok <> '' and b.hay not like '%' || tok || '%'
            and (length(public.he_skeleton(tok)) < 2 or public.he_skeleton(b.hay) not like '%' || public.he_skeleton(tok) || '%')
        )
      )
      or (
        b.nalt <> '' and not exists (
          select 1 from unnest(string_to_array(b.nalt, ' ')) tok
          where tok <> '' and b.hay not like '%' || tok || '%'
            and (length(public.he_skeleton(tok)) < 2 or public.he_skeleton(b.hay) not like '%' || public.he_skeleton(tok) || '%')
        )
      )
  )
  select m.id, count(*) over () as total
  from matched m
  order by
    case when m.nv <> '' or m.nalt <> '' then m.score end desc nulls last,
    case when p_sort = 'title' then m.title end asc,
    case when p_sort = 'duration' then m.duration_seconds end desc nulls last,
    case when p_sort = 'oldest' then m.catalog_order end desc,
    m.catalog_order asc
  limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0);
$$;

create or replace function public.admin_search_content(q text default '', p_limit integer default 50, p_offset integer default 0)
returns setof public.content_items language plpgsql stable security invoker set search_path = public as $$
declare
  folded text := public.he_search_fold(q);
  alt text := case
    when coalesce(q, '') ~ '[A-Za-z]' and coalesce(q, '') !~ '[א-ת]'
    then public.he_search_fold(public.he_keyboard(q))
    else ''
  end;
begin
  if not public.is_staff() then raise exception 'staff only' using errcode = '42501'; end if;
  return query select * from public.content_items c
    where q = ''
      or (folded <> '' and public.he_search_fold(c.search_text) like '%' || folded || '%')
      or (alt <> '' and public.he_search_fold(c.search_text) like '%' || alt || '%')
      or (length(public.he_skeleton(q)) >= 2 and public.he_skeleton(c.search_text) like '%' || public.he_skeleton(q) || '%')
    order by c.updated_at desc limit least(p_limit, 200) offset p_offset;
end $$;
