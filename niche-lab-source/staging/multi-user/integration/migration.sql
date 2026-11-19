-- Additive migration for the EXISTING Supabase account database. Preserves users and owner role.
begin;
grant select,insert,update on public.memberships to service_role;
grant insert on public.access_audit to service_role;
grant usage on sequence public.access_audit_id_seq to service_role;
create table if not exists public.market_watchlists (
 user_id uuid references auth.users(id) on delete cascade,
 kind text check (kind in ('listing','shop','keyword')),
 item_key text,
 payload jsonb not null default '{}',
 observed_at timestamptz,
 created_at timestamptz not null default now(),
 primary key(user_id,kind,item_key)
);
create table if not exists public.market_snapshots (
 user_id uuid,kind text,item_key text,day date not null default current_date,
 metrics jsonb not null,observed_at timestamptz not null default now(),
 primary key(user_id,kind,item_key,day),
 foreign key(user_id,kind,item_key) references public.market_watchlists on delete cascade
);
create table if not exists public.market_request_budget(day date,subject text,requests integer not null,primary key(day,subject));
create table if not exists public.market_collector(user_id uuid primary key references auth.users(id) on delete cascade,token uuid,expires_at timestamptz,last_run timestamptz);
alter table public.market_watchlists enable row level security;
alter table public.market_snapshots enable row level security;
alter table public.market_request_budget enable row level security;
alter table public.market_collector enable row level security;
revoke all on public.market_watchlists,public.market_snapshots,public.market_request_budget,public.market_collector from anon,authenticated;
grant select on public.market_watchlists,public.market_snapshots to authenticated;
grant all on public.market_watchlists,public.market_snapshots,public.market_request_budget,public.market_collector to service_role;
drop policy if exists private_market_watchlists on public.market_watchlists;
create policy private_market_watchlists on public.market_watchlists for select to authenticated using(user_id=auth.uid() and exists(select 1 from public.memberships where user_id=auth.uid() and status='active'));
drop policy if exists private_market_snapshots on public.market_snapshots;
create policy private_market_snapshots on public.market_snapshots for select to authenticated using(user_id=auth.uid() and exists(select 1 from public.memberships where user_id=auth.uid() and status='active'));
create or replace function public.market_reserve(p_user uuid) returns integer language plpgsql security invoker set search_path=public as $$
declare n integer;begin
 if not exists(select 1 from memberships where user_id=p_user and status='active') then raise exception 'Inactive membership';end if;
 insert into market_request_budget values(current_date,'global',1) on conflict(day,subject) do update set requests=market_request_budget.requests+1 where market_request_budget.requests<4500 returning requests into n;
 if n is null then raise exception 'Daily budget reached';end if;
 insert into market_request_budget values(current_date,p_user::text,1) on conflict(day,subject) do update set requests=market_request_budget.requests+1 where market_request_budget.requests<2000 returning requests into n;
 if n is null then raise exception 'Member daily budget reached';end if;return n;end $$;
create or replace function public.market_save(p_user uuid,p_kind text,p_key text,p_payload jsonb) returns void language plpgsql security invoker set search_path=public as $$
begin
 perform 1 from memberships where user_id=p_user and status='active' for update;
 if not found then raise exception 'Inactive membership';end if;
 if p_kind not in ('listing','shop','keyword') or length(p_key)>200 then raise exception 'Invalid watchlist item';end if;
 if not exists(select 1 from market_watchlists where user_id=p_user and kind=p_kind and item_key=p_key) and (select count(*) from market_watchlists where user_id=p_user and kind=p_kind)>=(case when p_kind='listing' then 1000 else 50 end) then raise exception 'Tracking limit reached';end if;
 insert into market_watchlists(user_id,kind,item_key,payload,observed_at) values(p_user,p_kind,p_key,p_payload-'_pending',case when p_kind='keyword' or not (p_payload ? 'favorites') or p_payload->'_pending'='true'::jsonb then null else now() end) on conflict(user_id,kind,item_key) do update set payload=excluded.payload,observed_at=excluded.observed_at;
end $$;
create or replace function public.market_lease(p_user uuid,p_token uuid) returns boolean language plpgsql security invoker set search_path=public as $$
declare n uuid;begin
 insert into market_collector(user_id,token,expires_at,last_run) values(p_user,p_token,now()+interval '3 minutes',now()) on conflict(user_id) do update set token=excluded.token,expires_at=excluded.expires_at,last_run=now() where market_collector.expires_at<now() returning token into n;
 return n is not null;end $$;
create or replace function public.market_next_user() returns uuid language sql security invoker set search_path=public as $$
 select m.user_id from memberships m left join market_collector c on c.user_id=m.user_id where m.status='active' and (c.expires_at is null or c.expires_at<now()) and exists(select 1 from market_watchlists w where w.user_id=m.user_id and (w.observed_at is null or w.observed_at<(now() at time zone 'UTC')::date)) order by c.last_run nulls first limit 1
$$;
revoke all on function public.market_reserve(uuid),public.market_save(uuid,text,text,jsonb),public.market_lease(uuid,uuid),public.market_next_user() from public,anon,authenticated;
grant execute on function public.market_reserve(uuid),public.market_save(uuid,text,text,jsonb),public.market_lease(uuid,uuid),public.market_next_user() to service_role;
create or replace function public.market_counts(p_user uuid) returns table(kind text,item_key text,observations bigint) language sql security invoker set search_path=public as $$
 select s.kind,s.item_key,count(*) from market_snapshots s where s.user_id=p_user group by s.kind,s.item_key
$$;
revoke all on function public.market_counts(uuid) from public,anon,authenticated;
grant execute on function public.market_counts(uuid) to service_role;
notify pgrst, 'reload schema';
commit;
