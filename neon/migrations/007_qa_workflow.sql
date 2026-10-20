-- Q&A workflow hardening (7). Additive and idempotent.
-- Locks a delivered answer. An edit while status is still "approved" returns the row to
-- "answered" and clears the rabbi's approval. Public wording or answer edits clear
-- approved_by_rabbi and, if the row was published, unpublish it to draft.
-- New transitions: approved -> answered/assigned, and published -> approved (unpublish),
-- each requiring app.audit_reason. The reason is stored in the audit log, never the answer.

alter table public.question_submissions
  add column if not exists priority smallint not null default 1;
alter table public.question_submissions drop constraint if exists question_submissions_priority_chk;
alter table public.question_submissions
  add constraint question_submissions_priority_chk check (priority between 0 and 3);

alter table public.question_submissions add column if not exists due_at timestamptz;
alter table public.question_submissions add column if not exists parent_id uuid;
alter table public.question_submissions add column if not exists voice_question_path text;
alter table public.question_submissions add column if not exists answer_sources text;
alter table public.question_submissions add column if not exists answer_kind text not null default 'written';
alter table public.question_submissions add column if not exists answered_at timestamptz;
alter table public.question_submissions add column if not exists notify_token_hash text;

alter table public.question_submissions drop constraint if exists question_submissions_answer_kind_chk;
alter table public.question_submissions
  add constraint question_submissions_answer_kind_chk check (answer_kind in ('written', 'oral', 'both'));
alter table public.question_submissions drop constraint if exists question_submissions_parent_fk;
alter table public.question_submissions
  add constraint question_submissions_parent_fk foreign key (parent_id) references public.question_submissions(id) on delete set null;
alter table public.question_submissions drop constraint if exists question_submissions_notify_hash_chk;
alter table public.question_submissions
  add constraint question_submissions_notify_hash_chk check (notify_token_hash is null or length(notify_token_hash) = 64);

create index if not exists question_submissions_due_idx on public.question_submissions (due_at) where due_at is not null;
create index if not exists question_submissions_parent_idx on public.question_submissions (parent_id);

alter table public.public_questions add column if not exists sources text;
alter table public.public_questions add column if not exists answer_kind text not null default 'written';
alter table public.public_questions add column if not exists hidden boolean not null default false;
alter table public.public_questions add column if not exists week_pick boolean not null default false;
alter table public.public_questions add column if not exists category_id uuid;
alter table public.public_questions drop constraint if exists public_questions_answer_kind_chk;
alter table public.public_questions
  add constraint public_questions_answer_kind_chk check (answer_kind in ('written', 'oral', 'both'));

create or replace function public.public_answer_plain(blocks jsonb)
returns text language sql immutable as $$
  select coalesce(string_agg(coalesce(elem->>'text', ''), ' '), '')
  from jsonb_array_elements(coalesce(blocks, '[]'::jsonb)) elem;
$$;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'public_questions' and column_name = 'search_text'
  ) then
    alter table public.public_questions
      add column search_text text generated always as (
        public.he_normalize(coalesce(question_text, '') || ' ' || public.public_answer_plain(answer_blocks) || ' ' || coalesce(sources, ''))
      ) stored;
  end if;
end $$;

create index if not exists public_questions_search_trgm on public.public_questions using gin (search_text extensions.gin_trgm_ops);
create index if not exists public_questions_fts on public.public_questions using gin (to_tsvector('simple', coalesce(search_text, '')));

-- Anonymous visitors do not see hidden answers. Staff still can.
drop policy if exists pub_read on public.public_questions;
create policy pub_read on public.public_questions for select
  using ((status = 'published' and deleted_at is null and hidden = false) or public.is_staff());

