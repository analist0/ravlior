-- A public Q&A may carry approved_by_rabbi = true only if the rabbi set it himself, or it was
-- created from a private submission the rabbi already approved. Editors cannot fake approval.
alter table public.public_questions
  add column if not exists source_submission_id uuid references public.question_submissions(id) on delete set null;

create or replace function public.tg_public_question_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.role() = 'service_role' then return new; end if;
  if new.approved_by_rabbi and (tg_op = 'INSERT' or not old.approved_by_rabbi) then
    if not (public.has_role(array['rabbi']::public.app_role[])
            or exists (select 1 from public.question_submissions q
                       where q.id = new.source_submission_id and q.approved_by is not null
                         and q.status in ('approved','published') and q.publish_consent)) then
      raise exception 'approved_by_rabbi requires the rabbi or an approved, consented submission' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists public_question_guard on public.public_questions;
create trigger public_question_guard before insert or update on public.public_questions
  for each row execute function public.tg_public_question_guard();

-- The rabbi (who approves answers) may also create the public copy.
drop policy if exists rabbi_insert on public.public_questions;
create policy rabbi_insert on public.public_questions for insert to authenticated
  with check (public.has_role(array['rabbi']::public.app_role[]));
