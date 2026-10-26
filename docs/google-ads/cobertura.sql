-- Read-only inventory for the recovery planner. No secrets or personal identities.
-- Account identifiers belong in a private local artifact, never a public report.
with target as (
  select id from public.dashboard_clients where slug = 'maria-gasolina' and active
), accounts as (
  select account_id from public.dashboard_source_accounts
  where client_id = (select id from target) and source = 'google_ads' and active
), domains(domain) as (
  values ('daily'),('campaigns'),('ad_groups'),('ads'),('keywords'),('pmax_asset_groups'),('pmax_assets')
), coverage as (
  select 'daily' as domain,account_id,max(metric_date) as last_date,count(*) as rows
  from public.dashboard_daily_metrics where client_id=(select id from target) and source='google_ads' group by account_id
  union all select 'campaigns',account_id,max(metric_date),count(*) from public.dashboard_campaign_daily where client_id=(select id from target) and source='google_ads' group by account_id
  union all select 'ad_groups',account_id,max(metric_date),count(*) from public.dashboard_ad_group_daily where client_id=(select id from target) and source='google_ads' group by account_id
  union all select 'ads',account_id,max(metric_date),count(*) from public.dashboard_ad_daily where client_id=(select id from target) and source='google_ads' group by account_id
  union all select 'keywords',account_id,max(metric_date),count(*) from public.dashboard_keyword_daily where client_id=(select id from target) and source='google_ads' group by account_id
  union all select 'pmax_asset_groups',account_id,max(metric_date),count(*) from public.dashboard_pmax_asset_group_daily where client_id=(select id from target) and source='google_ads' group by account_id
  union all select 'pmax_assets',account_id,max(metric_date),count(*) from public.dashboard_pmax_asset_daily where client_id=(select id from target) and source='google_ads' group by account_id
)
select jsonb_build_object(
  'project_ref','hlqrpreqvvxtkruwsolg','client_slug','maria-gasolina',
  'as_of_date',(now() at time zone 'America/Sao_Paulo')::date,
  'account_ids',(select jsonb_agg(account_id order by account_id) from accounts),
  'coverage',(select jsonb_agg(jsonb_build_object('domain',d.domain,'account_id',a.account_id,'last_date',c.last_date,'rows',coalesce(c.rows,0)) order by a.account_id,d.domain)
    from accounts a cross join domains d left join coverage c on c.account_id=a.account_id and c.domain=d.domain)
) as recovery_input;
