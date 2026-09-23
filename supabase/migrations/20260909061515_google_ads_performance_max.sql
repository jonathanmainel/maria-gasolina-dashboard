-- Performance Max reporting for Google Ads.
-- Stores daily asset-group performance and daily asset performance/content.

alter table public.dashboard_sync_runs
  add column if not exists asset_group_rows integer not null default 0,
  add column if not exists asset_rows integer not null default 0;

create table if not exists public.dashboard_pmax_asset_group_daily (
  id bigint generated always as identity primary key,
  client_id bigint not null references public.dashboard_clients(id) on delete cascade,
  source text not null default 'google_ads',
  account_id text not null,
  campaign_id text not null,
  campaign_name text,
  campaign_status text,
  asset_group_id text not null,
  asset_group_name text,
  asset_group_status text,
  primary_status text,
  ad_strength text,
  metric_date date not null,
  impressions bigint,
  clicks bigint,
  conversions numeric(20, 6),
  all_conversions numeric(20, 6),
  spend numeric(20, 6),
  conversion_value numeric(20, 6),
  extra_metrics jsonb not null default '{}'::jsonb,
  source_updated_at timestamptz,
  ingested_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dashboard_pmax_asset_group_daily_source_check
    check (source = 'google_ads'),
  constraint dashboard_pmax_asset_group_daily_extra_object_check
    check (jsonb_typeof(extra_metrics) = 'object'),
  unique (client_id, source, account_id, asset_group_id, metric_date)
);

create index if not exists dashboard_pmax_asset_group_client_date_idx
  on public.dashboard_pmax_asset_group_daily (client_id, metric_date desc);

create index if not exists dashboard_pmax_asset_group_campaign_date_idx
  on public.dashboard_pmax_asset_group_daily
  (client_id, campaign_id, metric_date desc);

alter table public.dashboard_pmax_asset_group_daily enable row level security;

drop policy if exists dashboard_pmax_asset_group_member_select
  on public.dashboard_pmax_asset_group_daily;

create policy dashboard_pmax_asset_group_member_select
on public.dashboard_pmax_asset_group_daily
for select
to authenticated
using ((select private.is_dashboard_client_member(client_id)));

grant select on public.dashboard_pmax_asset_group_daily to authenticated;

create table if not exists public.dashboard_pmax_asset_daily (
  id bigint generated always as identity primary key,
  client_id bigint not null references public.dashboard_clients(id) on delete cascade,
  source text not null default 'google_ads',
  account_id text not null,
  campaign_id text not null,
  campaign_name text,
  asset_group_id text not null,
  asset_group_name text,
  asset_resource_name text,
  asset_id text not null,
  asset_name text,
  asset_type text,
  field_type text not null,
  asset_status text,
  performance_label text,
  text_content text,
  image_url text,
  youtube_video_id text,
  metric_date date not null,
  impressions bigint,
  clicks bigint,
  conversions numeric(20, 6),
  all_conversions numeric(20, 6),
  spend numeric(20, 6),
  conversion_value numeric(20, 6),
  extra_metrics jsonb not null default '{}'::jsonb,
  source_updated_at timestamptz,
  ingested_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dashboard_pmax_asset_daily_source_check
    check (source = 'google_ads'),
  constraint dashboard_pmax_asset_daily_extra_object_check
    check (jsonb_typeof(extra_metrics) = 'object'),
  unique (
    client_id, source, account_id, asset_group_id,
    asset_id, field_type, metric_date
  )
);

create index if not exists dashboard_pmax_asset_client_date_idx
  on public.dashboard_pmax_asset_daily (client_id, metric_date desc);

create index if not exists dashboard_pmax_asset_group_date_idx
  on public.dashboard_pmax_asset_daily
  (client_id, asset_group_id, metric_date desc);

create index if not exists dashboard_pmax_asset_campaign_date_idx
  on public.dashboard_pmax_asset_daily
  (client_id, campaign_id, metric_date desc);

alter table public.dashboard_pmax_asset_daily enable row level security;

drop policy if exists dashboard_pmax_asset_member_select
  on public.dashboard_pmax_asset_daily;

create policy dashboard_pmax_asset_member_select
on public.dashboard_pmax_asset_daily
for select
to authenticated
using ((select private.is_dashboard_client_member(client_id)));

grant select on public.dashboard_pmax_asset_daily to authenticated;

