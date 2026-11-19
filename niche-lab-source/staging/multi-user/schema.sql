-- Run in a NEW Supabase staging project. Do not import into the production D1 database.
begin;
create table public.memberships (
 user_id uuid primary key references auth.users(id) on delete cascade,
 email text not null,
 role text not null default 'member' check (role in ('owner','member')),
 status text not null default 'active' check (status in ('active','suspended')),
 created_at timestamptz not null default now()
);
create unique index one_owner on public.memberships(role) where role='owner';
create table public.user_watchlist (
 user_id uuid not null references auth.users(id) on delete cascade,
 listing_id bigint not null check (listing_id>0),
 created_at timestamptz not null default now(),
 primary key (user_id,listing_id)
);
create table public.access_audit (
 id bigint generated always as identity primary key,
 actor_id uuid not null,
 target_id uuid,
 action text not null check (action in ('invite','suspend','restore')),
 created_at timestamptz not null default now()
);
alter table public.memberships enable row level security;
alter table public.user_watchlist enable row level security;
alter table public.access_audit enable row level security;
create policy read_own_membership on public.memberships for select to authenticated using (user_id=auth.uid());
create policy own_watchlist on public.user_watchlist for all to authenticated
 using (user_id=auth.uid() and exists (select 1 from public.memberships m where m.user_id=auth.uid() and m.status='active'))
 with check (user_id=auth.uid() and exists (select 1 from public.memberships m where m.user_id=auth.uid() and m.status='active'));
-- Membership and audit writes are server-only: no browser insert/update/delete policy.
revoke all on public.memberships,public.access_audit from anon,authenticated;
grant select on public.memberships to authenticated;
revoke all on public.user_watchlist from anon,authenticated;
grant select,insert,delete on public.user_watchlist to authenticated;
commit;
-- Bootstrap only after creating/verifying your own account in Supabase Auth:
-- insert into public.memberships(user_id,email,role,status)
-- select id,email,'owner','active' from auth.users where id='<YOUR VERIFIED USER UUID>';
-- Keep public sign-up disabled. Configure Supabase SMTP, Site URL and allowed redirects.
