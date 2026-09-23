-- Ad groups and ad sets for the first paid-media dashboard version.

alter table public.dashboard_sync_runs
  add column if not exists group_rows integer not null default 0;

create table if not exists public.dashboard_ad_group_daily (
  id bigint generated always as identity primary key,
  client_id bigint not null references public.dashboard_clients(id) on delete cascade,
  source text not null,
  account_id text not null,
  campaign_id text not null,
  campaign_name text,
  group_kind text not null,
  group_id text not null,
  group_name text,
  group_status text,
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
  constraint dashboard_ad_group_daily_source_check
    check (source in ('google_ads', 'meta_ads')),
  constraint dashboard_ad_group_daily_kind_check
    check (group_kind in ('ad_group', 'ad_set')),
  constraint dashboard_ad_group_daily_source_kind_check
    check (
      (source = 'google_ads' and group_kind = 'ad_group')
      or (source = 'meta_ads' and group_kind = 'ad_set')
    ),
  constraint dashboard_ad_group_daily_extra_object_check
    check (jsonb_typeof(extra_metrics) = 'object'),
  unique (client_id, source, account_id, group_id, metric_date)
);

create index if not exists dashboard_ad_group_daily_client_source_date_idx
  on public.dashboard_ad_group_daily (client_id, source, metric_date desc);

create index if not exists dashboard_ad_group_daily_client_campaign_date_idx
  on public.dashboard_ad_group_daily (client_id, campaign_id, metric_date desc);

alter table public.dashboard_ad_group_daily enable row level security;

drop policy if exists dashboard_ad_group_daily_member_select
  on public.dashboard_ad_group_daily;

create policy dashboard_ad_group_daily_member_select
on public.dashboard_ad_group_daily
for select
to authenticated
using ((select private.is_dashboard_client_member(client_id)));

grant select on public.dashboard_ad_group_daily to authenticated;

create or replace function public.upsert_dashboard_paid_media_group_batch(
  p_client_slug text,
  p_source text,
  p_group_kind text,
  p_idempotency_key text,
  p_range_start date,
  p_range_end date,
  p_group_daily jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client_id bigint;
  v_group jsonb := coalesce(p_group_daily, '[]'::jsonb);
  v_group_count integer := 0;
  v_existing jsonb;
begin
  if not (
    (p_source = 'google_ads' and p_group_kind = 'ad_group')
    or (p_source = 'meta_ads' and p_group_kind = 'ad_set')
  ) then
    raise exception 'unsupported source and group kind: % / %', p_source, p_group_kind
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

  if jsonb_typeof(v_group) <> 'array' then
    raise exception 'p_group_daily must be a JSON array' using errcode = '22023';
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
    'group_rows', dsr.group_rows
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
    from jsonb_to_recordset(v_group) as r(metric_date date)
    where r.metric_date is null
       or r.metric_date < p_range_start
       or r.metric_date > p_range_end
  ) then
    raise exception 'one or more metric dates are outside the requested range'
      using errcode = '22023';
  end if;

  insert into public.dashboard_ad_group_daily (
    client_id, source, account_id, campaign_id, campaign_name,
    group_kind, group_id, group_name, group_status, metric_date,
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
    p_group_kind,
    r.group_id,
    r.group_name,
    r.group_status,
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
  from jsonb_to_recordset(v_group) as r(
    account_id text,
    campaign_id text,
    campaign_name text,
    group_id text,
    group_name text,
    group_status text,
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
    and nullif(r.group_id, '') is not null
  on conflict (client_id, source, account_id, group_id, metric_date)
  do update set
    campaign_id = excluded.campaign_id,
    campaign_name = excluded.campaign_name,
    group_kind = excluded.group_kind,
    group_name = excluded.group_name,
    group_status = excluded.group_status,
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

  get diagnostics v_group_count = row_count;

  insert into public.dashboard_sync_runs (
    client_id, source, idempotency_key, range_start, range_end, status,
    daily_rows, campaign_rows, group_rows, ad_rows, crm_rows, completed_at
  )
  values (
    v_client_id, p_source, p_idempotency_key, p_range_start, p_range_end,
    'success', 0, 0, v_group_count, 0, 0, now()
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
    crm_rows = excluded.crm_rows,
    completed_at = excluded.completed_at;

  return jsonb_build_object(
    'status', 'success',
    'client', p_client_slug,
    'source', p_source,
    'group_kind', p_group_kind,
    'group_rows', v_group_count
  );
end;
$$;

revoke all on function public.upsert_dashboard_paid_media_group_batch(
  text, text, text, text, date, date, jsonb
) from public, anon, authenticated;

grant execute on function public.upsert_dashboard_paid_media_group_batch(
  text, text, text, text, date, date, jsonb
) to service_role;

;
