-- Read API for the Maria Gasolina white-label dashboard.
-- All public entrypoints require an authenticated client membership.

create or replace function private.dashboard_read_client_id(p_client_slug text)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_client_id bigint;
begin
  if (select auth.uid()) is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select dc.id
  into v_client_id
  from public.dashboard_clients dc
  where dc.slug = p_client_slug
    and dc.active = true;

  if v_client_id is null then
    raise exception 'active dashboard client not found' using errcode = '22023';
  end if;

  if not (select private.is_dashboard_client_member(v_client_id)) then
    raise exception 'dashboard access denied' using errcode = '42501';
  end if;

  return v_client_id;
end;
$$;

revoke all on function private.dashboard_read_client_id(text)
  from public, anon, authenticated;

create or replace function private.dashboard_kpis_json(
  p_client_id bigint,
  p_start_date date,
  p_end_date date
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with source_totals as (
    select
      ddm.source,
      count(*)::integer as row_count,
      coalesce(sum(ddm.spend), 0)::numeric as spend,
      coalesce(sum(ddm.impressions), 0)::numeric as impressions,
      coalesce(sum(ddm.reach), 0)::numeric as reach,
      coalesce(sum(ddm.clicks), 0)::numeric as clicks,
      coalesce(sum(ddm.link_clicks), 0)::numeric as link_clicks,
      coalesce(sum(ddm.conversions), 0)::numeric as conversions,
      coalesce(sum(ddm.all_conversions), 0)::numeric as all_conversions,
      coalesce(sum(ddm.conversion_value), 0)::numeric as conversion_value
    from public.dashboard_daily_metrics ddm
    where ddm.client_id = p_client_id
      and ddm.source in ('google_ads', 'meta_ads')
      and ddm.metric_date between p_start_date and p_end_date
    group by ddm.source
  ),
  source_payload as (
    select coalesce(
      jsonb_object_agg(
        st.source,
        jsonb_build_object(
          'has_data', st.row_count > 0,
          'spend', st.spend,
          'impressions', st.impressions,
          'reach', st.reach,
          'clicks', st.clicks,
          'link_clicks', st.link_clicks,
          'results', st.conversions,
          'all_conversions', st.all_conversions,
          'conversion_value', st.conversion_value,
          'ctr', st.clicks * 100 / nullif(st.impressions, 0),
          'link_ctr', st.link_clicks * 100 / nullif(st.impressions, 0),
          'cpc', st.spend / nullif(st.clicks, 0),
          'link_cpc', st.spend / nullif(st.link_clicks, 0),
          'cpm', st.spend * 1000 / nullif(st.impressions, 0),
          'cost_per_result', st.spend / nullif(st.conversions, 0)
        )
      ),
      '{}'::jsonb
    ) as sources
    from source_totals st
  ),
  consolidated as (
    select
      coalesce(sum(st.row_count), 0)::integer as row_count,
      coalesce(sum(st.spend), 0)::numeric as spend,
      coalesce(sum(st.impressions), 0)::numeric as impressions,
      coalesce(sum(st.clicks), 0)::numeric as clicks,
      coalesce(sum(st.conversions), 0)::numeric as results
    from source_totals st
  )
  select jsonb_build_object(
    'consolidated', jsonb_build_object(
      'has_data', c.row_count > 0,
      'spend', c.spend,
      'impressions', c.impressions,
      'clicks', c.clicks,
      'results', c.results,
      'ctr', c.clicks * 100 / nullif(c.impressions, 0),
      'cpc', c.spend / nullif(c.clicks, 0),
      'cpm', c.spend * 1000 / nullif(c.impressions, 0),
      'cost_per_result', c.spend / nullif(c.results, 0)
    ),
    'sources', sp.sources
  )
  from consolidated c
  cross join source_payload sp;
$$;

revoke all on function private.dashboard_kpis_json(bigint, date, date)
  from public, anon, authenticated;

create or replace function public.get_dashboard_overview(
  p_client_slug text,
  p_start_date date,
  p_end_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_client_id bigint;
  v_days integer;
  v_compare_start date;
  v_compare_end date;
  v_client jsonb;
  v_available_range jsonb;
  v_last_sync jsonb;
  v_daily jsonb;
begin
  if p_start_date is null or p_end_date is null or p_start_date > p_end_date then
    raise exception 'invalid date range' using errcode = '22023';
  end if;

  v_days := p_end_date - p_start_date + 1;
  if v_days > 366 then
    raise exception 'date range cannot exceed 366 days' using errcode = '22023';
  end if;

  v_client_id := private.dashboard_read_client_id(p_client_slug);
  v_compare_end := p_start_date - 1;
  v_compare_start := v_compare_end - (v_days - 1);

  select jsonb_build_object(
    'id', dc.id,
    'slug', dc.slug,
    'name', dc.name,
    'timezone', dc.timezone
  )
  into v_client
  from public.dashboard_clients dc
  where dc.id = v_client_id;

  select jsonb_build_object(
    'start', min(ddm.metric_date),
    'end', max(ddm.metric_date)
  )
  into v_available_range
  from public.dashboard_daily_metrics ddm
  where ddm.client_id = v_client_id
    and ddm.source in ('google_ads', 'meta_ads');

  select coalesce(
    jsonb_object_agg(s.source, to_jsonb(s) - 'source'),
    '{}'::jsonb
  )
  into v_last_sync
  from (
    select distinct on (dsr.source)
      dsr.source,
      dsr.status,
      dsr.completed_at,
      dsr.range_start,
      dsr.range_end
    from public.dashboard_sync_runs dsr
    where dsr.client_id = v_client_id
      and dsr.source in ('google_ads', 'meta_ads')
    order by dsr.source, dsr.completed_at desc
  ) s;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'date', d.metric_date,
        'source', d.source,
        'spend', d.spend,
        'impressions', d.impressions,
        'reach', d.reach,
        'clicks', d.clicks,
        'link_clicks', d.link_clicks,
        'results', d.conversions
      )
      order by d.metric_date, d.source
    ),
    '[]'::jsonb
  )
  into v_daily
  from (
    select
      ddm.metric_date,
      ddm.source,
      coalesce(sum(ddm.spend), 0)::numeric as spend,
      coalesce(sum(ddm.impressions), 0)::numeric as impressions,
      coalesce(sum(ddm.reach), 0)::numeric as reach,
      coalesce(sum(ddm.clicks), 0)::numeric as clicks,
      coalesce(sum(ddm.link_clicks), 0)::numeric as link_clicks,
      coalesce(sum(ddm.conversions), 0)::numeric as conversions
    from public.dashboard_daily_metrics ddm
    where ddm.client_id = v_client_id
      and ddm.source in ('google_ads', 'meta_ads')
      and ddm.metric_date between p_start_date and p_end_date
    group by ddm.metric_date, ddm.source
  ) d;

  return jsonb_build_object(
    'client', v_client,
    'period', jsonb_build_object(
      'start', p_start_date,
      'end', p_end_date,
      'days', v_days
    ),
    'comparison_period', jsonb_build_object(
      'start', v_compare_start,
      'end', v_compare_end,
      'days', v_days
    ),
    'available_range', v_available_range,
    'last_sync', v_last_sync,
    'current', private.dashboard_kpis_json(v_client_id, p_start_date, p_end_date),
    'previous', private.dashboard_kpis_json(v_client_id, v_compare_start, v_compare_end),
    'daily', v_daily
  );
