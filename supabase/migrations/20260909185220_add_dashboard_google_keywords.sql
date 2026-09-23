
create table if not exists public.dashboard_keyword_daily (
  id bigint generated always as identity primary key,
  client_id bigint not null references public.dashboard_clients(id) on delete cascade,
  source text not null default 'google_ads' check (source = 'google_ads'),
  account_id text not null,
  campaign_id text not null,
  campaign_name text,
  ad_group_id text not null,
  ad_group_name text,
  keyword_id text not null,
  keyword_text text,
  keyword_match_type text,
  keyword_status text,
  metric_date date not null,
  impressions bigint,
  clicks bigint,
  conversions numeric,
  all_conversions numeric,
  spend numeric,
  conversion_value numeric,
  extra_metrics jsonb not null default '{}'::jsonb check (jsonb_typeof(extra_metrics) = 'object'),
  source_updated_at timestamptz,
  ingested_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, source, account_id, keyword_id, metric_date)
);

create index if not exists dashboard_keyword_daily_client_date_idx
  on public.dashboard_keyword_daily (client_id, metric_date);

alter table public.dashboard_keyword_daily enable row level security;

alter table public.dashboard_sync_runs
  add column if not exists keyword_rows integer not null default 0;

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
set search_path to ''
as $function$
declare
  v_client_id bigint;
  v_rows integer := 0;
begin
  if p_client_slug is null or btrim(p_client_slug) = '' then
    raise exception 'client_slug is required' using errcode = '22023';
  end if;
  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'idempotency_key is required' using errcode = '22023';
  end if;
  if p_range_start is null or p_range_end is null or p_range_start > p_range_end then
    raise exception 'invalid date range' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_keyword_daily, '[]'::jsonb)) <> 'array' then
    raise exception 'keyword_daily must be an array' using errcode = '22023';
  end if;

  select id into v_client_id
  from public.dashboard_clients
  where slug = p_client_slug;

  if v_client_id is null then
    raise exception 'dashboard client not found' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('dashboard_keyword:' || p_client_slug || ':' || p_idempotency_key));

  insert into public.dashboard_keyword_daily (
    client_id, source, account_id, campaign_id, campaign_name, ad_group_id, ad_group_name,
    keyword_id, keyword_text, keyword_match_type, keyword_status, metric_date,
    impressions, clicks, conversions, all_conversions, spend, conversion_value,
    extra_metrics, source_updated_at
  )
  select
    v_client_id,
    'google_ads',
    nullif(row_data ->> 'account_id', ''),
    nullif(row_data ->> 'campaign_id', ''),
    nullif(row_data ->> 'campaign_name', ''),
    nullif(row_data ->> 'ad_group_id', ''),
    nullif(row_data ->> 'ad_group_name', ''),
    nullif(row_data ->> 'keyword_id', ''),
    nullif(row_data ->> 'keyword_text', ''),
    nullif(row_data ->> 'keyword_match_type', ''),
    nullif(row_data ->> 'keyword_status', ''),
    nullif(row_data ->> 'metric_date', '')::date,
    nullif(row_data ->> 'impressions', '')::bigint,
    nullif(row_data ->> 'clicks', '')::bigint,
    nullif(row_data ->> 'conversions', '')::numeric,
    nullif(row_data ->> 'all_conversions', '')::numeric,
    nullif(row_data ->> 'spend', '')::numeric,
    nullif(row_data ->> 'conversion_value', '')::numeric,
    coalesce(row_data -> 'extra_metrics', '{}'::jsonb),
    nullif(row_data ->> 'source_updated_at', '')::timestamptz
  from jsonb_array_elements(coalesce(p_keyword_daily, '[]'::jsonb)) as rows(row_data)
  where nullif(row_data ->> 'account_id', '') is not null
    and nullif(row_data ->> 'campaign_id', '') is not null
    and nullif(row_data ->> 'ad_group_id', '') is not null
    and nullif(row_data ->> 'keyword_id', '') is not null
    and nullif(row_data ->> 'metric_date', '') is not null
  on conflict (client_id, source, account_id, keyword_id, metric_date) do update set
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
    client_id, source, idempotency_key, range_start, range_end, status, keyword_rows, completed_at
  )
  values (v_client_id, 'google_ads', p_idempotency_key, p_range_start, p_range_end, 'completed', v_rows, now())
  on conflict (client_id, source, idempotency_key) do update set
    range_start = excluded.range_start,
    range_end = excluded.range_end,
    status = excluded.status,
    keyword_rows = excluded.keyword_rows,
    completed_at = excluded.completed_at;

  return jsonb_build_object('status', 'ok', 'keyword_rows', v_rows);
