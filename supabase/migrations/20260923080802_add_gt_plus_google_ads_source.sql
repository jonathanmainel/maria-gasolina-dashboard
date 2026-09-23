insert into public.dashboard_source_accounts (
  client_id,
  source,
  account_id,
  account_name,
  active
)
select
  id,
  'google_ads',
  '6072699813',
  'Google Ads local test',
  true
from public.dashboard_clients
where slug = 'gt-mais-test'
on conflict (client_id, source, account_id)
do update set
  account_name = excluded.account_name,
  active = true,
  updated_at = now();