end;
$$;

revoke all on function public.get_dashboard_overview(text, date, date)
  from public, anon;
grant execute on function public.get_dashboard_overview(text, date, date)
  to authenticated;

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
security definer
set search_path = ''
as $$
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
  if p_level not in ('campaign', 'group', 'ad') then
    raise exception 'unsupported dashboard entity level' using errcode = '22023';
  end if;
  if p_start_date is null or p_end_date is null or p_start_date > p_end_date then
    raise exception 'invalid date range' using errcode = '22023';
  end if;

  v_limit := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_cursor_spend := nullif(p_cursor ->> 'spend', '')::numeric;
  v_cursor_id := nullif(p_cursor ->> 'id', '');
  v_client_id := private.dashboard_read_client_id(p_client_slug);

  with normalized as (
    select
      'campaign'::text as level,
      dcd.source,
      dcd.campaign_id as item_id,
      coalesce(max(dcd.campaign_name), dcd.campaign_id) as item_name,
      max(dcd.campaign_status) as item_status,
      null::text as parent_id,
      null::text as parent_name,
      sum(dcd.spend)::numeric as spend,
      sum(dcd.impressions)::numeric as impressions,
      sum(dcd.reach)::numeric as reach,
      sum(dcd.clicks)::numeric as clicks,
      sum(dcd.link_clicks)::numeric as link_clicks,
      sum(dcd.conversions)::numeric as results,
      sum(dcd.all_conversions)::numeric as all_conversions,
      sum(dcd.conversion_value)::numeric as conversion_value
    from public.dashboard_campaign_daily dcd
    where p_level = 'campaign'
      and dcd.client_id = v_client_id
      and dcd.source = p_source
      and dcd.metric_date between p_start_date and p_end_date
    group by dcd.source, dcd.campaign_id

    union all

    select
      'group'::text,
      dag.source,
      dag.group_id,
      coalesce(max(dag.group_name), dag.group_id),
      max(dag.group_status),
      dag.campaign_id,
      max(dag.campaign_name),
      sum(dag.spend)::numeric,
      sum(dag.impressions)::numeric,
      sum(dag.reach)::numeric,
      sum(dag.clicks)::numeric,
      sum(dag.link_clicks)::numeric,
      sum(dag.conversions)::numeric,
      sum(dag.all_conversions)::numeric,
      sum(dag.conversion_value)::numeric
    from public.dashboard_ad_group_daily dag
    where p_level = 'group'
      and dag.client_id = v_client_id
      and dag.source = p_source
      and dag.metric_date between p_start_date and p_end_date
    group by dag.source, dag.group_id, dag.campaign_id

    union all

    select
      'ad'::text,
      dad.source,
      dad.ad_id,
      coalesce(max(dad.ad_name), dad.ad_id),
      max(dad.ad_status),
      coalesce(nullif(dad.adset_id, ''), dad.campaign_id),
      coalesce(max(dad.adset_name), max(dad.campaign_name)),
      sum(dad.spend)::numeric,
      sum(dad.impressions)::numeric,
      sum(dad.reach)::numeric,
      sum(dad.clicks)::numeric,
      sum(dad.link_clicks)::numeric,
      sum(dad.conversions)::numeric,
      sum(dad.all_conversions)::numeric,
      sum(dad.conversion_value)::numeric
    from public.dashboard_ad_daily dad
    where p_level = 'ad'
      and dad.client_id = v_client_id
      and dad.source = p_source
      and dad.metric_date between p_start_date and p_end_date
    group by dad.source, dad.ad_id, dad.adset_id, dad.campaign_id
  ),
  enriched as (
    select
      n.*,
      coalesce(n.spend, 0) as sort_spend,
      n.clicks * 100 / nullif(n.impressions, 0) as ctr,
      n.link_clicks * 100 / nullif(n.impressions, 0) as link_ctr,
      n.spend / nullif(n.clicks, 0) as cpc,
      n.spend / nullif(n.link_clicks, 0) as link_cpc,
      n.spend * 1000 / nullif(n.impressions, 0) as cpm,
      n.spend / nullif(n.results, 0) as cost_per_result
    from normalized n
  ),
  filtered as (
    select e.*
    from enriched e
    where v_cursor_spend is null
       or e.sort_spend < v_cursor_spend
       or (e.sort_spend = v_cursor_spend and e.item_id > v_cursor_id)
  ),
  limited as (
    select f.*
    from filtered f
    order by f.sort_spend desc, f.item_id
    limit v_limit + 1
  ),
  visible as (
    select l.*
    from limited l
    order by l.sort_spend desc, l.item_id
    limit v_limit
  )
  select jsonb_build_object(
    'items', coalesce(
      (select jsonb_agg(to_jsonb(v) - 'sort_spend' order by v.sort_spend desc, v.item_id) from visible v),
      '[]'::jsonb
    ),
    'total_count', (select count(*) from enriched),
    'next_cursor', case
      when (select count(*) from limited) > v_limit then (
        select jsonb_build_object('spend', v.sort_spend, 'id', v.item_id)
        from visible v
        order by v.sort_spend asc, v.item_id desc
        limit 1
      )
      else null
    end
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_dashboard_entities(
  text, text, text, date, date, integer, jsonb
) from public, anon;
grant execute on function public.get_dashboard_entities(
  text, text, text, date, date, integer, jsonb
) to authenticated;

create or replace function public.get_dashboard_pmax(
  p_client_slug text,
  p_start_date date,
  p_end_date date,
  p_level text default 'asset',
  p_limit integer default 25,
  p_cursor jsonb default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_client_id bigint;
  v_limit integer;
  v_cursor_value numeric;
  v_cursor_id text;
  v_result jsonb;
begin
  if p_level not in ('asset_group', 'asset') then
    raise exception 'unsupported Performance Max level' using errcode = '22023';
  end if;
  if p_start_date is null or p_end_date is null or p_start_date > p_end_date then
    raise exception 'invalid date range' using errcode = '22023';
  end if;

  v_limit := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_cursor_value := nullif(p_cursor ->> 'sort_value', '')::numeric;
  v_cursor_id := nullif(p_cursor ->> 'id', '');
  v_client_id := private.dashboard_read_client_id(p_client_slug);

  with normalized as (
    select
      'asset_group'::text as level,
      dag.asset_group_id as item_id,
      coalesce(max(dag.asset_group_name), dag.asset_group_id) as item_name,
      dag.campaign_id,
      max(dag.campaign_name) as campaign_name,
      null::text as asset_group_id,
      null::text as asset_group_name,
      null::text as field_type,
      null::text as performance_label,
      null::text as text_content,
      null::text as image_url,
      null::text as youtube_video_id,
      max(dag.asset_group_status) as item_status,
      max(dag.ad_strength) as ad_strength,
      sum(dag.spend)::numeric as spend,
      sum(dag.impressions)::numeric as impressions,
      sum(dag.clicks)::numeric as clicks,
      sum(dag.conversions)::numeric as results,
      sum(dag.all_conversions)::numeric as all_conversions,
      sum(dag.conversion_value)::numeric as conversion_value
    from public.dashboard_pmax_asset_group_daily dag
    where p_level = 'asset_group'
      and dag.client_id = v_client_id
      and dag.metric_date between p_start_date and p_end_date
    group by dag.asset_group_id, dag.campaign_id

    union all

    select
      'asset'::text,
      da.asset_id || ':' || da.field_type,
      coalesce(max(da.asset_name), max(da.text_content), da.asset_id),
      da.campaign_id,
      max(da.campaign_name),
      da.asset_group_id,
      max(da.asset_group_name),
      da.field_type,
      max(da.performance_label),
      max(da.text_content),
      max(da.image_url),
      max(da.youtube_video_id),
      max(da.asset_status),
      null::text,
      sum(da.spend)::numeric,
      sum(da.impressions)::numeric,
      sum(da.clicks)::numeric,
      sum(da.conversions)::numeric,
      sum(da.all_conversions)::numeric,
      sum(da.conversion_value)::numeric
    from public.dashboard_pmax_asset_daily da
    where p_level = 'asset'
      and da.client_id = v_client_id
      and da.metric_date between p_start_date and p_end_date
    group by da.asset_id, da.field_type, da.asset_group_id, da.campaign_id
  ),
  enriched as (
    select
      n.*,
      coalesce(n.results, 0) as sort_value,
      n.clicks * 100 / nullif(n.impressions, 0) as ctr,
      n.spend / nullif(n.clicks, 0) as cpc,
      n.spend / nullif(n.results, 0) as cost_per_result
    from normalized n
  ),
  filtered as (
    select e.*
    from enriched e
    where v_cursor_value is null
       or e.sort_value < v_cursor_value
       or (e.sort_value = v_cursor_value and e.item_id > v_cursor_id)
  ),
  limited as (
    select f.*
    from filtered f
    order by f.sort_value desc, f.item_id
    limit v_limit + 1
  ),
  visible as (
    select l.*
    from limited l
    order by l.sort_value desc, l.item_id
    limit v_limit
  )
  select jsonb_build_object(
    'items', coalesce(
      (select jsonb_agg(to_jsonb(v) - 'sort_value' order by v.sort_value desc, v.item_id) from visible v),
      '[]'::jsonb
    ),
    'total_count', (select count(*) from enriched),
    'next_cursor', case
      when (select count(*) from limited) > v_limit then (
        select jsonb_build_object('sort_value', v.sort_value, 'id', v.item_id)
        from visible v
        order by v.sort_value asc, v.item_id desc
        limit 1
      )
      else null
    end
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_dashboard_pmax(
  text, date, date, text, integer, jsonb
) from public, anon;
grant execute on function public.get_dashboard_pmax(
  text, date, date, text, integer, jsonb
) to authenticated;


;
