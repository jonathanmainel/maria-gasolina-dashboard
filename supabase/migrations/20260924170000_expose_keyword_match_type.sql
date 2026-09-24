-- Presentation metadata only: no metric, pagination, filter, or identity changes.
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
security invoker
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
      null::text as keyword_match_type,
      null::text as parent_id, null::text as parent_name,
      sum(dcd.spend)::numeric as spend, sum(dcd.impressions)::numeric as impressions, sum(dcd.reach)::numeric as reach,
      sum(dcd.clicks)::numeric as clicks, sum(dcd.link_clicks)::numeric as link_clicks,
      sum(dcd.conversions)::numeric as results, sum(dcd.all_conversions)::numeric as all_conversions, sum(dcd.conversion_value)::numeric as conversion_value
    from public.dashboard_campaign_daily dcd
    where p_level = 'campaign' and dcd.client_id = v_client_id and dcd.source = p_source and dcd.metric_date between p_start_date and p_end_date
    group by dcd.source, dcd.campaign_id
    union all
    select 'group'::text, dag.source, dag.group_id, coalesce(max(dag.group_name), dag.group_id), max(dag.group_status), null::text,
      dag.campaign_id, max(dag.campaign_name), sum(dag.spend)::numeric, sum(dag.impressions)::numeric, sum(dag.reach)::numeric,
      sum(dag.clicks)::numeric, sum(dag.link_clicks)::numeric, sum(dag.conversions)::numeric, sum(dag.all_conversions)::numeric, sum(dag.conversion_value)::numeric
    from public.dashboard_ad_group_daily dag
    where p_level = 'group' and dag.client_id = v_client_id and dag.source = p_source and dag.metric_date between p_start_date and p_end_date
    group by dag.source, dag.group_id, dag.campaign_id
    union all
    select 'ad'::text, dad.source, dad.ad_id, coalesce(max(dad.ad_name), dad.ad_id), max(dad.ad_status), null::text,
      coalesce(nullif(dad.adset_id, ''), dad.campaign_id), coalesce(max(dad.adset_name), max(dad.campaign_name)),
      sum(dad.spend)::numeric, sum(dad.impressions)::numeric, sum(dad.reach)::numeric, sum(dad.clicks)::numeric, sum(dad.link_clicks)::numeric,
      sum(dad.conversions)::numeric, sum(dad.all_conversions)::numeric, sum(dad.conversion_value)::numeric
    from public.dashboard_ad_daily dad
    where p_level = 'ad' and dad.client_id = v_client_id and dad.source = p_source and dad.metric_date between p_start_date and p_end_date
    group by dad.source, dad.ad_id, dad.adset_id, dad.campaign_id
    union all
    select 'keyword'::text, dkd.source, dkd.keyword_id, coalesce(max(dkd.keyword_text), dkd.keyword_id), max(dkd.keyword_status),
      case when count(dkd.keyword_match_type) = count(*) and count(distinct dkd.keyword_match_type) = 1
        then min(dkd.keyword_match_type) else null end,
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
