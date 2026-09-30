-- Full-row hashes of imported rows (excluding timestamps), to verify a remote import byte-for-byte
-- against a local import of the same seed. Usage: compare the output of both databases.
select 'content_items' t, count(*) n, md5(string_agg(md5((to_jsonb(c) - 'created_at' - 'updated_at')::text), '' order by c.id)) h from public.content_items c
union all select 'media_sources', count(*), md5(string_agg(md5((to_jsonb(m) - 'created_at' - 'updated_at')::text), '' order by m.id)) from public.media_sources m
union all select 'book_details', count(*), md5(string_agg(md5(to_jsonb(b)::text), '' order by b.content_id)) from public.book_details b
union all select 'topics', count(*), md5(string_agg(md5((to_jsonb(x) - 'created_at' - 'updated_at')::text), '' order by x.id)) from public.topics x
union all select 'content_topics', count(*), md5(string_agg(md5(to_jsonb(x)::text), '' order by x.content_id, x.topic_id)) from public.content_topics x
union all select 'series', count(*), md5(string_agg(md5((to_jsonb(x) - 'created_at' - 'updated_at')::text), '' order by x.id)) from public.series x
union all select 'series_items', count(*), md5(string_agg(md5(to_jsonb(x)::text), '' order by x.series_id, x.content_id)) from public.series_items x
union all select 'institutions', count(*), md5(string_agg(md5((to_jsonb(x) - 'created_at' - 'updated_at')::text), '' order by x.id)) from public.institutions x
union all select 'events', count(*), md5(string_agg(md5((to_jsonb(x) - 'created_at' - 'updated_at')::text), '' order by x.id)) from public.events x
union all select 'source_archives', count(*), md5(string_agg(md5(to_jsonb(x)::text), '' order by x.id)) from public.source_archives x
union all select 'pages', count(*), md5(string_agg(md5((to_jsonb(x) - 'created_at' - 'updated_at')::text), '' order by x.id)) from public.pages x
union all select 'menus', count(*), md5(string_agg(md5((to_jsonb(x) - 'updated_at')::text), '' order by x.id)) from public.menus x
union all select 'homepage_sections', count(*), md5(string_agg(md5((to_jsonb(x) - 'updated_at')::text), '' order by x.id)) from public.homepage_sections x
union all select 'modules', count(*), md5(string_agg(md5((to_jsonb(x) - 'updated_at')::text), '' order by x.id)) from public.modules x
order by 1;
