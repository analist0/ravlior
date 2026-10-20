-- Responsa bank: Hebrew search, halacha categories, tags, staff templates, ETA setting.
-- Categories are the standard halacha shelves, not content about the rabbi. No sample Q&A.

create table if not exists public.halacha_categories (
  id uuid primary key,
  slug text not null unique,
  name text not null,
  sort integer not null default 0
);
alter table public.public_questions drop constraint if exists public_questions_category_fk;
alter table public.public_questions
  add constraint public_questions_category_fk foreign key (category_id) references public.halacha_categories(id) on delete set null;

insert into public.halacha_categories (id, slug, name, sort) values
  ('c1000000-0000-4000-a000-000000000001', 'orach-chaim', 'אורח חיים', 1),
  ('c1000000-0000-4000-a000-000000000002', 'yoreh-deah', 'יורה דעה', 2),
  ('c1000000-0000-4000-a000-000000000003', 'even-haezer', 'אבן העזר', 3),
  ('c1000000-0000-4000-a000-000000000004', 'choshen-mishpat', 'חושן משפט', 4),
  ('c1000000-0000-4000-a000-000000000005', 'emunah', 'אמונה ומחשבה', 5),
  ('c1000000-0000-4000-a000-000000000006', 'moadim', 'מועדים', 6),
  ('c1000000-0000-4000-a000-000000000007', 'tefillah', 'תפילה', 7),
  ('c1000000-0000-4000-a000-000000000008', 'klali', 'כללי', 8)
on conflict (id) do nothing;

create table if not exists public.public_question_tags (
  question_id uuid not null references public.public_questions(id) on delete cascade,
  tag text not null check (length(tag) between 1 and 40),
  primary key (question_id, tag)
);

create table if not exists public.answer_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(title) between 1 and 120),
  body text not null check (length(body) between 1 and 8000),
  created_by uuid references public.app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.halacha_categories enable row level security;
alter table public.public_question_tags enable row level security;
alter table public.answer_templates enable row level security;

drop policy if exists categories_read on public.halacha_categories;
create policy categories_read on public.halacha_categories for select using (true);
drop policy if exists categories_write on public.halacha_categories;
create policy categories_write on public.halacha_categories for all to app_api
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists tags_read on public.public_question_tags;
create policy tags_read on public.public_question_tags for select
  using (
    exists (
      select 1 from public.public_questions p
      where p.id = question_id and p.status = 'published' and p.deleted_at is null and p.hidden = false
    ) or public.is_staff()
  );
drop policy if exists tags_write on public.public_question_tags;
create policy tags_write on public.public_question_tags for all to app_api
  using (public.can_edit()) with check (public.can_edit());

drop policy if exists templates_staff on public.answer_templates;
create policy templates_staff on public.answer_templates for all to app_api
  using (public.is_staff()) with check (public.can_edit() or public.has_role(array['rabbi']::public.app_role[]));

grant select on public.halacha_categories to app_anon, app_api;
grant select, insert, update, delete on public.halacha_categories to app_api;
grant select on public.public_question_tags to app_anon, app_api;
grant insert, update, delete on public.public_question_tags to app_api;
grant select, insert, update, delete on public.answer_templates to app_api;

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
        where tok <> '' and coalesce(b.search_text, '') not like '%' || tok || '%'
      )
    )
  )
  select m.id, count(*) over () as total
  from matched m
  order by m.score desc, m.published_at desc nulls last
  limit greatest(1, least(coalesce(p_limit, 20), 50))
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.search_public_questions(text, text, text, integer, integer) from public;
grant execute on function public.search_public_questions(text, text, text, integer, integer) to app_anon, app_api;

insert into public.site_settings (key, value)
values ('public.responsa_eta_days', '14'::jsonb)
on conflict (key) do nothing;
