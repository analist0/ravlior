-- Workflow enforcement, optimistic concurrency, revisions and audit.
-- Transitions mirror src/shared/workflow.ts (tests/workflow.test.ts covers the JS side,
-- supabase/verify/rls_checks.sql the DB side).

create or replace function public.content_transition_allowed(from_s public.content_status, to_s public.content_status)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when from_s = to_s then true
    when from_s = 'draft'     and to_s = 'in_review' then public.can_edit()
    when from_s = 'in_review' and to_s = 'draft'     then public.can_edit() or public.can_review()
    when from_s = 'in_review' and to_s = 'approved'  then public.can_review()
    when from_s = 'approved'  and to_s = 'draft'     then public.can_review()
    when from_s = 'approved'  and to_s = 'published' then public.can_review()
    when from_s = 'published' and to_s = 'draft'     then public.is_admin() or public.can_review()  -- unpublish
    when from_s = 'published' and to_s = 'archived'  then public.is_admin()
    when from_s = 'archived'  and to_s = 'draft'     then public.is_admin()
    when from_s = 'draft'     and to_s = 'archived'  then public.is_admin()
    else false
  end;
$$;

-- Generic BEFORE UPDATE trigger for versioned, workflowed tables.
create or replace function public.tg_versioned_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Service role (seed/import scripts) bypasses the workflow check but still versions rows.
  if auth.role() is distinct from 'service_role' then
    if new.status is distinct from old.status and not public.content_transition_allowed(old.status, new.status) then
      raise exception 'transition % -> % not allowed for this role', old.status, new.status using errcode = '42501';
    end if;
  end if;
  if new.version is distinct from old.version then
    -- Client sent a stale version: optimistic concurrency conflict.
    raise exception 'version conflict: row changed since you loaded it' using errcode = '40001';
  end if;
  new.version := old.version + 1;
  new.updated_at := now();
  if tg_table_name = 'content_items' then
    new.updated_by := auth.uid();
    if new.status = 'published' and old.status <> 'published' then new.published_at := coalesce(new.published_at, now()); end if;
  end if;
  insert into public.revisions (entity, entity_id, version, snapshot, created_by)
  values (tg_table_name, old.id, old.version, to_jsonb(old), auth.uid());
  return new;
end $$;

create or replace function public.tg_versioned_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.role() is distinct from 'service_role' and new.status not in ('draft','in_review') then
    raise exception 'new rows start as draft or in_review' using errcode = '42501';
  end if;
  new.version := 1;
  if tg_table_name = 'content_items' then new.created_by := auth.uid(); new.updated_by := auth.uid(); end if;
  return new;
end $$;

create or replace function public.tg_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  rid text;
  meta jsonb := '{}'::jsonb;
begin
  rid := coalesce((case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end)->>'id', null);
  if tg_op = 'UPDATE' and to_jsonb(new) ? 'status' then
    meta := jsonb_build_object('from', to_jsonb(old)->>'status', 'to', to_jsonb(new)->>'status');
  end if;
  if tg_table_name = 'user_roles' then
    meta := jsonb_build_object('user', coalesce(to_jsonb(new), to_jsonb(old))->>'user_id',
                               'role', coalesce(to_jsonb(new), to_jsonb(old))->>'role');
  end if;
  insert into public.audit_log (actor, action, entity, entity_id, meta)
  values (auth.uid(), lower(tg_op), tg_table_name, rid, meta);
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['content_items','topics','series','pages','institutions','events','public_questions'] loop
    execute format('drop trigger if exists versioned_update on public.%I', t);
    execute format('create trigger versioned_update before update on public.%I for each row execute function public.tg_versioned_update()', t);
    execute format('drop trigger if exists versioned_insert on public.%I', t);
    execute format('create trigger versioned_insert before insert on public.%I for each row execute function public.tg_versioned_insert()', t);
  end loop;
  foreach t in array array['content_items','media_sources','topics','series','series_items','pages','menus','homepage_sections',
                           'institutions','events','public_questions','modules','user_roles','site_settings'] loop
    execute format('drop trigger if exists audit on public.%I', t);
    execute format('create trigger audit after insert or update or delete on public.%I for each row execute function public.tg_audit()', t);
  end loop;
end $$;

-- Menus/home sections/modules: simple version bump (no status workflow).
create or replace function public.tg_simple_version()
returns trigger language plpgsql as $$
begin
  if new.version is distinct from old.version then
    raise exception 'version conflict' using errcode = '40001';
  end if;
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists simple_version on public.menus;
create trigger simple_version before update on public.menus for each row execute function public.tg_simple_version();
drop trigger if exists simple_version on public.homepage_sections;
create trigger simple_version before update on public.homepage_sections for each row execute function public.tg_simple_version();

