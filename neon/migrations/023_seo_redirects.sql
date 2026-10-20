-- On-site slug redirects (012). Old public paths 301 to the current path.
-- Targets must stay on this site: no scheme, no protocol-relative URL.
-- Numbered 012 because 007–011 are used by other branches.

create table if not exists public.url_redirects (
  id uuid primary key default gen_random_uuid(),
  from_path text not null unique,
  to_path text not null,
  created_at timestamptz not null default now(),
  check (
    from_path ~ '^/[^?#\s]{1,200}$'
    and to_path ~ '^/[^?#\s]{1,200}$'
    and from_path <> to_path
    and from_path !~ '://'
    and to_path !~ '://'
    and from_path !~ '^//'
    and to_path !~ '^//'
  )
);
create index if not exists url_redirects_to_idx on public.url_redirects (to_path);

create or replace function public.tg_redirect_internal()
returns trigger language plpgsql as $$
begin
  if new.from_path ~ '://' or new.to_path ~ '://' or new.from_path ~ '^//' or new.to_path ~ '^//'
     or new.from_path !~ '^/' or new.to_path !~ '^/' or new.from_path = new.to_path then
    raise exception 'redirect must be an on-site path' using errcode = '23514';
  end if;
  return new;
end $$;
alter function public.tg_redirect_internal() set search_path = public;
drop trigger if exists redirect_internal on public.url_redirects;
create trigger redirect_internal before insert or update on public.url_redirects
  for each row execute function public.tg_redirect_internal();
revoke all on function public.tg_redirect_internal() from public, app_anon, app_api;

alter table public.url_redirects enable row level security;
drop policy if exists redirects_read on public.url_redirects;
create policy redirects_read on public.url_redirects for select using (true);
drop policy if exists redirects_write on public.url_redirects;
create policy redirects_write on public.url_redirects for all to app_api
  using (public.can_edit() or public.can_review())
  with check (public.can_edit() or public.can_review());

grant select on public.url_redirects to app_anon, app_api;
grant insert, update, delete on public.url_redirects to app_api;
