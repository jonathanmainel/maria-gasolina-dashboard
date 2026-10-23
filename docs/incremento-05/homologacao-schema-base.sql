-- HOMOLOGACAO EXCLUSIVA uwafdxsdsgqysjjxfywo. Estrutura sem dados de producao.
-- Maria Gasolina dashboard ingestion
-- Run this migration in the Supabase SQL editor.

create table if not exists public.dashboard_clients (
  id bigint generated always as identity primary key,
  slug text not null unique,
  name text not null,
  timezone text not null default 'America/Sao_Paulo',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dashboard_clients_slug_format_check
    check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create table if not exists public.dashboard_client_users (
  client_id bigint not null references public.dashboard_clients(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer',
  created_at timestamptz not null default now(),
  primary key (client_id, user_id),
  constraint dashboard_client_users_role_check
    check (role in ('viewer', 'manager', 'admin'))
);

-- Keep the dashboard membership helper outside the exposed API schema.

create schema if not exists private;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create or replace function private.is_dashboard_client_member(p_client_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.dashboard_client_users dcu
    where dcu.client_id = p_client_id
      and dcu.user_id = (select auth.uid())
  );
$$;

revoke all on function private.is_dashboard_client_member(bigint)
  from public, anon, authenticated;
grant execute on function private.is_dashboard_client_member(bigint)
  to authenticated;

create table if not exists public.dashboard_manual_inputs (
  id bigint generated always as identity primary key,
  client_id bigint not null references public.dashboard_clients(id) on delete cascade,
  scope text not null,
  payload jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dashboard_manual_inputs_scope_check
    check (scope ~ '^[a-z0-9_]{3,40}$'),
  constraint dashboard_manual_inputs_payload_object_check
    check (jsonb_typeof(payload) = 'object'),
  unique (client_id, scope)
);

create index if not exists dashboard_manual_inputs_client_scope_idx
  on public.dashboard_manual_inputs (client_id, scope);

alter table public.dashboard_manual_inputs enable row level security;

-- Leitura e escrita são liberadas para qualquer membro do cliente: o dashboard é
-- a ferramenta do próprio time que opera a conta, e hoje todos os usuários são
-- criados com role 'viewer'. Se no futuro for preciso separar quem edita, basta
-- trocar a condição por um teste de role em dashboard_client_users.
drop policy if exists dashboard_manual_inputs_member_select on public.dashboard_manual_inputs;
create policy dashboard_manual_inputs_member_select
on public.dashboard_manual_inputs
for select
to authenticated
using ((select private.is_dashboard_client_member(client_id)));

drop policy if exists dashboard_manual_inputs_member_insert on public.dashboard_manual_inputs;
create policy dashboard_manual_inputs_member_insert
on public.dashboard_manual_inputs
for insert
to authenticated
with check ((select private.is_dashboard_client_member(client_id)));

drop policy if exists dashboard_manual_inputs_member_update on public.dashboard_manual_inputs;
create policy dashboard_manual_inputs_member_update
on public.dashboard_manual_inputs
for update
to authenticated
using ((select private.is_dashboard_client_member(client_id)))
with check ((select private.is_dashboard_client_member(client_id)));

grant select, insert, update on public.dashboard_manual_inputs to authenticated;

create index dashboard_client_users_user_client_idx on public.dashboard_client_users(user_id,client_id);
alter table public.dashboard_clients enable row level security;
alter table public.dashboard_client_users enable row level security;
create policy dashboard_clients_member_select on public.dashboard_clients
for select to authenticated using ((select private.is_dashboard_client_member(id)));
create policy dashboard_client_users_self_select on public.dashboard_client_users
for select to authenticated using (user_id=(select auth.uid()));
revoke all on public.dashboard_clients,public.dashboard_client_users from public,anon,authenticated,service_role;
grant all on public.dashboard_clients,public.dashboard_client_users to anon,authenticated,service_role;
revoke all on public.dashboard_manual_inputs from public,anon,authenticated,service_role;
grant all on public.dashboard_manual_inputs to service_role;
grant select,insert,update on public.dashboard_manual_inputs to authenticated;