create or replace function public.question_transition_allowed(from_s public.question_status, to_s public.question_status)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when from_s = to_s then true
    when from_s = 'submitted' and to_s in ('triaged','closed') then public.has_role(array['owner','admin','editor','reviewer']::public.app_role[])
    when from_s = 'triaged'   and to_s in ('assigned','closed') then public.has_role(array['owner','admin','editor','reviewer']::public.app_role[])
    when from_s = 'assigned'  and to_s = 'answered' then public.has_role(array['owner','admin','editor','rabbi']::public.app_role[])
    when from_s = 'answered'  and to_s = 'assigned' then public.has_role(array['owner','admin','editor','reviewer','rabbi']::public.app_role[])
    when from_s = 'answered'  and to_s = 'approved' then public.has_role(array['rabbi']::public.app_role[])
    when from_s = 'approved'  and to_s in ('answered','assigned') then public.has_role(array['owner','admin','editor','reviewer','rabbi']::public.app_role[])
    when from_s = 'approved'  and to_s in ('published','private_delivered') then public.has_role(array['owner','admin','rabbi']::public.app_role[])
    when from_s = 'published' and to_s = 'approved' then public.has_role(array['owner','admin','rabbi']::public.app_role[])
    when from_s in ('published','private_delivered') and to_s = 'closed' then public.has_role(array['owner','admin','rabbi']::public.app_role[])
    else false
  end;
$$;

create or replace function public.tg_question_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  reason text := nullif(current_setting('app.audit_reason', true), '');
  answer_changed boolean := new.answer_text is distinct from old.answer_text or new.answer_audio_path is distinct from old.answer_audio_path;
  auto_return boolean := false;
begin
  if not public.app_is_service() then
    if answer_changed and old.status in ('published', 'private_delivered', 'closed') then
      raise exception 'answer is locked after delivery' using errcode = '42501';
    end if;
    if answer_changed and old.status = 'approved' then
      new.status := 'answered';
      new.approved_by := null;
      new.approved_at := null;
      auto_return := true;
      reason := coalesce(reason, 'answer edited after approval');
    end if;
    if new.status is distinct from old.status and not public.question_transition_allowed(old.status, new.status) then
      raise exception 'question transition % -> % not allowed for this role', old.status, new.status using errcode = '42501';
    end if;
    if not auto_return and old.status is distinct from new.status and (
         (old.status = 'approved' and new.status in ('answered', 'assigned'))
         or (old.status = 'published' and new.status = 'approved')
       ) and reason is null then
      raise exception 'audit reason required' using errcode = '42501';
    end if;
    if new.status = 'published' and not old.publish_consent then
      raise exception 'asker did not consent to publication' using errcode = '42501';
    end if;
    new.token_hash := old.token_hash;
    new.tracking_code := old.tracking_code;
    new.client_fingerprint := old.client_fingerprint;
    new.publish_consent := old.publish_consent;
    if old.status = 'approved' and new.status in ('answered', 'assigned') then
      new.approved_by := null;
      new.approved_at := null;
    end if;
  end if;
  if new.version is distinct from old.version then
    raise exception 'version conflict' using errcode = '40001';
  end if;
  if new.status = 'approved' and old.status <> 'approved' then
    new.approved_by := public.app_uid();
    new.approved_at := now();
  end if;
  if new.status = 'answered' and old.status <> 'answered' then
    new.answered_by := public.app_uid();
    new.answered_at := coalesce(new.answered_at, now());
  end if;
  new.version := old.version + 1;
  new.updated_at := now();
  insert into public.audit_log (actor, action, entity, entity_id, meta)
  values (public.app_uid(), 'update', 'question_submissions', new.id::text,
          jsonb_strip_nulls(jsonb_build_object('from', old.status, 'to', new.status, 'reason', reason)));
  return new;
end $$;

create or replace function public.tg_public_question_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  matched boolean := false;
begin
  if public.app_is_service() then return new; end if;
  if tg_op = 'UPDATE' and (
       new.question_text is distinct from old.question_text
       or new.answer_blocks is distinct from old.answer_blocks
     ) then
    new.approved_by_rabbi := false;
    if old.status = 'published' and new.status = 'published' then
      new.status := 'draft';
    end if;
  end if;
  if new.approved_by_rabbi and (tg_op = 'INSERT' or old.approved_by_rabbi is not true) then
    select exists (
      select 1 from public.question_submissions q
      where q.id = new.source_submission_id
        and q.approved_by is not null
        and q.status in ('approved', 'published')
        and q.publish_consent
        and q.question_text = new.question_text
        and coalesce(q.answer_text, '') = public.public_answer_plain(new.answer_blocks)
    ) into matched;
    if not (public.has_role(array['rabbi']::public.app_role[]) or matched) then
      raise exception 'approved_by_rabbi requires the rabbi or an approved, consented submission' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

