create table if not exists public.dashboard_source_accounts (
  id bigint generated always as identity primary key,

  client_id bigint not null
    references public.dashboard_clients(id)
    on delete cascade,

  source text not null,
  account_id text not null,
  account_name text,

  active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (client_id, source, account_id)
);

create index if not exists dashboard_source_accounts_client_source_active_idx
  on public.dashboard_source_accounts (
    client_id,
    source,
    active
  );

alter table public.dashboard_source_accounts
  enable row level security;

insert into public.dashboard_source_accounts (
  client_id,
  source,
  account_id
)
select
  id,
  'meta_ads',
  '1063721474298569'
from public.dashboard_clients
where slug = 'maria-gasolina'
on conflict (client_id, source, account_id)
do update
set
  active = true,
  updated_at = now();
