alter table public.dashboard_automation_runs
  add column if not exists account_id text,
  add column if not exists duration_ms bigint;

alter table public.dashboard_automation_runs
  drop constraint if exists dashboard_automation_runs_source_check;

alter table public.dashboard_automation_runs
  add constraint dashboard_automation_runs_source_check
  check (source in ('google_ads', 'meta_ads'));

update public.dashboard_source_accounts source_account
set
  account_name = 'Maria Gasolina Express',
  active = true,
  automation_enabled = true,
  updated_at = now()
from public.dashboard_clients client
where source_account.client_id = client.id
  and client.slug = 'maria-gasolina'
  and source_account.source = 'meta_ads'
  and source_account.account_id = '1063721474298569';

update public.dashboard_source_accounts source_account
set
  automation_enabled = false,
  updated_at = now()
from public.dashboard_clients client
where source_account.client_id = client.id
  and client.slug = 'gt-mais-test';