-- ——— Question workflow ———
create or replace function public.question_transition_allowed(from_s public.question_status, to_s public.question_status)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when from_s = to_s then true
    when from_s = 'submitted' and to_s in ('triaged','closed') then public.has_role(array['owner','admin','editor','reviewer']::public.app_role[])
    when from_s = 'triaged'   and to_s in ('assigned','closed') then public.has_role(array['owner','admin','editor','reviewer']::public.app_role[])
    when from_s = 'assigned'  and to_s = 'answered' then public.has_role(array['owner','admin','editor','rabbi']::public.app_role[])
    when from_s = 'answered'  and to_s = 'assigned' then public.has_role(array['owner','admin','editor','reviewer','rabbi']::public.app_role[])
    -- An answer in the rabbi's name is approved only by the rabbi role (explicitly granted).
    when from_s = 'answered'  and to_s = 'approved' then public.has_role(array['rabbi']::public.app_role[])
    when from_s = 'approved'  and to_s in ('published','private_delivered') then public.has_role(array['owner','admin','rabbi']::public.app_role[])
    when from_s in ('published','private_delivered') and to_s = 'closed' then public.has_role(array['owner','admin','rabbi']::public.app_role[])
    else false
  end;
$$;

create or replace function public.tg_question_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.role() is distinct from 'service_role' then
    if new.status is distinct from old.status and not public.question_transition_allowed(old.status, new.status) then
      raise exception 'question transition % -> % not allowed for this role', old.status, new.status using errcode = '42501';
    end if;
    if new.status = 'published' and not old.publish_consent then
      raise exception 'asker did not consent to publication' using errcode = '42501';
    end if;
    -- Immutable fields for staff edits.
    new.token_hash := old.token_hash;
    new.tracking_code := old.tracking_code;
    new.client_fingerprint := old.client_fingerprint;
    new.publish_consent := old.publish_consent;
  end if;
  if new.version is distinct from old.version then
    raise exception 'version conflict' using errcode = '40001';
  end if;
  if new.status = 'approved' and old.status <> 'approved' then
    new.approved_by := auth.uid();
    new.approved_at := now();
  end if;
  if new.status = 'answered' and old.status <> 'answered' then new.answered_by := auth.uid(); end if;
  new.version := old.version + 1;
  new.updated_at := now();
  -- Audit without private question text or token material.
  insert into public.audit_log (actor, action, entity, entity_id, meta)
  values (auth.uid(), 'update', 'question_submissions', new.id::text,
          jsonb_build_object('from', old.status, 'to', new.status));
  return new;
end $$;
drop trigger if exists question_update on public.question_submissions;
create trigger question_update before update on public.question_submissions for each row execute function public.tg_question_update();

-- Public tracking: code + secret token. Returns only what the asker may see.
drop function if exists public.track_question(text, text);
create or replace function public.track_question(p_code text, p_token text)
returns table (tracking_code text, status public.question_status, created_at timestamptz, answer_text text, public_slug text, has_audio boolean)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if p_code is null or p_token is null or length(p_token) < 32 then return; end if;
  return query
    select q.tracking_code, q.status, q.created_at,
           case when q.status in ('private_delivered','published','closed') and q.approved_by is not null then q.answer_text end,
           pq.slug,
           (q.status in ('private_delivered','published','closed') and q.approved_by is not null and q.answer_audio_path is not null)
    from public.question_submissions q
    left join public.public_questions pq on pq.id = q.public_question_id and pq.status = 'published'
    where q.tracking_code = upper(p_code)
      and q.token_hash = encode(digest(p_token, 'sha256'), 'hex');
end $$;
revoke all on function public.track_question(text, text) from public;
grant execute on function public.track_question(text, text) to anon, authenticated;

-- Server-side submission helper (called by the Node endpoint with the service role key only).
create or replace function public.hit_rate_limit(p_bucket text, p_window_seconds integer, p_max integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
        n integer;
begin
  insert into public.rate_limits (bucket, window_start, hits) values (p_bucket, w, 1)
  on conflict (bucket, window_start) do update set hits = public.rate_limits.hits + 1
  returning hits into n;
  delete from public.rate_limits where window_start < now() - interval '1 day';
  return n <= p_max;
end $$;
revoke all on function public.hit_rate_limit(text, integer, integer) from public, anon, authenticated;

-- Role management: only owner/admin; only owner can grant owner/admin.
create or replace function public.tg_user_roles_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;
  if auth.role() = 'service_role' then return r; end if;
  if not public.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  if r.role in ('owner','admin') and not public.has_role(array['owner']::public.app_role[]) then
    raise exception 'only an owner can grant or revoke owner/admin' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' and old.user_id = auth.uid() and old.role = 'owner' then
    raise exception 'owners cannot remove their own owner role' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then new.granted_by := auth.uid(); return new; end if;
  return r;
end $$;
drop trigger if exists user_roles_guard on public.user_roles;
create trigger user_roles_guard before insert or update or delete on public.user_roles for each row execute function public.tg_user_roles_guard();