end;
$function$;

create or replace function public.ingest_dashboard_keyword_rows(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_first jsonb;
  v_client_slug text;
  v_idempotency_key text;
  v_range_start date;
  v_range_end date;
  v_rows jsonb;
begin
  if jsonb_typeof(payload) <> 'array' or jsonb_array_length(payload) = 0 then
    raise exception 'payload must be a non-empty array' using errcode = '22023';
  end if;

  v_first := payload -> 0;
  v_client_slug := nullif(v_first ->> 'client_slug', '');
  v_idempotency_key := nullif(v_first ->> 'idempotency_key', '');
  v_range_start := nullif(v_first ->> 'range_start', '')::date;
  v_range_end := nullif(v_first ->> 'range_end', '')::date;

  if nullif(v_first ->> 'source', '') <> 'google_ads'
     or nullif(v_first ->> 'record_kind', '') <> 'keyword' then
    raise exception 'invalid keyword payload context' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(row_data - 'client_slug' - 'source' - 'record_kind' - 'idempotency_key' - 'range_start' - 'range_end'), '[]'::jsonb)
    into v_rows
  from jsonb_array_elements(payload) as rows(row_data);

  return public.upsert_dashboard_keyword_batch(
    v_client_slug, v_idempotency_key, v_range_start, v_range_end, v_rows
  );
end;
$function$;

create or replace function public.get_dashboard_entities(
  p_client_slug text,
  p_source text,
  p_level text,
  p_start_date date,
  p_end_date date,
  p_limit integer default 25,
  p_cursor jsonb default null
)
returns jsonb
language plpgsql
stable
set search_path to ''
as $function$
declare
  v_client_id bigint;
  v_limit integer;
  v_cursor_spend numeric;
  v_cursor_id text;
  v_result jsonb;
