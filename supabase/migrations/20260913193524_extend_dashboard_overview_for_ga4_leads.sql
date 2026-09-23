
create or replace function public.get_dashboard_overview(
  p_client_slug text,
  p_start_date date,
  p_end_date date
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $function$
declare
  v_client_id bigint;
  v_days integer;
  v_compare_start date;
  v_compare_end date;
  v_client jsonb;
  v_available_range jsonb;
  v_last_sync jsonb;
  v_daily jsonb;
  v_ga4_current jsonb;
  v_ga4_previous jsonb;
  v_ga4_daily jsonb;
begin
  if p_start_date is null or p_end_date is null or p_start_date > p_end_date then
    raise exception 'invalid date range' using errcode = '22078023';
  end if;

  v_days := p_end_date - p_start_date + 1;
  if v_days > 366 then
    raise exception 'date range cannot exceed 366 days' using errcode = '22023';
  end if;

  v_client_id := private.dashboard_read_client77577575_client_id(p_client_slug);
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
    and ddm.source in ('google_ads', 'meta_ads', 'ga4');

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
      and dsr.source in ('google_ads', 'meta_ads', 'ga4')
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

  with summary as (
    select
      count(*) > 0 as has_data,
      coalesce(sum(ddm.sessions), 0)::numeric as sessions,
      coalesce(sum(ddm.engaged_sessions), 0)::numeric as engaged_sessions,
      coalesce(sum(ddm.active_users), 0)::numeric as active_users,
      coalesce(sum(ddm.new_users), 0)::numeric as new_users,
      coalesce(sum(ddm.views), 0)::numeric as views,
      coalesce(sum(ddm.events), 0)::numeric as events,
      coalesce(sum(ddm.conversions), 0)::numeric as conversions,
      coalesce(sum(ddm.revenue), 0)::numeric as revenue
    from public.dashboard_daily_metrics ddm
    where ddm.client_id = v_client_id
      and ddm.source = 'ga4'
      and ddm.metric_date between p_start_date and p_end_date
  ),
  leads as (
    select coalesce(sum(e.event_count), 0)::numeric as generate_leads
    from public.dashboard_ga4_event_daily e
    where e.client_id = v_client_id
      and e.event_name = 'generate_lead'
      and e.metric_date between p_start_date and p_end_date
  )
  select jsonb_build_object(
    'has_data', s.has_data,
    'sessions', s.sessions,
    'engaged_sessions', s.engaged_sessions,
    'engagement_rate', s.engaged_sessions * 100 / nullif(s.sessions, 0),
    'active_users', s.active_users,
    'new_users', s.new_users,
    'views', s.views,
    'views_per_session', s.views / nullif(s.sessions, 0),
    'events', s.events,
    'conversions', s.conversions,
    'revenue', s.revenue,
    'generate_leads', l.generate_leads,
    'lead_rate', l.generate_leads * 100 / nullif(s.sessions, 0)
  )
  into v_ga4_current
  from summary s cross join leads l;

  with summary as (
    select
      count(*) > 0 as has_data,
      coalesce(sum(ddm.sessions), 0)::numeric as sessions,
      coalesce(sum(ddm.engaged_sessions), 0)::numeric as engaged_sessions,
      coalesce(sum(ddm.active_users), 0)::numeric as active_users,
      coalesce(sum(ddm.new_users), 0)::numeric as new_users,
      coalesce(sum(ddm.views), 0)::numeric as views,
      coalesce(sum(ddm.events), 0)::numeric as events,
      coalesce(sum(ddm.conversions), 0)::numeric as conversions,
      coalesce(sum(ddm.revenue), 0)::numeric as revenue
    from public.dashboard_daily_metrics ddm
    where ddm.client_id = v_client_id
      and ddm.source = 'ga4'
      and ddm.metric_date between v_compare_start and v_compare_end
  ),
  leads as (
    select coalesce(sum(e.event_count), 0)::numeric as generate_leads
    from public.dashboard_ga4_event_daily e
    where e.client_id = v_client_id
      and e.event_name = 'generate_lead'
      and e.metric_date between v_compare_start and v_compare_end
  )
  select jsonb_build_object(
    'has_data', s.has_data,
    'sessions', s.sessions,
    'engaged_sessions', s.engaged_sessions,
    'engagement_rate', s.engaged_sessions * 100 / nullif(s.sessions, 0),
    'active_users', s.active_users,
    'new_users', s.new_users,
    'views', s.views,
    'views_per_session', s.views / nullif(s.sessions, 0),
    'events', s.events,
    'conversions', s.conversions,
    'revenue', s.revenue,
    'generate_leads', l.generate_leads,
    'lead_rate', l.generate_leads * 100 / nullif(s.sessions, 0)
  )
  into v_ga4_previous
  from summary s cross join leads l;

  with summary as (
    select
      ddm.metric_date,
      coalesce(sum(ddm.sessions), 0)::numeric as sessions,
      coalesce(sum(ddm.engaged_sessions), 0)::numeric as engaged_sessions,
      coalesce(sum(ddm.active_users), 0)::numeric as active_users,
      coalesce(sum(ddm.new_users), 0)::numeric as new_users,
      coalesce(sum(ddm.views), 0)::numeric as views,
      coalesce(sum(ddm.events), 0)::numeric as events,
      coalesce(sum(ddm.conversions), 0)::numeric as conversions,
      coalesce(sum(ddm.revenue), 0)::numeric as revenue
    from public.dashboard_daily_metrics ddm
    where ddm.client_id = v_client_id
      and ddm.source = 'ga4'
      and ddm.metric_date between p_start_date and p_end_date
    group by ddm.metric_date
  ),
  event_series as (
    select
      e.metric_date,
      coalesce(sum(e.event_count) filter (where e.event_name = 'page_view'), 0)::numeric as page_views,
      coalesce(sum(e.event_count) filter (where e.event_name = 'scroll'), 0)::numeric as scrolls,
      coalesce(sum(e.event_count) filter (where e.event_name = 'generate_lead'), 0)::numeric as generate_leads
    from public.dashboard_ga4_event_daily e
    where e.client_id = v_client_id
      and e.metric_date between p_start_date and p_end_date
      and e.event_name in ('page_view', 'scroll', 'generate_lead')
    group by e.metric_date
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'date', s.metric_date,
        'sessions', s.sessions,
        'engaged_sessions', s.engaged_sessions,
        'active_users', s.active_users,
        'new_users', s.new_users,
        'views', s.views,
        'events', s.events,
        'conversions', s.conversions,
        'revenue', s.revenue,
        'page_views', coalesce(es.page_views, 0),
        'scrolls', coalesce(es.scrolls, 0),
        'generate_leads', coalesce(es.generate_leads, 0)
      )
      order by s.metric_date
    ),
    '[]'::jsonb
  )
  into v_ga4_daily
  from summary s
  left join event_series es on es.metric_date = s.metric_date;

  return jsonb_build_object(
    'client', v_client,
    'period', jsonb_build_object('start', p_start_date, 'end', p_end_date, 'days', v_days),
    'comparison_period', jsonb_build_object('start', v_compare_start, 'end', v_compare_end, 'days', v_days),
    'available_range', v_available_range,
    'last_sync', v_last_sync,
    'current', private.dashboard_kpis_json(v_client_id, p_start_date, p_end_date),
    'previous', private.dashboard_kpis_json(v_client_id, v_compare_start, v_compare_end),
    'daily', v_daily,
    'analytics', jsonb_build_object(
      'current', v_ga4_current,
      'previous', v_ga4_previous,
      'daily', v_ga4_daily
    )
  );
end;
$function$;

revoke all on function public.get_dashboard_overview(text,date,date) from public, anon;
grant execute on function public.get_dashboard_overview(text,date,date) to authenticated, service_role;
;
