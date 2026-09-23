-- Maria Gasolina dashboard ingestion
-- Run this migration in the Supabase SQL editor.

create table if not exists public.dashboard_clients (
  id bigint generated always as identity primary key,
  slug text not null unique,
  name text not null,
  timezone text not null default 'America/Sao_Paulo',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dashboard_clients_slug_format_check
    check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create table if not exists public.dashboard_client_users (
  client_id bigint not null references public.dashboard_clients(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer',
  created_at timestamptz not null default now(),
  primary key (client_id, user_id),
  constraint dashboard_client_users_role_check
    check (role in ('viewer', 'manager', 'admin'))
);

create table if not exists public.dashboard_daily_metrics (
  id bigint generated always as identity primary key,
  client_id bigint not null references public.dashboard_clients(id) on delete cascade,
  source text not null,
  account_id text not null,
  metric_date date not null,
  impressions bigint,
  reach bigint,
  clicks bigint,
  link_clicks bigint,
  sessions bigint,
  engaged_sessions bigint,
  active_users bigint,
  new_users bigint,
  views bigint,
  events bigint,
  conversions numeric(20, 6),
  spend numeric(20, 6),
  revenue numeric(20, 6),
  extra_metrics jsonb not null default '{}'::jsonb,
  source_updated_at timestamptz,
  ingested_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dashboard_daily_metrics_source_check
    check (source in ('google_ads', 'meta_ads', 'ga4', 'crm_ello')),
  constraint dashboard_daily_metrics_extra_object_check
    check (jsonb_typeof(extra_metrics) = 'object'),
  unique (client_id, source, account_id, metric_date)
);

create table if not exists public.dashboard_campaign_daily (
  id bigint generated always as identity primary key,
  client_id bigint not null references public.dashboard_clients(id) on delete cascade,
  source text not null,
  account_id text not null,
  campaign_id text not null,
  campaign_name text,
  campaign_status text,
  metric_date date not null,
  impressions bigint,
  reach bigint,
  clicks bigint,
  link_clicks bigint,
  conversions numeric(20, 6),
  spend numeric(20, 6),
  conversion_value numeric(20, 6),
  extra_metrics jsonb not null default '{}'::jsonb,
  source_updated_at timestamptz,
  ingested_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dashboard_campaign_daily_source_check
    check (source in ('google_ads', 'meta_ads')),
  constraint dashboard_campaign_daily_extra_object_check
    check (jsonb_typeof(extra_metrics) = 'object'),
  unique (client_id, source, account_id, campaign_id, metric_date)
);

create table if not exists public.dashboard_crm_funnel_daily (
  id bigint generated always as identity primary key,
  client_id bigint not null references public.dashboard_clients(id) on delete cascade,
  source text not null default 'crm_ello',
  account_id text not null,
  metric_date date not null,
  stage_key text not null,
  stage_name text not null,
  origin_key text not null default '',
  origin_name text,
  leads_count bigint,
  contracts_count bigint,
  contract_value numeric(20, 6),
  extra_metrics jsonb not null default '{}'::jsonb,
  source_updated_at timestamptz,
  ingested_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dashboard_crm_funnel_daily_source_check
    check (source = 'crm_ello'),
  constraint dashboard_crm_funnel_daily_extra_object_check
    check (jsonb_typeof(extra_metrics) = 'object'),
  unique (client_id, source, account_id, metric_date, stage_key, origin_key)
);

create table if not exists public.dashboard_sync_runs (
  id bigint generated always as identity primary key,
  client_id bigint not null references public.dashboard_clients(id) on delete cascade,
  source text not null,
  idempotency_key text not null,
  range_start date not null,
  range_end date not null,
  status text not null default 'success',
  daily_rows integer not null default 0,
  campaign_rows integer not null default 0,
  crm_rows integer not null default 0,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint dashboard_sync_runs_source_check
    check (source in ('google_ads', 'meta_ads', 'ga4', 'crm_ello')),
  constraint dashboard_sync_runs_status_check
    check (status in ('success', 'failed')),
  constraint dashboard_sync_runs_range_check
    check (range_start <= range_end),
  constraint dashboard_sync_runs_idempotency_key_check
    check (length(idempotency_key) between 8 and 240),
  unique (client_id, source, idempotency_key)
);

create index if not exists dashboard_client_users_user_client_idx
  on public.dashboard_client_users (user_id, client_id);

create index if not exists dashboard_daily_metrics_client_source_date_idx
  on public.dashboard_daily_metrics (client_id, source, metric_date desc);

create index if not exists dashboard_campaign_daily_client_source_date_idx
  on public.dashboard_campaign_daily (client_id, source, metric_date desc);

create index if not exists dashboard_campaign_daily_client_campaign_date_idx
  on public.dashboard_campaign_daily (client_id, campaign_id, metric_date desc);

create index if not exists dashboard_crm_funnel_daily_client_date_idx
  on public.dashboard_crm_funnel_daily (client_id, metric_date desc);

create index if not exists dashboard_sync_runs_client_source_date_idx
  on public.dashboard_sync_runs (client_id, source, completed_at desc);

insert into public.dashboard_clients (slug, name, timezone)
values ('maria-gasolina', 'Maria Gasolina', 'America/Sao_Paulo')
on conflict (slug) do update
set name = excluded.name,
    timezone = excluded.timezone,
    active = true,
    updated_at = now();

create or replace function public.is_dashboard_client_member(p_client_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.dashboard_client_users dcu
    where dcu.client_id = p_client_id
      and dcu.user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_dashboard_client_member(bigint) from public;
grant execute on function public.is_dashboard_client_member(bigint) to authenticated;

alter table public.dashboard_clients enable row level security;
alter table public.dashboard_client_users enable row level security;
alter table public.dashboard_daily_metrics enable row level security;
alter table public.dashboard_campaign_daily enable row level security;
alter table public.dashboard_crm_funnel_daily enable row level security;
alter table public.dashboard_sync_runs enable row level security;

drop policy if exists dashboard_clients_member_select on public.dashboard_clients;
create policy dashboard_clients_member_select
on public.dashboard_clients
for select
to authenticated
using ((select public.is_dashboard_client_member(id)));

drop policy if exists dashboard_client_users_self_select on public.dashboard_client_users;
create policy dashboard_client_users_self_select
on public.dashboard_client_users
for select
to authenticated
using (user_id = (select auth.uid()));

drop policy if exists dashboard_daily_metrics_member_select on public.dashboard_daily_metrics;
create policy dashboard_daily_metrics_member_select
on public.dashboard_daily_metrics
for select
to authenticated
using ((select public.is_dashboard_client_member(client_id)));

drop policy if exists dashboard_campaign_daily_member_select on public.dashboard_campaign_daily;
create policy dashboard_campaign_daily_member_select
on public.dashboard_campaign_daily
for select
to authenticated
using ((select public.is_dashboard_client_member(client_id)));

drop policy if exists dashboard_crm_funnel_daily_member_select on public.dashboard_crm_funnel_daily;
create policy dashboard_crm_funnel_daily_member_select
on public.dashboard_crm_funnel_daily
for select
to authenticated
using ((select public.is_dashboard_client_member(client_id)));

drop policy if exists dashboard_sync_runs_member_select on public.dashboard_sync_runs;
create policy dashboard_sync_runs_member_select
on public.dashboard_sync_runs
for select
to authenticated
using ((select public.is_dashboard_client_member(client_id)));

grant select on public.dashboard_clients to authenticated;
grant select on public.dashboard_client_users to authenticated;
grant select on public.dashboard_daily_metrics to authenticated;
grant select on public.dashboard_campaign_daily to authenticated;
grant select on public.dashboard_crm_funnel_daily to authenticated;
grant select on public.dashboard_sync_runs to authenticated;

create or replace function public.upsert_dashboard_batch(
  p_client_slug text,
  p_source text,
  p_idempotency_key text,
  p_range_start date,
  p_range_end date,
  p_daily_metrics jsonb default '[]'::jsonb,
  p_campaign_daily jsonb default '[]'::jsonb,
  p_crm_funnel_daily jsonb default '[]'::jsonb
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
  v_crm jsonb := coalesce(p_crm_funnel_daily, '[]'::jsonb);
  v_daily_count integer := 0;
  v_campaign_count integer := 0;
  v_crm_count integer := 0;
  v_existing jsonb;
begin
  if p_source not in ('google_ads', 'meta_ads', 'ga4', 'crm_ello') then
    raise exception 'unsupported source: %', p_source using errcode = '22023';
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
     or jsonb_typeof(v_crm) <> 'array' then
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
    'crm_rows', dsr.crm_rows
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

  if p_source not in ('google_ads', 'meta_ads') and jsonb_array_length(v_campaign) > 0 then
    raise exception 'campaign_daily is only valid for ad sources' using errcode = '22023';
  end if;

  if p_source <> 'crm_ello' and jsonb_array_length(v_crm) > 0 then
    raise exception 'crm_funnel_daily is only valid for crm_ello' using errcode = '22023';
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
    from jsonb_to_recordset(v_crm) as r(metric_date date)
    where r.metric_date is null
       or r.metric_date < p_range_start
       or r.metric_date > p_range_end
  ) then
    raise exception 'one or more metric dates are outside the requested range'
      using errcode = '22023';
  end if;

  insert into public.dashboard_daily_metrics (
    client_id, source, account_id, metric_date, impressions, reach, clicks,
    link_clicks, sessions, engaged_sessions, active_users, new_users, views,
    events, conversions, spend, revenue, extra_metrics, source_updated_at,
    ingested_at, updated_at
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
    r.sessions,
    r.engaged_sessions,
    r.active_users,
    r.new_users,
    r.views,
    r.events,
    r.conversions,
    r.spend,
    r.revenue,
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
    sessions bigint,
    engaged_sessions bigint,
    active_users bigint,
    new_users bigint,
    views bigint,
    events bigint,
    conversions numeric,
    spend numeric,
    revenue numeric,
    extra_metrics jsonb,
    source_updated_at timestamptz
  )
  on conflict (client_id, source, account_id, metric_date)
  do update set
    impressions = excluded.impressions,
    reach = excluded.reach,
    clicks = excluded.clicks,
    link_clicks = excluded.link_clicks,
    sessions = excluded.sessions,
    engaged_sessions = excluded.engaged_sessions,
    active_users = excluded.active_users,
    new_users = excluded.new_users,
    views = excluded.views,
    events = excluded.events,
    conversions = excluded.conversions,
    spend = excluded.spend,
    revenue = excluded.revenue,
    extra_metrics = excluded.extra_metrics,
    source_updated_at = excluded.source_updated_at,
    ingested_at = excluded.ingested_at,
    updated_at = now();

  get diagnostics v_daily_count = row_count;

  insert into public.dashboard_campaign_daily (
    client_id, source, account_id, campaign_id, campaign_name,
    campaign_status, metric_date, impressions, reach, clicks, link_clicks,
    conversions, spend, conversion_value, extra_metrics, source_updated_at,
    ingested_at, updated_at
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
    spend = excluded.spend,
    conversion_value = excluded.conversion_value,
    extra_metrics = excluded.extra_metrics,
    source_updated_at = excluded.source_updated_at,
    ingested_at = excluded.ingested_at,
    updated_at = now();

  get diagnostics v_campaign_count = row_count;

  insert into public.dashboard_crm_funnel_daily (
    client_id, source, account_id, metric_date, stage_key, stage_name,
    origin_key, origin_name, leads_count, contracts_count, contract_value,
    extra_metrics, source_updated_at, ingested_at, updated_at
  )
  select
    v_client_id,
    'crm_ello',
    coalesce(nullif(r.account_id, ''), 'default'),
    r.metric_date,
    r.stage_key,
    r.stage_name,
    coalesce(r.origin_key, ''),
    r.origin_name,
    r.leads_count,
    r.contracts_count,
    r.contract_value,
    coalesce(r.extra_metrics, '{}'::jsonb),
    r.source_updated_at,
    now(),
    now()
  from jsonb_to_recordset(v_crm) as r(
    account_id text,
    metric_date date,
    stage_key text,
    stage_name text,
    origin_key text,
    origin_name text,
    leads_count bigint,
    contracts_count bigint,
    contract_value numeric,
    extra_metrics jsonb,
    source_updated_at timestamptz
  )
  where nullif(r.stage_key, '') is not null
    and nullif(r.stage_name, '') is not null
  on conflict (client_id, source, account_id, metric_date, stage_key, origin_key)
  do update set
    stage_name = excluded.stage_name,
    origin_name = excluded.origin_name,
    leads_count = excluded.leads_count,
    contracts_count = excluded.contracts_count,
    contract_value = excluded.contract_value,
    extra_metrics = excluded.extra_metrics,
    source_updated_at = excluded.source_updated_at,
    ingested_at = excluded.ingested_at,
    updated_at = now();

  get diagnostics v_crm_count = row_count;

  insert into public.dashboard_sync_runs (
    client_id, source, idempotency_key, range_start, range_end, status,
    daily_rows, campaign_rows, crm_rows, completed_at
  )
  values (
    v_client_id, p_source, p_idempotency_key, p_range_start, p_range_end,
    'success', v_daily_count, v_campaign_count, v_crm_count, now()
  )
  on conflict (client_id, source, idempotency_key)
  do update set
    range_start = excluded.range_start,
    range_end = excluded.range_end,
    status = excluded.status,
    daily_rows = excluded.daily_rows,
    campaign_rows = excluded.campaign_rows,
    crm_rows = excluded.crm_rows,
    completed_at = excluded.completed_at;

  return jsonb_build_object(
    'status', 'success',
    'client', p_client_slug,
    'source', p_source,
    'daily_rows', v_daily_count,
    'campaign_rows', v_campaign_count,
    'crm_rows', v_crm_count
  );
end;
$$;

revoke all on function public.upsert_dashboard_batch(
  text, text, text, date, date, jsonb, jsonb, jsonb
) from public, anon, authenticated;

grant execute on function public.upsert_dashboard_batch(
  text, text, text, date, date, jsonb, jsonb, jsonb
) to service_role;


;
