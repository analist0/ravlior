-- Books, events, institutions and the contact inbox (additive, idempotent).
-- Safe to re-run. Does not rewrite seed rows and does not invent content.
-- Numbered after 008 so it does not collide with other in-flight migrations.

alter table public.book_details add column if not exists toc jsonb not null default '[]'::jsonb;
alter table public.book_details add column if not exists sample jsonb not null default '[]'::jsonb;
alter table public.book_details add column if not exists purchase_url text;
alter table public.book_details add column if not exists donation_url text;

alter table public.book_details drop constraint if exists book_details_toc_array;
alter table public.book_details add constraint book_details_toc_array check (jsonb_typeof(toc) = 'array');
alter table public.book_details drop constraint if exists book_details_sample_array;
alter table public.book_details add constraint book_details_sample_array check (jsonb_typeof(sample) = 'array');
alter table public.book_details drop constraint if exists book_details_purchase_https;
alter table public.book_details add constraint book_details_purchase_https check (purchase_url is null or purchase_url ~ '^https://');
alter table public.book_details drop constraint if exists book_details_donation_https;
alter table public.book_details add constraint book_details_donation_https check (donation_url is null or donation_url ~ '^https://');

alter table public.content_items add column if not exists publish_at timestamptz;
alter table public.pages add column if not exists publish_at timestamptz;
alter table public.institutions add column if not exists place_label text;
alter table public.institutions add column if not exists map_url text;
alter table public.institutions add column if not exists publish_at timestamptz;
alter table public.events add column if not exists location_label text;
alter table public.events add column if not exists map_url text;
alter table public.events add column if not exists starts_at timestamptz;
alter table public.events add column if not exists ends_at timestamptz;
alter table public.events add column if not exists publish_at timestamptz;

alter table public.institutions drop constraint if exists institutions_map_https;
alter table public.institutions add constraint institutions_map_https check (map_url is null or map_url ~ '^https://');
alter table public.events drop constraint if exists events_map_https;
alter table public.events add constraint events_map_https check (map_url is null or map_url ~ '^https://');

create index if not exists content_items_publish_at_idx on public.content_items (publish_at) where publish_at is not null;
create index if not exists events_event_date_idx on public.events (event_date);

-- A published row stays invisible to visitors until publish_at, when one is set.
create or replace function public.content_is_public(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.content_items c
    where c.id = cid and c.status = 'published' and c.deleted_at is null
      and (c.publish_at is null or c.publish_at <= now())
  );
$$;

drop policy if exists content_public_read on public.content_items;
create policy content_public_read on public.content_items for select
  using (
    (status = 'published' and deleted_at is null and (publish_at is null or publish_at <= now()))
    or public.is_staff()
  );

do $$
declare t text;
begin
  foreach t in array array['pages','institutions','events'] loop
    execute format('drop policy if exists pub_read on public.%I', t);
    execute format($p$
      create policy pub_read on public.%I for select
      using (
        (status = 'published' and deleted_at is null and (publish_at is null or publish_at <= now()))
        or public.is_staff()
      )
    $p$, t);
  end loop;
end $$;

-- Public search hides rows waiting for publish_at. Staff admin search is unchanged.
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
      and (c.publish_at is null or c.publish_at <= now())
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

create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text check (name is null or length(name) between 1 and 80),
  email text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  subject text not null check (length(subject) between 1 and 140),
  body text not null check (length(body) between 10 and 4000),
  status text not null default 'new' check (status in ('new','read','archived')),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists contact_messages_status_idx on public.contact_messages (status, created_at desc);

alter table public.contact_messages enable row level security;
drop policy if exists contact_staff_read on public.contact_messages;
create policy contact_staff_read on public.contact_messages for select to app_api
  using (public.has_role(array['owner','admin','editor','reviewer']::public.app_role[]));
drop policy if exists contact_staff_update on public.contact_messages;
create policy contact_staff_update on public.contact_messages for update to app_api
  using (public.has_role(array['owner','admin','editor','reviewer']::public.app_role[]))
  with check (public.has_role(array['owner','admin','editor','reviewer']::public.app_role[]));

drop trigger if exists audit on public.contact_messages;
create trigger audit after insert or update or delete on public.contact_messages
  for each row execute function public.tg_audit();

revoke all on table public.contact_messages from public, app_anon, app_api;
grant select, update on table public.contact_messages to app_api;
-- Inserts go through the table owner in the API (same pattern as question intake). No anon policy.