create or replace function public.tg_versioned_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.app_is_service() then
    if new.status is distinct from old.status and not public.content_transition_allowed(old.status, new.status) then
      raise exception 'transition % -> % not allowed for this role', old.status, new.status using errcode = '42501';
    end if;
    -- Nested so other versioned tables never touch public_questions.hidden.
    if tg_table_name = 'public_questions' then
      if ((old.status = 'published' and new.status = 'draft')
          or (old.hidden is not true and new.hidden is true))
         and nullif(current_setting('app.audit_reason', true), '') is null then
        raise exception 'audit reason required' using errcode = '42501';
      end if;
    end if;
  end if;
  if new.version is distinct from old.version then
    raise exception 'version conflict: row changed since you loaded it' using errcode = '40001';
  end if;
  new.version := old.version + 1;
  new.updated_at := now();
  if tg_table_name = 'content_items' then
    new.updated_by := public.app_uid();
    if new.status = 'published' and old.status <> 'published' then new.published_at := coalesce(new.published_at, now()); end if;
  end if;
  if tg_table_name = 'public_questions' and new.status = 'published' and old.status is distinct from 'published' then
    new.published_at := coalesce(new.published_at, now());
  end if;
  insert into public.revisions (entity, entity_id, version, snapshot, created_by)
  values (tg_table_name, old.id, old.version, to_jsonb(old), public.app_uid());
  return new;
end $$;

create or replace function public.tg_audit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  rid text;
  meta jsonb := '{}'::jsonb;
  reason text := nullif(current_setting('app.audit_reason', true), '');
begin
  rid := coalesce((case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end)->>'id', null);
  if tg_op = 'UPDATE' and to_jsonb(new) ? 'status' then
    meta := jsonb_build_object('from', to_jsonb(old)->>'status', 'to', to_jsonb(new)->>'status');
  end if;
  if reason is not null then meta := meta || jsonb_build_object('reason', reason); end if;
  if tg_table_name = 'user_roles' then
    meta := jsonb_build_object('user', coalesce(to_jsonb(new), to_jsonb(old))->>'user_id',
                               'role', coalesce(to_jsonb(new), to_jsonb(old))->>'role');
  end if;
  insert into public.audit_log (actor, action, entity, entity_id, meta)
  values (public.app_uid(), lower(tg_op), tg_table_name, rid, meta);
  return coalesce(new, old);
end $$;

-- Tracking accepts the original secret or a one-time notify token. The answer text is unchanged.
create or replace function public.track_question(p_code text, p_token text)
returns table (tracking_code text, status public.question_status, created_at timestamptz, answer_text text, public_slug text, has_audio boolean)
language plpgsql stable security definer set search_path = public, extensions as $$
declare tok text;
begin
  if p_code is null or p_token is null or length(p_token) < 32 then return; end if;
  tok := encode(digest(p_token, 'sha256'), 'hex');
  return query
    select q.tracking_code, q.status, q.created_at,
           case when q.status in ('private_delivered','published','closed') and q.approved_by is not null then q.answer_text end,
           pq.slug,
           (q.status in ('private_delivered','published','closed') and q.approved_by is not null and q.answer_audio_path is not null)
    from public.question_submissions q
    left join public.public_questions pq on pq.id = q.public_question_id and pq.status = 'published' and pq.deleted_at is null and pq.hidden = false
    where q.tracking_code = upper(p_code)
      and (q.token_hash = tok or q.notify_token_hash = tok);
end $$;

revoke all on function public.question_transition_allowed(public.question_status, public.question_status) from public, app_anon, app_api;
revoke all on function public.tg_question_update() from public, app_anon, app_api;
revoke all on function public.tg_public_question_guard() from public, app_anon, app_api;
revoke all on function public.tg_versioned_update() from public, app_anon, app_api;
revoke all on function public.tg_audit() from public, app_anon, app_api;
grant execute on function public.public_answer_plain(jsonb) to app_anon, app_api;
grant execute on function public.track_question(text, text) to app_anon, app_api;

-- Voice questions may be webm from the browser recorder. Still no svg/html.
update public.storage_buckets
set allowed_mime_types = (
  select array(select distinct unnest(allowed_mime_types || array['audio/webm','video/webm']))
)
where id = 'private-submissions'
  and not ('audio/webm' = any(allowed_mime_types));
