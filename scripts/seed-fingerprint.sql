-- Import verification: counts, relations, duplicates and a content fingerprint.
-- Same query runs locally and on Supabase; the md5 values must match the local import.
select json_build_object(
  'content', (select count(*) from public.content_items where id in (select id from public.content_items)),
  'published', (select count(*) from public.content_items where status = 'published'),
  'draft', (select count(*) from public.content_items where status = 'draft'),
  'by_type', (select json_object_agg(type, n) from (select type, count(*) n from public.content_items group by type) t),
  'media_sources', (select count(*) from public.media_sources),
  'youtube_ids', (select count(distinct provider_id) from public.media_sources where provider = 'youtube' and kind = 'media'),
  'dup_youtube_ids', (select count(*) from (select provider_id from public.media_sources where provider = 'youtube' and kind = 'media' group by provider_id having count(*) > 1) d),
  'dup_slugs', (select count(*) from (select slug from public.content_items group by slug having count(*) > 1) d),
  'orphan_sources', (select count(*) from public.media_sources m left join public.content_items c on c.id = m.content_id where c.id is null),
  'items_without_source', (select count(*) from public.content_items c where not exists (select 1 from public.media_sources m where m.content_id = c.id)),
  'book_details', (select count(*) from public.book_details),
  'topics', (select count(*) from public.topics), 'content_topics', (select count(*) from public.content_topics),
  'series', (select count(*) from public.series), 'series_items', (select count(*) from public.series_items),
  'institutions', (select count(*) from public.institutions), 'events', (select count(*) from public.events),
  'archives', (select count(*) from public.source_archives), 'pages', (select count(*) from public.pages),
  'menus', (select count(*) from public.menus), 'home_sections', (select count(*) from public.homepage_sections),
  'modules', (select count(*) from public.modules),
  'with_provenance', (select count(*) from public.content_items where jsonb_array_length(provenance) > 0),
  'fp_content', md5((select string_agg(id::text || '|' || title || '|' || status || '|' || verification || '|' || coalesce(duration_text, ''), E'\n' order by id) from public.content_items)),
  'fp_sources', md5((select string_agg(id::text || '|' || url || '|' || coalesce(provider_id, ''), E'\n' order by id) from public.media_sources)),
  'fp_relations', md5((select string_agg(x, E'\n' order by x) from (
      select 'ct|' || content_id || '|' || topic_id x from public.content_topics
      union all select 'si|' || series_id || '|' || content_id || '|' || position from public.series_items) r))
) as import_report;