begin
  if p_source not in ('google_ads', 'meta_ads') then
    raise exception 'unsupported dashboard source' using errcode = '22023';
  end if;
  if p_level not in ('campaign', 'group', 'ad', 'keyword') then
    raise exception 'unsupported dashboard entity level' using errcode = '22023';
  end if;
  if p_level = 'keyword' and p_source <> 'google_ads' then
    raise exception 'keywords are available only for google_ads' using errcode = '22023';
  end if;
  if p_start_date is null or p_end_date is null or p_start_date > p_end_date then
    raise exception 'invalid date range' using errcode = '22023';
  end if;

  v_limit := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_cursor_spend := nullif(p_cursor ->> 'spend', '')::numeric;
  v_cursor_id := nullif(p_cursor ->> 'id', '');
  v_client_id := private.dashboard_read_client_id(p_client_slug);

  with normalized as (
    select 'campaign'::text as level, dcd.source, dcd.campaign_id as item_id,
      coalesce(max(dcd.campaign_name), dcd.campaign_id) as item_name, max(dcd.campaign_status) as item_status,
      null::text as parent_id, null::text as parent_name,
      sum(dcd.spend)::numeric as spend, sum(dcd.impressions)::numeric as impressions, sum(dcd.reach)::numeric as reach,
      sum(dcd.clicks)::numeric as clicks, sum(dcd.link_clicks)::numeric as link_clicks,
      sum(dcd.conversions)::numeric as results, sum(dcd.all_conversions)::numeric as all_conversions, sum(dcd.conversion_value)::numeric as conversion_value
    from public.dashboard_campaign_daily dcd
    where p_level = 'campaign' and dcd.client_id = v_client_id and dcd.source = p_source and dcd.metric_date between p_start_date and p_end_date
    group by dcd.source, dcd.campaign_id
    union all
    select 'group'::text, dag.source, dag.group_id, coalesce(max(dag.group_name), dag.group_id), max(dag.group_status),
      dag.campaign_id, max(dag.campaign_name), sum(dag.spend)::numeric, sum(dag.impressions)::numeric, sum(dag.reach)::numeric,
      sum(dag.clicks)::numeric, sum(dag.link_clicks)::numeric, sum(dag.conversions)::numeric, sum(dag.all_conversions)::numeric, sum(dag.conversion_value)::numeric
    from public.dashboard_ad_group_daily dag
    where p_level = 'group' and dag.client_id = v_client_id and dag.source = p_source and dag.metric_date between p_start_date and p_end_date
    group by dag.source, dag.group_id, dag.campaign_id
    union all
    select 'ad'::text, dad.source, dad.ad_id, coalesce(max(dad.ad_name), dad.ad_id), max(dad.ad_status),
      coalesce(nullif(dad.adset_id, ''), dad.campaign_id), coalesce(max(dad.adset_name), max(dad.campaign_name)),
      sum(dad.spend)::numeric, sum(dad.impressions)::numeric, sum(dad.reach)::numeric, sum(dad.clicks)::numeric, sum(dad.link_clicks)::numeric,
      sum(dad.conversions)::numeric, sum(dad.all_conversions)::numeric, sum(dad.conversion_value)::numeric
    from public.dashboard_ad_daily dad
    where p_level = 'ad' and dad.client_id = v_client_id and dad.source = p_source and dad.metric_date between p_start_date and p_end_date
    group by dad.source, dad.ad_id, dad.adset_id, dad.campaign_id
    union all
    select 'keyword'::text, dkd.source, dkd.keyword_id, coalesce(max(dkd.keyword_text), dkd.keyword_id), max(dkd.keyword_status),
      dkd.ad_group_id, coalesce(max(dkd.ad_group_name), max(dkd.campaign_name)),
      sum(dkd.spend)::numeric, sum(dkd.impressions)::numeric, null::numeric as reach,
      sum(dkd.clicks)::numeric, null::numeric as link_clicks, sum(dkd.conversions)::numeric, sum(dkd.all_conversions)::numeric, sum(dkd.conversion_value)::numeric
    from public.dashboard_keyword_daily dkd
    where p_level = 'keyword' and dkd.client_id = v_client_id and dkd.source = p_source and dkd.metric_date between p_start_date and p_end_date
    group by dkd.source, dkd.keyword_id, dkd.ad_group_id
  ),
  enriched as (
    select n.*, coalesce(n.spend, 0) as sort_spend,
      n.clicks * 100 / nullif(n.impressions, 0) as ctr,
      n.link_clicks * 100 / nullif(n.impressions, 0) as link_ctr,
      n.spend / nullif(n.clicks, 0) as cpc,
      n.spend / nullif(n.link_clicks, 0) as link_cpc,
      n.spend * 1000 / nullif(n.impressions, 0) as cpm,
      n.spend / nullif(n.results, 0) as cost_per_result
    from normalized n
  ),
  filtered as (
    select e.* from enriched e
    where v_cursor_spend is null or e.sort_spend < v_cursor_spend or (e.sort_spend = v_cursor_spend and e.item_id > v_cursor_id)
  ),
  limited as (
    select f.* from filtered f order by f.sort_spend desc, f.item_id limit v_limit + 1
  ),
  visible as (
    select l.* from limited l order by l.sort_spend desc, l.item_id limit v_limit
  )
  select jsonb_build_object(
    'items', coalesce((select jsonb_agg(to_jsonb(v) - 'sort_spend' order by v.sort_spend desc, v.item_id) from visible v), '[]'::jsonb),
    'total_count', (select count(*) from enriched),
    'next_cursor', case when (select count(*) from limited) > v_limit then (
      select jsonb_build_object('spend', v.sort_spend, 'id', v.item_id) from visible v order by v.sort_spend asc, v.item_id desc limit 1
    ) else null end
  ) into v_result;

  return v_result;
end;
$function$;

revoke all on function public.upsert_dashboard_keyword_batch(text, text, date, date, jsonb) from public, anon, authenticated;
revoke all on function public.ingest_dashboard_keyword_rows(jsonb) from public, anon, authenticated;
grant execute on function public.ingest_dashboard_keyword_rows(jsonb) to service_role;
;
