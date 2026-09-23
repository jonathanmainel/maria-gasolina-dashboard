-- Paid media first version for Maria Gasolina.
-- Adds ad-level storage and a single batch RPC for Google Ads and Meta Ads.

alter table public.dashboard_daily_metrics
  add column if not exists all_conversions numeric(20, 6),
  add column if not exists conversion_value numeric(20, 6);

alter table public.dashboard_campaign_daily
  add column if not exists all_conversions numeric(20, 6);

alter table public.dashboard_sync_runs
  add column if not exists ad_rows integer not null default 0;

create table if not exists public.dashboard_ad_daily (
  id bigint generated always as identity primary key,
  client_id bigint not null references public.dashboard_clients(id) on delete cascade,
  source text not null,
  account_id text not null,
  campaign_id text not null,
  campaign_name text,
  adset_id text not null default '',
  adset_name text,
  ad_id text not null,
  ad_name text,
  ad_status text,
  metric_date date not null,
  impressions bigint,
  reach bigint,
  clicks bigint,
  link_clicks bigint,
  conversions numeric(20, 6),
  all_conversions numeric(20, 6),
  spend numeric(20, 6),
  conversion_value numeric(20, 6),
  extra_metrics jsonb not null default '{}'::jsonb,
  source_updated_at timestamptz,
  ingested_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dashboard_ad_daily_source_check
    check (source in ('google_ads', 'meta_ads')),
  constraint dashboard_ad_daily_extra_object_check
    check (jsonb_typeof(extra_metrics) = 'object'),
  unique (client_id, source, account_id, ad_id, metric_date)
);

create index if not exists dashboard_ad_daily_client_source_date_idx
  on public.dashboard_ad_daily (client_id, source, metric_date desc);

create index if not exists dashboard_ad_daily_client_campaign_date_idx
  on public.dashboard_ad_daily (client_id, campaign_id, metric_date desc);

alter table public.dashboard_ad_daily enable row level security;

drop policy if exists dashboard_ad_daily_member_select
  on public.dashboard_ad_daily;

create policy dashboard_ad_daily_member_select
on public.dashboard_ad_daily
for select
to authenticated
using ((select private.is_dashboard_client_member(client_id)));

grant select on public.dashboard_ad_daily to authenticated;

