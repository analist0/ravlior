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
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;

alter function public.he_normalize(text) set search_path = pg_catalog;
alter function public.tg_simple_version() set search_path = public;
alter function public.storage_path_ok(text) set search_path = pg_catalog;
