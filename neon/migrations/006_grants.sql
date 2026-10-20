-- Grants and execute lockdown (6 of 6).
-- Hardening after the Supabase security advisor (30.09.2026).
-- 1) Trigger functions and internal transition checks are not API endpoints: revoke EXECUTE
--    (triggers still fire — PostgreSQL does not check EXECUTE on trigger functions at fire time).
-- 2) Fixed search_path on the remaining functions.
-- Intentionally still callable: track_question (public tracking), search_content, and the role
-- helpers has_role/is_staff/can_edit/can_review/is_admin/content_is_public — RLS policies call
-- them as the current user, and they only reveal the caller's own roles.
-- rate_limits intentionally has RLS with no policies (service role / definer function only).

do $$
declare f text;
begin
  foreach f in array array[
    'public.tg_audit()', 'public.tg_public_question_guard()', 'public.tg_question_update()',
    'public.tg_user_roles_guard()', 'public.tg_versioned_insert()', 'public.tg_versioned_update()',
    'public.tg_simple_version()',
    'public.content_transition_allowed(public.content_status, public.content_status)',
    'public.question_transition_allowed(public.question_status, public.question_status)'] loop
    execute format('revoke all on function %s from public, app_anon, app_api', f);
  end loop;
end $$;

alter function public.he_normalize(text) set search_path = pg_catalog;
alter function public.tg_simple_version() set search_path = public;
alter function public.storage_path_ok(text) set search_path = pg_catalog;


grant usage on schema public to app_anon, app_api;
grant usage on schema extensions to app_anon, app_api;
grant select on all tables in schema public to app_anon, app_api;
grant insert, update, delete on all tables in schema public to app_api;
grant usage, select on all sequences in schema public to app_api;

-- Account secrets, sessions, invites, partial uploads and rate limits stay owner-only.
revoke all on table public.app_users from app_anon, app_api;
revoke all on table public.sessions from app_anon, app_api;
revoke all on table public.invites from app_anon, app_api;
revoke all on table public.storage_uploads from app_anon, app_api;
revoke all on table public.rate_limits from app_anon, app_api;
revoke insert, update, delete on table public.audit_log from app_api;
revoke insert, update, delete on table public.revisions from app_api;
revoke insert, delete on table public.question_submissions from app_api;
revoke all on table public.profiles from app_anon;
revoke insert, update, delete on table public.storage_buckets from app_api;

grant execute on function public.app_uid() to app_anon, app_api;
grant execute on function public.app_is_service() to app_anon, app_api;
grant execute on function public.he_normalize(text) to app_anon, app_api;
grant execute on function public.has_role(public.app_role[]) to app_anon, app_api;
grant execute on function public.is_staff() to app_anon, app_api;
grant execute on function public.can_edit() to app_anon, app_api;
grant execute on function public.can_review() to app_anon, app_api;
grant execute on function public.is_admin() to app_anon, app_api;
grant execute on function public.content_is_public(uuid) to app_anon, app_api;
grant execute on function public.storage_path_ok(text) to app_anon, app_api;
-- hit_rate_limit stays owner-only (revoked from app_anon/app_api in 002_workflow.sql).
