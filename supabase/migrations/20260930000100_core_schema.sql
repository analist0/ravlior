-- Or HaMeir site — core schema.
-- Apply in order with the Supabase SQL editor, `psql`, or the Supabase CLI on a supported machine.
-- Nothing here requires Docker or a local Postgres.

-- Supabase keeps extensions in the `extensions` schema; do the same elsewhere.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- ——— enums ———
do $$ begin
  create type public.app_role as enum ('owner','admin','editor','reviewer','rabbi','viewer');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.content_type as enum ('video','audio','short','live','book','leaflet','article','answer');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.content_status as enum ('draft','in_review','approved','published','archived');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.question_status as enum ('submitted','triaged','assigned','answered','approved','published','private_delivered','closed');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.media_provider as enum ('youtube','kol-barama','ykr','ktr','hm-news','pdf','storage','web');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.delivery_mode as enum ('embed','direct','storage','link');
exception when duplicate_object then null; end $$;

-- ——— Hebrew normalization (keep in sync with src/shared/hebrew.ts) ———
create or replace function public.he_normalize(input text)
returns text language sql immutable parallel safe as $$
  select btrim(regexp_replace(
    translate(
      lower(regexp_replace(
        regexp_replace(coalesce(input,''), '[֑-ׇ]', '', 'g'),        -- niqqud / te'amim
        '[׳״''"`‘’“”]', '', 'g')),                 -- geresh / quotes
      'ךםןףץ', 'כמנפצ'),
    '[^[:alnum:][:space:]]+|\s+', ' ', 'g'));
$$;

-- ——— users & roles ———
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  granted_by uuid references auth.users(id),
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

-- Role checks read the table, never JWT user_metadata (which users can edit).
create or replace function public.has_role(roles public.app_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid() and role = any(roles));
$$;
create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(array['owner','admin','editor','reviewer','rabbi','viewer']::public.app_role[]);
$$;
create or replace function public.can_edit()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(array['owner','admin','editor']::public.app_role[]);
$$;
create or replace function public.can_review()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(array['owner','admin','reviewer','rabbi']::public.app_role[]);
$$;
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(array['owner','admin']::public.app_role[]);
$$;

