insert into public.dashboard_clients (
  slug,
  name,
  timezone,
  active
)
values (
  'gt-mais-test',
  'GT Mais Test',
  'America/Sao_Paulo',
  true
)
on conflict (slug)
do update set
  name = excluded.name,
  timezone = excluded.timezone,
  active = true,
  updated_at = now();

insert into public.dashboard_source_accounts (
  client_id,
  source,
  account_id,
  account_name,
  active
)
select
  id,
  'meta_ads',
  '1793697591593376',
  'GT+ | Anuncios',
  true
from public.dashboard_clients
where slug = 'gt-mais-test'
on conflict (client_id, source, account_id)
do update set
  account_name = excluded.account_name,
  active = true,
  updated_at = now();