create or replace function public.upsert_dashboard_paid_media_batch(
  p_client_slug text,
  p_source text,
  p_idempotency_key text,
  p_range_start date,
  p_range_end date,
  p_daily_metrics jsonb default '[]'::jsonb,
  p_campaign_daily jsonb default '[]'::jsonb,
  p_ad_daily jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client_id bigint;
  v_daily jsonb := coalesce(p_daily_metrics, '[]'::jsonb);
  v_campaign jsonb := coalesce(p_campaign_daily, '[]'::jsonb);
  v_ad jsonb := coalesce(p_ad_daily, '[]'::jsonb);
  v_daily_count integer := 0;
  v_campaign_count integer := 0;
  v_ad_count integer := 0;
  v_existing jsonb;
begin
  if p_source not in ('google_ads', 'meta_ads') then
    raise exception 'unsupported paid media source: %', p_source
      using errcode = '22023';
  end if;

  if p_range_start is null or p_range_end is null or p_range_start > p_range_end then
    raise exception 'invalid date range' using errcode = '22023';
  end if;

  if p_idempotency_key is null
     or length(trim(p_idempotency_key)) < 8
     or length(p_idempotency_key) > 240 then
    raise exception 'invalid idempotency key' using errcode = '22023';
  end if;

  if jsonb_typeof(v_daily) <> 'array'
     or jsonb_typeof(v_campaign) <> 'array'
     or jsonb_typeof(v_ad) <> 'array' then
    raise exception 'batch fields must be JSON arrays' using errcode = '22023';
  end if;

  select dc.id
  into v_client_id
  from public.dashboard_clients dc
  where dc.slug = p_client_slug
    and dc.active = true;

  if v_client_id is null then
    raise exception 'active dashboard client not found: %', p_client_slug
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_client_slug || '|' || p_source || '|' || p_idempotency_key,
      0
    )
  );

  select jsonb_build_object(
    'status', 'already_processed',
    'sync_run_id', dsr.id,
    'daily_rows', dsr.daily_rows,
    'campaign_rows', dsr.campaign_rows,
    'ad_rows', dsr.ad_rows
  )
  into v_existing
  from public.dashboard_sync_runs dsr
  where dsr.client_id = v_client_id
    and dsr.source = p_source
    and dsr.idempotency_key = p_idempotency_key
    and dsr.status = 'success';

  if v_existing is not null then
    return v_existing;
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(v_daily) as r(metric_date date)
    where r.metric_date is null
       or r.metric_date < p_range_start
       or r.metric_date > p_range_end
  ) or exists (
    select 1
    from jsonb_to_recordset(v_campaign) as r(metric_date date)
    where r.metric_date is null
       or r.metric_date < p_range_start
       or r.metric_date > p_range_end
  ) or exists (
    select 1
    from jsonb_to_recordset(v_ad) as r(metric_date date)
    where r.metric_date is null
       or r.metric_date < p_range_start
       or r.metric_date > p_range_end
  ) then
    raise exception 'one or more metric dates are outside the requested range'
      using errcode = '22023';
  end if;

  insert into public.dashboard_campaign_daily (
    client_id, source, account_id, campaign_id, campaign_name,
    campaign_status, metric_date, impressions, reach, clicks, link_clicks,
    conversions, all_conversions, spend, conversion_value, extra_metrics,
    source_updated_at, ingested_at, updated_at
  )
  select
    v_client_id,
    p_source,
    coalesce(nullif(r.account_id, ''), 'default'),
    r.campaign_id,
    r.campaign_name,
    r.campaign_status,
    r.metric_date,
    r.impressions,
    r.reach,
    r.clicks,
    r.link_clicks,
    r.conversions,
    r.all_conversions,
    r.spend,
    r.conversion_value,
    coalesce(r.extra_metrics, '{}'::jsonb),
    r.source_updated_at,
    now(),
    now()
  from jsonb_to_recordset(v_campaign) as r(
    account_id text,
    campaign_id text,
    campaign_name text,
    campaign_status text,
    metric_date date,
    impressions bigint,
    reach bigint,
    clicks bigint,
    link_clicks bigint,
    conversions numeric,
    all_conversions numeric,
    spend numeric,
    conversion_value numeric,
    extra_metrics jsonb,
    source_updated_at timestamptz
  )
  where nullif(r.campaign_id, '') is not null
  on conflict (client_id, source, account_id, campaign_id, metric_date)
  do update set
    campaign_name = excluded.campaign_name,
    campaign_status = excluded.campaign_status,
    impressions = excluded.impressions,
    reach = excluded.reach,
    clicks = excluded.clicks,
    link_clicks = excluded.link_clicks,
    conversions = excluded.conversions,
    all_conversions = excluded.all_conversions,
    spend = excluded.spend,
    conversion_value = excluded.conversion_value,
    extra_metrics = excluded.extra_metrics,
    source_updated_at = excluded.source_updated_at,
    ingested_at = excluded.ingested_at,
    updated_at = now();

  get diagnostics v_campaign_count = row_count;

  insert into public.dashboard_ad_daily (
    client_id, source, account_id, campaign_id, campaign_name,
    adset_id, adset_name, ad_id, ad_name, ad_status, metric_date,
    impressions, reach, clicks, link_clicks, conversions, all_conversions,
    spend, conversion_value, extra_metrics, source_updated_at,
    ingested_at, updated_at
  )
  select
    v_client_id,
    p_source,
    coalesce(nullif(r.account_id, ''), 'default'),
    r.campaign_id,
    r.campaign_name,
    coalesce(r.adset_id, ''),
    r.adset_name,
    r.ad_id,
    r.ad_name,
    r.ad_status,
    r.metric_date,
    r.impressions,
    r.reach,
    r.clicks,
    r.link_clicks,
    r.conversions,
    r.all_conversions,
    r.spend,
    r.conversion_value,
    coalesce(r.extra_metrics, '{}'::jsonb),
    r.source_updated_at,
    now(),
    now()
  from jsonb_to_recordset(v_ad) as r(
    account_id text,
    campaign_id text,
    campaign_name text,
    adset_id text,
    adset_name text,
    ad_id text,
    ad_name text,
    ad_status text,
    metric_date date,
    impressions bigint,
    reach bigint,
    clicks bigint,
    link_clicks bigint,
    conversions numeric,
    all_conversions numeric,
    spend numeric,
    conversion_value numeric,
    extra_metrics jsonb,
    source_updated_at timestamptz
  )
  where nullif(r.campaign_id, '') is not null
    and nullif(r.ad_id, '') is not null
  on conflict (client_id, source, account_id, ad_id, metric_date)
  do update set
    campaign_id = excluded.campaign_id,
    campaign_name = excluded.campaign_name,
    adset_id = excluded.adset_id,
    adset_name = excluded.adset_name,
    ad_name = excluded.ad_name,
    ad_status = excluded.ad_status,
    impressions = excluded.impressions,
    reach = excluded.reach,
    clicks = excluded.clicks,
    link_clicks = excluded.link_clicks,
    conversions = excluded.conversions,
    all_conversions = excluded.all_conversions,
    spend = excluded.spend,
    conversion_value = excluded.conversion_value,
    extra_metrics = excluded.extra_metrics,
    source_updated_at = excluded.source_updated_at,
    ingested_at = excluded.ingested_at,
    updated_at = now();

  get diagnostics v_ad_count = row_count;

  insert into public.dashboard_daily_metrics (
    client_id, source, account_id, metric_date, impressions, reach, clicks,
    link_clicks, conversions, all_conversions, spend, conversion_value,
    extra_metrics, source_updated_at, ingested_at, updated_at
  )
  select
    v_client_id,
    p_source,
    coalesce(nullif(r.account_id, ''), 'default'),
    r.metric_date,
    r.impressions,
    r.reach,
    r.clicks,
    r.link_clicks,
    r.conversions,
    r.all_conversions,
    r.spend,
    r.conversion_value,
    coalesce(r.extra_metrics, '{}'::jsonb),
    r.source_updated_at,
    now(),
    now()
  from jsonb_to_recordset(v_daily) as r(
    account_id text,
    metric_date date,
    impressions bigint,
    reach bigint,
    clicks bigint,
    link_clicks bigint,
    conversions numeric,
    all_conversions numeric,
    spend numeric,
    conversion_value numeric,
    extra_metrics jsonb,
    source_updated_at timestamptz
  )
  on conflict (client_id, source, account_id, metric_date)
  do update set
    impressions = excluded.impressions,
    reach = excluded.reach,
    clicks = excluded.clicks,
    link_clicks = excluded.link_clicks,
    conversions = excluded.conversions,
    all_conversions = excluded.all_conversions,
    spend = excluded.spend,
    conversion_value = excluded.conversion_value,
    extra_metrics = excluded.extra_metrics,
    source_updated_at = excluded.source_updated_at,
    ingested_at = excluded.ingested_at,
    updated_at = now();

  get diagnostics v_daily_count = row_count;

  if p_source = 'google_ads'
     and jsonb_array_length(v_daily) = 0
     and jsonb_array_length(v_campaign) > 0 then
    insert into public.dashboard_daily_metrics (
      client_id, source, account_id, metric_date, impressions, clicks,
      conversions, all_conversions, spend, conversion_value, extra_metrics,
      ingested_at, updated_at
    )
    select
      v_client_id,
      'google_ads',
      coalesce(nullif(r.account_id, ''), 'default'),
      r.metric_date,
      sum(r.impressions),
      sum(r.clicks),
      sum(r.conversions),
      sum(r.all_conversions),
      sum(r.spend),
      sum(r.conversion_value),
      '{}'::jsonb,
      now(),
      now()
    from jsonb_to_recordset(v_campaign) as r(
      account_id text,
      metric_date date,
      impressions bigint,
      clicks bigint,
      conversions numeric,
      all_conversions numeric,
      spend numeric,
      conversion_value numeric
    )
    group by r.account_id, r.metric_date
    on conflict (client_id, source, account_id, metric_date)
    do update set
      impressions = excluded.impressions,
      clicks = excluded.clicks,
      conversions = excluded.conversions,
      all_conversions = excluded.all_conversions,
      spend = excluded.spend,
      conversion_value = excluded.conversion_value,
      extra_metrics = excluded.extra_metrics,
      ingested_at = excluded.ingested_at,
      updated_at = now();

    get diagnostics v_daily_count = row_count;
  end if;

  insert into public.dashboard_sync_runs (
    client_id, source, idempotency_key, range_start, range_end, status,
    daily_rows, campaign_rows, ad_rows, crm_rows, completed_at
  )
  values (
    v_client_id, p_source, p_idempotency_key, p_range_start, p_range_end,
    'success', v_daily_count, v_campaign_count, v_ad_count, 0, now()
  )
  on conflict (client_id, source, idempotency_key)
  do update set
    range_start = excluded.range_start,
    range_end = excluded.range_end,
    status = excluded.status,
    daily_rows = excluded.daily_rows,
    campaign_rows = excluded.campaign_rows,
    ad_rows = excluded.ad_rows,
    crm_rows = excluded.crm_rows,
    completed_at = excluded.completed_at;

  return jsonb_build_object(
    'status', 'success',
    'client', p_client_slug,
    'source', p_source,
    'daily_rows', v_daily_count,
    'campaign_rows', v_campaign_count,
    'ad_rows', v_ad_count
  );
end;
$$;

revoke all on function public.upsert_dashboard_paid_media_batch(
  text, text, text, date, date, jsonb, jsonb, jsonb
) from public, anon, authenticated;

grant execute on function public.upsert_dashboard_paid_media_batch(
  text, text, text, date, date, jsonb, jsonb, jsonb
) to service_role;

;
