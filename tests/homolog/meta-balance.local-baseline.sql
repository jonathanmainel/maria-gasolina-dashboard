-- Synthetic fixture for an EMPTY, isolated PostgreSQL 17 container only.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create schema private;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
$$;
grant usage on schema public,private,auth to authenticated,service_role;
grant execute on function auth.uid() to authenticated,service_role;
create table public.dashboard_clients(id bigint primary key,slug text unique,name text,active boolean default true);
create table public.dashboard_client_users(client_id bigint references public.dashboard_clients,user_id uuid references auth.users,
 role text check(role in ('admin','editor','viewer')),primary key(client_id,user_id));
create table public.dashboard_source_accounts(client_id bigint references public.dashboard_clients,source text,account_id text,account_name text,
 active boolean default true,primary key(client_id,source,account_id));
create function private.is_dashboard_client_member(p_client_id bigint) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.dashboard_client_users where client_id=p_client_id and user_id=(select auth.uid()));
$$;
grant select on public.dashboard_client_users to authenticated;
create table private.meta_balance_test_marker(token text);
insert into private.meta_balance_test_marker values ('isolated-synthetic-meta-balance');