create or replace function public.ingest_dashboard_pmax_rows(jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payload jsonb := coalesce($1, '[]'::jsonb);
  v_first jsonb;
  v_rows jsonb;
  v_client_id bigint;
  v_client_slug text;
  v_source text;
  v_record_kind text;
  v_idempotency_key text;
  v_range_start date;
  v_range_end date;
  v_row_count integer := 0;
  v_existing jsonb;
begin
  if jsonb_typeof(v_payload) <> 'array' or jsonb_array_length(v_payload) = 0 then
    raise exception 'payload must be a non-empty JSON array' using errcode = '22023';
  end if;

  v_first := v_payload -> 0;
  v_client_slug := nullif(v_first ->> 'client_slug', '');
  v_source := nullif(v_first ->> 'source', '');
  v_record_kind := nullif(v_first ->> 'record_kind', '');
  v_idempotency_key := nullif(v_first ->> 'idempotency_key', '');
  v_range_start := nullif(v_first ->> 'range_start', '')::date;
  v_range_end := nullif(v_first ->> 'range_end', '')::date;

  if v_client_slug is null
     or v_source is null
     or v_record_kind is null
     or v_idempotency_key is null
     or v_range_start is null
     or v_range_end is null then
    raise exception 'batch context is incomplete; sample row: %', left(v_first::text, 1200)
      using errcode = '22023';
  end if;

  if v_source <> 'google_ads' then
    raise exception 'unsupported Performance Max source: %', v_source
      using errcode = '22023';
  end if;

  if v_record_kind not in ('pmax_asset_group', 'pmax_asset') then
    raise exception 'unsupported Performance Max record kind: %', v_record_kind
      using errcode = '22023';
  end if;

  if v_range_start > v_range_end then
    raise exception 'invalid date range' using errcode = '22023';
  end if;

  if length(trim(v_idempotency_key)) < 8 or length(v_idempotency_key) > 240 then
    raise exception 'invalid idempotency key' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_payload) as item(value)
    where item.value ->> 'client_slug' is distinct from v_client_slug
       or item.value ->> 'source' is distinct from v_source
       or item.value ->> 'record_kind' is distinct from v_record_kind
       or item.value ->> 'idempotency_key' is distinct from v_idempotency_key
       or item.value ->> 'range_start' is distinct from v_range_start::text
       or item.value ->> 'range_end' is distinct from v_range_end::text
  ) then
    raise exception 'batch context must be identical on every row' using errcode = '22023';
  end if;

  select jsonb_agg(
    item.value
      - 'client_slug'
      - 'source'
      - 'record_kind'
      - 'idempotency_key'
      - 'range_start'
      - 'range_end'
  )
  into v_rows
  from jsonb_array_elements(v_payload) as item(value);

  if exists (
    select 1
    from jsonb_array_elements(v_rows) as item(value)
    where nullif(item.value ->> 'metric_date', '') is null
       or (item.value ->> 'metric_date')::date < v_range_start
       or (item.value ->> 'metric_date')::date > v_range_end
  ) then
    raise exception 'metric date is missing or outside the batch range; sample row: %',
      left((v_rows -> 0)::text, 1200)
      using errcode = '22023';
  end if;

  select dc.id
  into v_client_id
  from public.dashboard_clients dc
  where dc.slug = v_client_slug
    and dc.active = true;

  if v_client_id is null then
    raise exception 'active dashboard client not found: %', v_client_slug
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_client_slug || '|' || v_source || '|' || v_idempotency_key,
      0
    )
  );

  select jsonb_build_object(
    'status', 'already_processed',
    'sync_run_id', dsr.id,
    'asset_group_rows', dsr.asset_group_rows,
    'asset_rows', dsr.asset_rows
  )
  into v_existing
  from public.dashboard_sync_runs dsr
  where dsr.client_id = v_client_id
    and dsr.source = v_source
    and dsr.idempotency_key = v_idempotency_key
    and dsr.status = 'success';

  if v_existing is not null then
    return v_existing;
  end if;

  if v_record_kind = 'pmax_asset_group' then
    insert into public.dashboard_pmax_asset_group_daily (
      client_id, source, account_id, campaign_id, campaign_name,
      campaign_status, asset_group_id, asset_group_name, asset_group_status,
      primary_status, ad_strength, metric_date, impressions, clicks,
      conversions, all_conversions, spend, conversion_value, extra_metrics,
      source_updated_at, ingested_at, updated_at
    )
    select
      v_client_id,
      v_source,
      coalesce(nullif(r.account_id, ''), 'default'),
      r.campaign_id,
      r.campaign_name,
      r.campaign_status,
      r.asset_group_id,
      r.asset_group_name,
      r.asset_group_status,
      r.primary_status,
      r.ad_strength,
      r.metric_date,
      r.impressions,
      r.clicks,
      r.conversions,
      r.all_conversions,
      r.spend,
      r.conversion_value,
      coalesce(r.extra_metrics, '{}'::jsonb),
      r.source_updated_at,
      now(),
      now()
    from jsonb_to_recordset(v_rows) as r(
      account_id text,
      campaign_id text,
      campaign_name text,
      campaign_status text,
      asset_group_id text,
      asset_group_name text,
      asset_group_status text,
      primary_status text,
      ad_strength text,
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
    where nullif(r.campaign_id, '') is not null
      and nullif(r.asset_group_id, '') is not null
    on conflict (client_id, source, account_id, asset_group_id, metric_date)
    do update set
      campaign_id = excluded.campaign_id,
      campaign_name = excluded.campaign_name,
      campaign_status = excluded.campaign_status,
      asset_group_name = excluded.asset_group_name,
      asset_group_status = excluded.asset_group_status,
      primary_status = excluded.primary_status,
      ad_strength = excluded.ad_strength,
      impressions = excluded.impressions,
      clicks = excluded.clicks,
      conversions = excluded.conversions,
      all_conversions = excluded.all_conversions,
      spend = excluded.spend,
      conversion_value = excluded.conversion_value,
      extra_metrics = excluded.extra_metrics,
      source_updated_at = excluded.source_updated_at,
      ingested_at = excluded.ingested_at,
      updated_at = now();
  else
    insert into public.dashboard_pmax_asset_daily (
      client_id, source, account_id, campaign_id, campaign_name,
      asset_group_id, asset_group_name, asset_resource_name, asset_id,
      asset_name, asset_type, field_type, asset_status, performance_label,
      text_content, image_url, youtube_video_id, metric_date, impressions,
      clicks, conversions, all_conversions, spend, conversion_value,
      extra_metrics, source_updated_at, ingested_at, updated_at
    )
    select
      v_client_id,
      v_source,
      coalesce(nullif(r.account_id, ''), 'default'),
      r.campaign_id,
      r.campaign_name,
      r.asset_group_id,
      r.asset_group_name,
      r.asset_resource_name,
      r.asset_id,
      r.asset_name,
      r.asset_type,
      r.field_type,
      r.asset_status,
      r.performance_label,
      r.text_content,
      r.image_url,
      r.youtube_video_id,
      r.metric_date,
      r.impressions,
      r.clicks,
      r.conversions,
      r.all_conversions,
      r.spend,
      r.conversion_value,
      coalesce(r.extra_metrics, '{}'::jsonb),
      r.source_updated_at,
      now(),
      now()
    from jsonb_to_recordset(v_rows) as r(
      account_id text,
      campaign_id text,
      campaign_name text,
      asset_group_id text,
      asset_group_name text,
      asset_resource_name text,
      asset_id text,
      asset_name text,
      asset_type text,
      field_type text,
      asset_status text,
      performance_label text,
      text_content text,
      image_url text,
      youtube_video_id text,
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
    where nullif(r.campaign_id, '') is not null
      and nullif(r.asset_group_id, '') is not null
      and nullif(r.asset_id, '') is not null
      and nullif(r.field_type, '') is not null
    on conflict (
      client_id, source, account_id, asset_group_id,
      asset_id, field_type, metric_date
    )
    do update set
      campaign_id = excluded.campaign_id,
      campaign_name = excluded.campaign_name,
      asset_group_name = excluded.asset_group_name,
      asset_resource_name = excluded.asset_resource_name,
      asset_name = excluded.asset_name,
      asset_type = excluded.asset_type,
      asset_status = excluded.asset_status,
      performance_label = excluded.performance_label,
      text_content = excluded.text_content,
      image_url = excluded.image_url,
      youtube_video_id = excluded.youtube_video_id,
      impressions = excluded.impressions,
      clicks = excluded.clicks,
      conversions = excluded.conversions,
      all_conversions = excluded.all_conversions,
      spend = excluded.spend,
      conversion_value = excluded.conversion_value,
      extra_metrics = excluded.extra_metrics,
      source_updated_at = excluded.source_updated_at,
      ingested_at = excluded.ingested_at,
      updated_at = now();
  end if;

  get diagnostics v_row_count = row_count;

  insert into public.dashboard_sync_runs (
    client_id, source, idempotency_key, range_start, range_end, status,
    daily_rows, campaign_rows, group_rows, ad_rows, asset_group_rows,
    asset_rows, crm_rows, completed_at
  )
  values (
    v_client_id, v_source, v_idempotency_key, v_range_start, v_range_end,
    'success', 0, 0, 0, 0,
    case when v_record_kind = 'pmax_asset_group' then v_row_count else 0 end,
    case when v_record_kind = 'pmax_asset' then v_row_count else 0 end,
    0, now()
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
    asset_group_rows = excluded.asset_group_rows,
    asset_rows = excluded.asset_rows,
    crm_rows = excluded.crm_rows,
    completed_at = excluded.completed_at;

  return jsonb_build_object(
    'status', 'success',
    'client', v_client_slug,
    'source', v_source,
    'record_kind', v_record_kind,
    'rows', v_row_count
  );
end;
$$;

revoke all on function public.ingest_dashboard_pmax_rows(jsonb)
  from public, anon, authenticated;

grant execute on function public.ingest_dashboard_pmax_rows(jsonb)
  to service_role;

;
