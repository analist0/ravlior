-- Storage buckets, storage.objects policies and public search.

-- ——— buckets (limits enforced by Storage itself; mirrors src/shared/upload-policy.ts) ———
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('public-media', 'public-media', true, 524288000,
     array['audio/mpeg','audio/mp4','audio/aac','audio/ogg','video/mp4','video/webm','image/jpeg','image/png','image/webp']),
  ('public-books', 'public-books', true, 104857600, array['application/pdf','image/jpeg','image/png','image/webp']),
  ('private-submissions', 'private-submissions', false, 52428800, array['audio/mpeg','audio/mp4','audio/aac','audio/ogg']),
  ('private-drafts', 'private-drafts', false, 524288000,
     array['audio/mpeg','audio/mp4','audio/aac','audio/ogg','video/mp4','video/webm','image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
-- No image/svg+xml and no text/html anywhere: active content is never stored.

-- Path shape: <yyyy>/<uuid>/<sanitized-name>.<ext> — sanitized client-side and re-checked here.
create or replace function public.storage_path_ok(name text)
returns boolean language sql immutable as $$
  select name ~ '^[0-9]{4}/[0-9a-f-]{36}/[a-z0-9][a-z0-9._-]{0,100}\.(mp3|m4a|aac|ogg|mp4|webm|jpg|jpeg|png|webp|pdf)$'
     and name !~ '\.\.';
$$;

drop policy if exists "public buckets read" on storage.objects;
create policy "public buckets read" on storage.objects for select
  using (bucket_id in ('public-media','public-books'));

drop policy if exists "staff upload public" on storage.objects;
create policy "staff upload public" on storage.objects for insert to authenticated
  with check (bucket_id in ('public-media','public-books','private-drafts') and public.can_edit() and public.storage_path_ok(name));

drop policy if exists "staff update" on storage.objects;
create policy "staff update" on storage.objects for update to authenticated
  using (bucket_id in ('public-media','public-books','private-drafts') and public.can_edit())
  with check (bucket_id in ('public-media','public-books','private-drafts') and public.can_edit() and public.storage_path_ok(name));

drop policy if exists "admin delete" on storage.objects;
create policy "admin delete" on storage.objects for delete to authenticated
  using (bucket_id in ('public-media','public-books','private-drafts','private-submissions') and public.is_admin());

drop policy if exists "staff read private drafts" on storage.objects;
create policy "staff read private drafts" on storage.objects for select to authenticated
  using (bucket_id = 'private-drafts' and public.is_staff());

-- Voice answers are uploaded by the rabbi / admin into private-submissions; askers get short signed URLs via the server.
drop policy if exists "answer audio upload" on storage.objects;
create policy "answer audio upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'private-submissions' and public.has_role(array['owner','admin','rabbi']::public.app_role[]) and public.storage_path_ok(name));
drop policy if exists "answer audio read" on storage.objects;
create policy "answer audio read" on storage.objects for select to authenticated
  using (bucket_id = 'private-submissions' and public.has_role(array['owner','admin','rabbi','reviewer']::public.app_role[]));

-- ——— search ———
create or replace function public.search_content(
  q text default '', p_type public.content_type default null, p_topic text default null, p_series text default null,
  p_provider public.media_provider default null, p_sort text default 'newest', p_limit integer default 24, p_offset integer default 0)
returns table (id uuid, total bigint)
language sql stable security invoker set search_path = public, extensions as $$
  with nq as (select public.he_normalize(q) as v),
  base as (
    select c.*, (select v from nq) as nv
    from public.content_items c
    where c.status = 'published' and c.deleted_at is null
      and (p_type is null or c.type = p_type)
      and (p_topic is null or exists (select 1 from public.content_topics ct join public.topics t on t.id = ct.topic_id where ct.content_id = c.id and t.slug = p_topic))
      and (p_series is null or exists (select 1 from public.series_items si join public.series s on s.id = si.series_id where si.content_id = c.id and s.slug = p_series))
      and (p_provider is null or exists (select 1 from public.media_sources m where m.content_id = c.id and m.provider = p_provider))
  ),
  matched as (
    select b.*, case when b.nv = '' then 0
      else similarity(b.search_text, b.nv) + case when b.search_text like '%' || b.nv || '%' then 1 else 0 end end as score
    from base b
    where b.nv = '' or (
      -- every token must appear (substring) — predictable for Hebrew without morphology
      not exists (select 1 from unnest(string_to_array(b.nv, ' ')) tok where b.search_text not like '%' || tok || '%')
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
grant execute on function public.search_content to anon, authenticated;

-- Admin search is a separate function (includes drafts/archived/deleted) and requires staff.
create or replace function public.admin_search_content(q text default '', p_limit integer default 50, p_offset integer default 0)
returns setof public.content_items language plpgsql stable security invoker set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'staff only' using errcode = '42501'; end if;
  return query select * from public.content_items c
    where q = '' or c.search_text like '%' || public.he_normalize(q) || '%'
    order by c.updated_at desc limit least(p_limit, 200) offset p_offset;
end $$;
grant execute on function public.admin_search_content to authenticated;
