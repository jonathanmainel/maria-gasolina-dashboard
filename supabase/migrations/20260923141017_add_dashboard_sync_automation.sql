alter table public.dashboard_source_accounts
  add column if not exists automation_enabled boolean not null default false;

create index if not exists dashboard_source_accounts_automation_idx
  on public.dashboard_source_accounts (source, automation_enabled, active, client_id);

update public.dashboard_source_accounts source_account
set automation_enabled = true, updated_at = now()
from public.dashboard_clients client
where source_account.client_id = client.id
  and client.slug = 'maria-gasolina'
  and source_account.source = 'google_ads'
  and source_account.account_id = '6072699813';

update public.dashboard_source_accounts source_account
set automation_enabled = false, updated_at = now()
from public.dashboard_clients client
where source_account.client_id = client.id
  and client.slug = 'gt-mais-test'
  and source_account.source = 'google_ads';

create table if not exists public.dashboard_automation_runs (
  id uuid primary key default gen_random_uuid(),
  client_id bigint not null references public.dashboard_clients(id) on delete cascade,
  source text not null,
  trigger text not null,
  range_start date not null,
  range_end date not null,
  status text not null,
  http_status integer,
  counts jsonb not null default '{}'::jsonb,
  database_write_status text,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint dashboard_automation_runs_source_check check (source in ('google_ads')),
  constraint dashboard_automation_runs_trigger_check check (trigger in ('cron', 'manual')),
  constraint dashboard_automation_runs_status_check check (status in ('running', 'success', 'failed')),
  constraint dashboard_automation_runs_range_check check (range_start <= range_end),
  constraint dashboard_automation_runs_counts_object_check check (jsonb_typeof(counts) = 'object')
);

create index if not exists dashboard_automation_runs_client_started_idx
  on public.dashboard_automation_runs (client_id, started_at desc);

create index if not exists dashboard_automation_runs_status_started_idx
  on public.dashboard_automation_runs (status, started_at desc);

alter table public.dashboard_automation_runs enable row level security;

drop policy if exists dashboard_automation_runs_member_select on public.dashboard_automation_runs;
create policy dashboard_automation_runs_member_select
on public.dashboard_automation_runs
for select
to authenticated
using ((select private.is_dashboard_client_member(client_id)));

revoke all on table public.dashboard_automation_runs from anon;
grant select on table public.dashboard_automation_runs to authenticated;
grant select, insert, update, delete on table public.dashboard_automation_runs to service_role;
