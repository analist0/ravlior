-- Ktiv male / haser: תפילה and תפלה share a skeleton (internal vav and yod dropped).
-- PR #10 (originally 009_search_skeleton.sql); renumbered to 022 in integration so it extends
-- the 11-argument search_content from 021 (hall/length/dated + publish_at) instead of recreating the old 8-arg overload.
-- Applied after 004 and 008 so existing databases pick up the search change without a rewrite.

create or replace function public.he_skeleton(input text)
returns text language plpgsql immutable parallel safe set search_path = public as $$
declare
  s text := public.he_normalize(input);
  prev text;
  i int;
begin
  for i in 1..4 loop
    prev := s;
    s := regexp_replace(s, '([א-ת])[וי]+([א-ת])', '\1\2', 'g');
    exit when s = prev;
  end loop;
  return s;
end $$;

revoke all on function public.he_skeleton(text) from public;
grant execute on function public.he_skeleton(text) to app_anon, app_api;

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
    select b.*, case when b.nv = '' then 0
      else similarity(b.search_text, b.nv)
        + case when b.search_text like '%' || b.nv || '%' or b.extra like '%' || b.nv || '%' then 1 else 0 end
      end as score
    from base b
    where b.nv = '' or (
      not exists (
        select 1 from unnest(string_to_array(b.nv, ' ')) tok
        where tok <> ''
          and b.search_text not like '%' || tok || '%'
          and b.extra not like '%' || tok || '%'
          and (length(public.he_skeleton(tok)) < 2
               or public.he_skeleton(b.search_text) not like '%' || public.he_skeleton(tok) || '%')
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

create or replace function public.admin_search_content(q text default '', p_limit integer default 50, p_offset integer default 0)
returns setof public.content_items language plpgsql stable security invoker set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'staff only' using errcode = '42501'; end if;
  return query select * from public.content_items c
    where q = ''
       or c.search_text like '%' || public.he_normalize(q) || '%'
       or (length(public.he_skeleton(q)) >= 2 and public.he_skeleton(c.search_text) like '%' || public.he_skeleton(q) || '%')
    order by c.updated_at desc limit least(p_limit, 200) offset p_offset;
end $$;

create or replace function public.search_public_questions(
  q text default '',
  p_topic text default null,
  p_category text default null,
  p_limit integer default 20,
  p_offset integer default 0
) returns table (id uuid, total bigint)
language sql stable security invoker set search_path = public, extensions as $$
  with nq as (select public.he_normalize(coalesce(q, '')) as v),
  base as (
    select p.*, (select v from nq) as nv
    from public.public_questions p
    where p.status = 'published' and p.deleted_at is null and p.hidden = false
      and (p_topic is null or p_topic = '' or exists (
        select 1 from public.topics t where t.id = p.topic_id and t.slug = p_topic))
      and (p_category is null or p_category = '' or exists (
        select 1 from public.halacha_categories c where c.id = p.category_id and c.slug = p_category))
  ),
  matched as (
    select b.*, case when b.nv = '' then 0
      else similarity(coalesce(b.search_text, ''), b.nv)
           + case when coalesce(b.search_text, '') like '%' || b.nv || '%' then 1 else 0 end
      end as score
    from base b
    where b.nv = '' or (
      to_tsvector('simple', coalesce(b.search_text, '')) @@ plainto_tsquery('simple', b.nv)
      or not exists (
        select 1 from unnest(string_to_array(b.nv, ' ')) tok
        where tok <> ''
          and coalesce(b.search_text, '') not like '%' || tok || '%'
          and (length(public.he_skeleton(tok)) < 2
               or public.he_skeleton(coalesce(b.search_text, '')) not like '%' || public.he_skeleton(tok) || '%')
      )
    )
  )
  select m.id, count(*) over () as total
  from matched m
  order by m.score desc, m.published_at desc nulls last
  limit greatest(1, least(coalesce(p_limit, 20), 50))
  offset greatest(coalesce(p_offset, 0), 0);
$$;
