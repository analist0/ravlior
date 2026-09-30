-- Row Level Security. Public (anon) reads published, non-deleted rows only.
-- Private question submissions have NO anon policy at all.

do $$
declare t text;
begin
  foreach t in array array['profiles','user_roles','content_items','media_sources','book_details','topics','content_topics',
    'series','series_items','pages','menus','homepage_sections','institutions','events','source_archives',
    'question_submissions','public_questions','modules','site_settings','revisions','audit_log','rate_limits'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- helper: published and not soft-deleted
create or replace function public.content_is_public(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.content_items c where c.id = cid and c.status = 'published' and c.deleted_at is null);
$$;

-- ——— content_items ———
drop policy if exists content_public_read on public.content_items;
create policy content_public_read on public.content_items for select
  using ((status = 'published' and deleted_at is null) or public.is_staff());
drop policy if exists content_insert on public.content_items;
create policy content_insert on public.content_items for insert to authenticated with check (public.can_edit());
drop policy if exists content_update on public.content_items;
create policy content_update on public.content_items for update to authenticated
  using (public.can_edit() or public.can_review()) with check (public.can_edit() or public.can_review());
drop policy if exists content_delete on public.content_items;
create policy content_delete on public.content_items for delete to authenticated
  using (public.is_admin() and deleted_at is not null);  -- permanent delete only after soft delete, admins only

-- ——— children of content ———
do $$
declare t text;
begin
  foreach t in array array['media_sources','book_details','content_topics'] loop
    execute format('drop policy if exists child_read on public.%I', t);
    execute format('create policy child_read on public.%I for select using (public.content_is_public(content_id) or public.is_staff())', t);
    execute format('drop policy if exists child_write on public.%I', t);
    execute format('create policy child_write on public.%I for all to authenticated using (public.can_edit()) with check (public.can_edit())', t);
  end loop;
end $$;

-- ——— simple published/staff tables ———
do $$
declare t text;
begin
  foreach t in array array['topics','series','pages','institutions','events','public_questions'] loop
    execute format('drop policy if exists pub_read on public.%I', t);
    execute format('create policy pub_read on public.%I for select using ((status = ''published'' and deleted_at is null) or public.is_staff())', t);
    execute format('drop policy if exists staff_insert on public.%I', t);
    execute format('create policy staff_insert on public.%I for insert to authenticated with check (public.can_edit())', t);
    execute format('drop policy if exists staff_update on public.%I', t);
    execute format('create policy staff_update on public.%I for update to authenticated using (public.can_edit() or public.can_review()) with check (public.can_edit() or public.can_review())', t);
    execute format('drop policy if exists admin_delete on public.%I', t);
    execute format('create policy admin_delete on public.%I for delete to authenticated using (public.is_admin() and deleted_at is not null)', t);
  end loop;
end $$;

drop policy if exists series_items_read on public.series_items;
create policy series_items_read on public.series_items for select
  using ((public.content_is_public(content_id) and exists (select 1 from public.series s where s.id = series_id and s.status = 'published' and s.deleted_at is null)) or public.is_staff());
drop policy if exists series_items_write on public.series_items;
create policy series_items_write on public.series_items for all to authenticated using (public.can_edit()) with check (public.can_edit());

-- menus, homepage sections, archives, settings: public read, admin/editor write
do $$
declare t text;
begin
  foreach t in array array['menus','homepage_sections','source_archives'] loop
    execute format('drop policy if exists public_read on public.%I', t);
    execute format('create policy public_read on public.%I for select using (true)', t);
    execute format('drop policy if exists editor_write on public.%I', t);
    execute format('create policy editor_write on public.%I for all to authenticated using (public.can_edit()) with check (public.can_edit())', t);
  end loop;
end $$;

drop policy if exists modules_read on public.modules;
create policy modules_read on public.modules for select using (true);            -- enabled flags are public by design
drop policy if exists modules_write on public.modules;
create policy modules_write on public.modules for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists settings_read on public.site_settings;
create policy settings_read on public.site_settings for select using (key like 'public.%' or public.is_staff());
drop policy if exists settings_write on public.site_settings;
create policy settings_write on public.site_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ——— private questions: staff only; anon has nothing (inserts go through the server endpoint) ———
drop policy if exists questions_staff_read on public.question_submissions;
create policy questions_staff_read on public.question_submissions for select to authenticated
  using (public.has_role(array['owner','admin','editor','reviewer','rabbi']::public.app_role[]));
drop policy if exists questions_staff_update on public.question_submissions;
create policy questions_staff_update on public.question_submissions for update to authenticated
  using (public.has_role(array['owner','admin','editor','reviewer','rabbi']::public.app_role[]))
  with check (public.has_role(array['owner','admin','editor','reviewer','rabbi']::public.app_role[]));
-- No insert/delete policy: inserts use the service role in the server; deletion is an admin SQL task (BACKUP_RESTORE.md).

-- ——— users / audit / revisions ———
drop policy if exists profiles_self on public.profiles;
create policy profiles_self on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists roles_read on public.user_roles;
create policy roles_read on public.user_roles for select to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists roles_write on public.user_roles;
create policy roles_write on public.user_roles for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists audit_read on public.audit_log;
create policy audit_read on public.audit_log for select to authenticated using (public.is_admin());
-- audit_log has no insert/update/delete policy: only SECURITY DEFINER triggers write it.

drop policy if exists revisions_read on public.revisions;
create policy revisions_read on public.revisions for select to authenticated using (public.is_staff());

-- rate_limits: no policies (service role / definer function only).

-- Note: FORCE ROW LEVEL SECURITY is intentionally not used — the SECURITY DEFINER role helpers
-- read user_roles as the table owner and would otherwise recurse into these policies.
