create or replace function public.upsert_dashboard_keyword_batch(
  p_client_slug text,
  p_idempotency_key text,
  p_range_start date,
  p_range_end date,
  p_keyword_daily jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client_id bigint;
  v_keyword jsonb := coalesce(p_keyword_daily, '[]'::jsonb);
  v_rows integer := 0;
  v_existing jsonb;
begin
  if p_client_slug is null or pg_catalog.btrim(p_client_slug) = '' then
    raise exception 'client_slug is required' using errcode = '22023';
  end if;

  if p_idempotency_key is null
     or pg_catalog.length(pg_catalog.btrim(p_idempotency_key)) < 8
     or pg_catalog.length(p_idempotency_key) > 240 then
    raise exception 'invalid idempotency key' using errcode = '22023';
  end if;

  if p_range_start is null
     or p_range_end is null
     or p_range_start > p_range_end then
    raise exception 'invalid date range' using errcode = '22023';
  end if;

  if jsonb_typeof(v_keyword) <> 'array' then
    raise exception 'keyword_daily must be an array' using errcode = '22023';
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
      p_client_slug || '|google_ads|' || p_idempotency_key,
      0
    )
  );

  select jsonb_build_object(
    'status', 'already_processed',
    'sync_run_id', dsr.id,
    'keyword_rows', dsr.keyword_rows
  )
  into v_existing
  from public.dashboard_sync_runs dsr
  where dsr.client_id = v_client_id
    and dsr.source = 'google_ads'
    and dsr.idempotency_key = p_idempotency_key
    and dsr.status = 'success';

  if v_existing is not null then
    return v_existing;
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(v_keyword) as r(metric_date date)
    where r.metric_date is null
       or r.metric_date < p_range_start
       or r.metric_date > p_range_end
  ) then
    raise exception 'one or more keyword metric dates are outside the requested range'
      using errcode = '22023';
  end if;

  insert into public.dashboard_keyword_daily (
    client_id, source, account_id, campaign_id, campaign_name,
    ad_group_id, ad_group_name, keyword_id, keyword_text,
    keyword_match_type, keyword_status, metric_date, impressions, clicks,
    conversions, all_conversions, spend, conversion_value, extra_metrics,
    source_updated_at, updated_at
  )
  select
    v_client_id,
    'google_ads',
    nullif(r.account_id, ''),
    nullif(r.campaign_id, ''),
    r.campaign_name,
    nullif(r.ad_group_id, ''),
    r.ad_group_name,
    nullif(r.keyword_id, ''),
    r.keyword_text,
    r.keyword_match_type,
    r.keyword_status,
    r.metric_date,
    r.impressions,
    r.clicks,
    r.conversions,
    r.all_conversions,
    r.spend,
    r.conversion_value,
    coalesce(r.extra_metrics, '{}'::jsonb),
    r.source_updated_at,
    now()
  from jsonb_to_recordset(v_keyword) as r(
    account_id text,
    campaign_id text,
    campaign_name text,
    ad_group_id text,
    ad_group_name text,
    keyword_id text,
    keyword_text text,
    keyword_match_type text,
    keyword_status text,
    metric_date date,
    impressions bigint,
    clicks bigint,
    conversions numeric,
    all_conversions numeric,
    spend numeric,
    conversion_value numeric,
    extra_metrics jsonb,
    source_updated_at timestamptz
  )
  where nullif(r.account_id, '') is not null
    and nullif(r.campaign_id, '') is not null
    and nullif(r.ad_group_id, '') is not null
    and nullif(r.keyword_id, '') is not null
  on conflict (client_id, source, account_id, keyword_id, metric_date)
  do update set
    campaign_id = excluded.campaign_id,
    campaign_name = excluded.campaign_name,
    ad_group_id = excluded.ad_group_id,
    ad_group_name = excluded.ad_group_name,
    keyword_text = excluded.keyword_text,
    keyword_match_type = excluded.keyword_match_type,
    keyword_status = excluded.keyword_status,
    impressions = excluded.impressions,
    clicks = excluded.clicks,
    conversions = excluded.conversions,
    all_conversions = excluded.all_conversions,
    spend = excluded.spend,
    conversion_value = excluded.conversion_value,
    extra_metrics = excluded.extra_metrics,
    source_updated_at = excluded.source_updated_at,
    updated_at = now();

  get diagnostics v_rows = row_count;

  insert into public.dashboard_sync_runs (
    client_id, source, idempotency_key, range_start, range_end, status,
    daily_rows, campaign_rows, group_rows, ad_rows, keyword_rows,
    asset_group_rows, asset_rows, crm_rows, completed_at
  )
  values (
    v_client_id, 'google_ads', p_idempotency_key, p_range_start, p_range_end,
    'success', 0, 0, 0, 0, v_rows, 0, 0, 0, now()
  )
  on conflict (client_id, source, idempotency_key)
  do update set
    range_start = excluded.range_start,
    range_end = excluded.range_end,
    status = excluded.status,
    daily_rows = excluded.daily_rows,
    campaign_rows = excluded.campaign_rows,
    group_rows = excluded.group_rows,
    ad_rows = excluded.ad_rows,
    keyword_rows = excluded.keyword_rows,
    asset_group_rows = excluded.asset_group_rows,
    asset_rows = excluded.asset_rows,
    crm_rows = excluded.crm_rows,
    completed_at = excluded.completed_at;

  return jsonb_build_object(
    'status', 'success',
    'client', p_client_slug,
    'source', 'google_ads',
    'keyword_rows', v_rows
  );
end;
$$;

revoke all on function public.upsert_dashboard_keyword_batch(
  text, text, date, date, jsonb
) from public, anon, authenticated;

grant execute on function public.upsert_dashboard_keyword_batch(
  text, text, date, date, jsonb
) to service_role;