-- ——— content ———
create table if not exists public.content_items (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[^\s/?#]{1,120}$'),
  type public.content_type not null,
  title text not null check (length(title) between 1 and 400),
  summary text,
  body jsonb not null default '[]'::jsonb check (jsonb_typeof(body) = 'array'),
  speaker text,
  attribution_status text not null default 'source_page'
    check (attribution_status in ('title_names_rabbi','channel_only','source_page','note_only','other_speaker','not_author')),
  attribution_note text,
  event_date date,
  event_date_text text,
  source_published_date date,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  duration_text text,
  status public.content_status not null default 'draft',
  published_at timestamptz,
  featured boolean not null default false,
  verification text not null default 'located' check (verification in ('located','archive','candidate','historical','blocked')),
  provenance jsonb not null default '[]'::jsonb,
  duplicate_group text,
  catalog_order integer not null default 0,
  search_text text generated always as (public.he_normalize(coalesce(title,'') || ' ' || coalesce(summary,'') || ' ' || coalesce(speaker,''))) stored,
  version integer not null default 1,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists content_items_status_idx on public.content_items (status, deleted_at);
create index if not exists content_items_type_idx on public.content_items (type);
create index if not exists content_items_catalog_idx on public.content_items (catalog_order);
create index if not exists content_items_search_trgm on public.content_items using gin (search_text extensions.gin_trgm_ops);
create index if not exists content_items_fts on public.content_items using gin (to_tsvector('simple', search_text));

create table if not exists public.media_sources (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references public.content_items(id) on delete cascade,
  provider public.media_provider not null,
  provider_id text,
  url text not null check (url ~ '^https://'),
  canonical_url text not null,
  delivery_mode public.delivery_mode not null default 'link',
  kind text not null default 'media' check (kind in ('media','source_page','pdf','archive')),
  mime text,
  filesize bigint check (filesize is null or filesize >= 0),
  duration_seconds integer,
  checksum text,
  rights_status text not null default 'unverified' check (rights_status in ('unverified','embed_only','licensed','owned','blocked')),
  rights_evidence text,
  embed_status text not null default 'unchecked' check (embed_status in ('unchecked','ok','failed','unsupported')),
  last_checked_at timestamptz,
  error text,
  is_primary boolean not null default false,
  storage_bucket text,
  storage_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (content_id, canonical_url)
);
-- One canonical record per provider media id (e.g. a YouTube id), across all items.
create unique index if not exists media_sources_provider_uidx on public.media_sources (provider, provider_id)
  where provider_id is not null and kind = 'media';
create index if not exists media_sources_content_idx on public.media_sources (content_id);

create table if not exists public.book_details (
  content_id uuid primary key references public.content_items(id) on delete cascade,
  author_text text,
  editor_text text,
  publisher text,
  authored_by_rabbi boolean not null default false,
  cover_path text,
  pdf_access text not null default 'none' check (pdf_access in ('none','public','restricted')),
  located_status text not null default ''
);

create table if not exists public.topics (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  sort integer not null default 0,
  auto boolean not null default false,
  status public.content_status not null default 'published',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create table if not exists public.content_topics (
  content_id uuid not null references public.content_items(id) on delete cascade,
  topic_id uuid not null references public.topics(id) on delete cascade,
  auto boolean not null default false,
  primary key (content_id, topic_id)
);
create index if not exists content_topics_topic_idx on public.content_topics (topic_id);

create table if not exists public.series (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text,
  kind text not null default 'system' check (kind in ('system','source')),
  source_url text check (source_url is null or source_url ~ '^https://'),
  status public.content_status not null default 'draft',
  sort integer not null default 0,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (kind = 'system' or source_url is not null)
);
create table if not exists public.series_items (
  series_id uuid not null references public.series(id) on delete cascade,
  content_id uuid not null references public.content_items(id) on delete cascade,
  position integer not null,
  primary key (series_id, content_id),
  unique (series_id, position) deferrable initially deferred
);

create table if not exists public.pages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text,
  blocks jsonb not null default '[]'::jsonb check (jsonb_typeof(blocks) = 'array'),
  status public.content_status not null default 'draft',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.menus (
  id uuid primary key default gen_random_uuid(),
  location text not null unique check (location in ('header','footer')),
  items jsonb not null default '[]'::jsonb,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists public.homepage_sections (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('actions','continue','featured','latest','topics','series','books','answers')),
  title text not null,
  enabled boolean not null default true,
  position integer not null default 0,
  config jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists public.institutions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  source_urls jsonb not null default '[]'::jsonb,
  status public.content_status not null default 'draft',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  institution_id uuid references public.institutions(id) on delete set null,
  title text not null,
  event_date date,
  date_text text,
  summary text,
  source_urls jsonb not null default '[]'::jsonb,
  status public.content_status not null default 'draft',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.source_archives (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  material text,
  url text not null unique,
  verification text not null default 'archive',
  note text
);

-- ——— Q&A: private submissions are a separate table from public questions ———
create table if not exists public.question_submissions (
  id uuid primary key default gen_random_uuid(),
  tracking_code text not null unique check (tracking_code ~ '^[A-Z0-9]{4}-[A-Z0-9]{4}$'),
  token_hash text not null check (length(token_hash) = 64),       -- sha256 hex of the secret token; the token itself is never stored
  is_anonymous boolean not null default true,
  asker_name text check (asker_name is null or length(asker_name) <= 80),
  contact_email text check (contact_email is null or contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  topic_id uuid references public.topics(id) on delete set null,
  question_text text not null check (length(question_text) between 10 and 4000),
  publish_consent boolean not null default false,
  status public.question_status not null default 'submitted',
  assigned_to uuid references auth.users(id),
  answer_text text,
  answer_audio_path text,
  answered_by uuid references auth.users(id),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  public_question_id uuid,
  client_fingerprint text,                                         -- salted hash, for abuse control only
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists question_submissions_status_idx on public.question_submissions (status, created_at desc);

create table if not exists public.public_questions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  question_text text not null,             -- edited/anonymized copy; never the private original by reference
  answer_blocks jsonb not null default '[]'::jsonb,
  answer_audio_url text,
  topic_id uuid references public.topics(id) on delete set null,
  attribution text not null,
  approved_by_rabbi boolean not null default false,
  status public.content_status not null default 'draft',
  published_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (status <> 'published' or approved_by_rabbi)
);
alter table public.question_submissions
  drop constraint if exists question_submissions_public_fk,
  add constraint question_submissions_public_fk foreign key (public_question_id) references public.public_questions(id) on delete set null;

-- ——— platform ———
create table if not exists public.modules (
  id text primary key check (id ~ '^[a-z][a-z0-9-]{1,40}$'),
  enabled boolean not null default true,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.revisions (
  id bigint generated always as identity primary key,
  entity text not null,
  entity_id uuid not null,
  version integer not null,
  snapshot jsonb not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists revisions_entity_idx on public.revisions (entity, entity_id, version desc);

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  actor uuid,
  action text not null,
  entity text not null,
  entity_id text,
  meta jsonb not null default '{}'::jsonb,   -- never secret tokens or private question text
  created_at timestamptz not null default now()
);
create index if not exists audit_log_created_idx on public.audit_log (created_at desc);

create table if not exists public.rate_limits (
  bucket text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (bucket, window_start)
);
