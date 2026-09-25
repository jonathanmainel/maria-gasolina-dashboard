insert into public.dashboard_source_accounts (
  client_id, source, account_id, account_name, active, automation_enabled
)
select id, 'ga4', '508003193', 'Maria Gasolina GA4', true, true
from public.dashboard_clients
where slug = 'maria-gasolina'
on conflict (client_id, source, account_id)
do update set account_name = excluded.account_name, active = true,
  automation_enabled = true, updated_at = now();

alter table public.dashboard_automation_runs
  drop constraint if exists dashboard_automation_runs_source_check;
alter table public.dashboard_automation_runs
  add constraint dashboard_automation_runs_source_check
  check (source in ('google_ads', 'meta_ads', 'ga4'));

create table if not exists public.dashboard_ga4_landing_page_daily (
  id bigint generated always as identity primary key,
  client_id bigint not null references public.dashboard_clients(id) on delete cascade,
  account_id text not null,
  metric_date date not null,
  landing_page text not null,
  sessions bigint not null default 0 check (sessions >= 0),
  engaged_sessions bigint not null default 0 check (engaged_sessions >= 0),
  active_users bigint not null default 0 check (active_users >= 0),
  new_users bigint not null default 0 check (new_users >= 0),
  views bigint not null default 0 check (views >= 0),
  events bigint not null default 0 check (events >= 0),
  key_events numeric(20,6) not null default 0 check (key_events >= 0),
  primary_conversions bigint,
  ingested_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dashboard_ga4_landing_page_daily_unique
    unique (client_id, account_id, metric_date, landing_page)
);

create index if not exists dashboard_ga4_landing_page_client_date_idx
  on public.dashboard_ga4_landing_page_daily (client_id, metric_date desc);

alter table public.dashboard_ga4_landing_page_daily enable row level security;
drop policy if exists dashboard_ga4_landing_page_member_select
  on public.dashboard_ga4_landing_page_daily;
create policy dashboard_ga4_landing_page_member_select
  on public.dashboard_ga4_landing_page_daily
  for select to authenticated
  using ((select private.is_dashboard_client_member(client_id)));

revoke all on table public.dashboard_ga4_landing_page_daily from anon, authenticated;
grant select on table public.dashboard_ga4_landing_page_daily to authenticated;
grant all on table public.dashboard_ga4_landing_page_daily to service_role;
grant usage, select on sequence public.dashboard_ga4_landing_page_daily_id_seq to service_role;

create or replace function public.upsert_dashboard_ga4_landing_page_batch(
  p_client_slug text,
  p_account_id text,
  p_idempotency_key text,
  p_range_start date,
  p_range_end date,
  p_rows jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_client_id bigint;
  v_rows jsonb := coalesce(p_rows, '[]'::jsonb);
  v_row_count integer := 0;
  v_existing public.dashboard_sync_runs%rowtype;
begin
  if p_range_start is null or p_range_end is null or p_range_start > p_range_end
     or p_range_end - p_range_start > 365 then
    raise exception 'invalid date range' using errcode = '22023';
  end if;
  if p_account_id is null or btrim(p_account_id) = ''
     or p_idempotency_key is null
     or length(btrim(p_idempotency_key)) not between 8 and 240
     or jsonb_typeof(v_rows) <> 'array' then
    raise exception 'invalid landing page batch' using errcode = '22023';
  end if;

  select id into v_client_id from public.dashboard_clients
  where slug = p_client_slug and active;
  if v_client_id is null then
    raise exception 'dashboard client not found or inactive' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_client_slug || '|ga4|' || p_idempotency_key, 0)
  );
  select * into v_existing from public.dashboard_sync_runs
  where client_id = v_client_id and source = 'ga4'
    and idempotency_key = p_idempotency_key and status = 'success';
  if found then
    return jsonb_build_object('status','already_processed','dataset','landing_pages',
      'rows',v_existing.daily_rows);
  end if;

  if exists (
    select 1 from jsonb_to_recordset(v_rows) as r(
      account_id text, metric_date date, landing_page text,
      sessions bigint, engaged_sessions bigint, active_users bigint,
      new_users bigint, views bigint, events bigint, key_events numeric,
      primary_conversions bigint
    )
    where r.metric_date is null or r.metric_date < p_range_start
       or r.metric_date > p_range_end
       or r.landing_page is null or btrim(r.landing_page) = ''
       or (r.account_id is not null and r.account_id <> p_account_id)
       or coalesce(r.sessions,0) < 0 or coalesce(r.engaged_sessions,0) < 0
       or coalesce(r.active_users,0) < 0 or coalesce(r.new_users,0) < 0
       or coalesce(r.views,0) < 0 or coalesce(r.events,0) < 0
       or coalesce(r.key_events,0) < 0 or coalesce(r.primary_conversions,0) < 0
  ) then
    raise exception 'invalid landing page row' using errcode = '22023';
  end if;

  delete from public.dashboard_ga4_landing_page_daily
  where client_id = v_client_id and account_id = p_account_id
    and metric_date between p_range_start and p_range_end;

  insert into public.dashboard_ga4_landing_page_daily (
    client_id, account_id, metric_date, landing_page, sessions, engaged_sessions,
    active_users, new_users, views, events, key_events, primary_conversions
  )
  select v_client_id, p_account_id, r.metric_date, r.landing_page,
    sum(coalesce(r.sessions,0))::bigint,
    sum(coalesce(r.engaged_sessions,0))::bigint,
    sum(coalesce(r.active_users,0))::bigint,
    sum(coalesce(r.new_users,0))::bigint,
    sum(coalesce(r.views,0))::bigint,
    sum(coalesce(r.events,0))::bigint,
    sum(coalesce(r.key_events,0))::numeric(20,6),
    case when bool_and(r.primary_conversions is not null)
      then sum(r.primary_conversions)::bigint else null end
  from jsonb_to_recordset(v_rows) as r(
    account_id text, metric_date date, landing_page text,
    sessions bigint, engaged_sessions bigint, active_users bigint,
    new_users bigint, views bigint, events bigint, key_events numeric,
    primary_conversions bigint
  )
  group by r.metric_date, r.landing_page;
  get diagnostics v_row_count = row_count;

  insert into public.dashboard_sync_runs (
    client_id, source, idempotency_key, range_start, range_end, status, daily_rows
  ) values (
    v_client_id, 'ga4', p_idempotency_key, p_range_start, p_range_end, 'success', v_row_count
  );
  return jsonb_build_object('status','success','dataset','landing_pages',
    'rows',v_row_count);
end;
$function$;

revoke all on function public.upsert_dashboard_ga4_landing_page_batch(text,text,text,date,date,jsonb)
  from public, anon, authenticated;
grant execute on function public.upsert_dashboard_ga4_landing_page_batch(text,text,text,date,date,jsonb)
  to service_role;

create or replace function public.get_dashboard_ga4_landing_pages(
  p_client_slug text,
  p_start_date date,
  p_end_date date,
  p_limit integer default 10,
  p_cursor jsonb default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $function$
declare
  v_client_id bigint;
  v_limit integer;
  v_cursor_sessions numeric;
  v_cursor_page text;
  v_result jsonb;
begin
  if p_start_date is null or p_end_date is null or p_start_date > p_end_date
     or p_end_date - p_start_date > 365 then
    raise exception 'invalid date range' using errcode = '22023';
  end if;
  v_limit := least(greatest(coalesce(p_limit,10),1),100);
  v_cursor_sessions := nullif(p_cursor ->> 'sessions','')::numeric;
  v_cursor_page := nullif(p_cursor ->> 'landing_page','');
  v_client_id := private.dashboard_read_client_id(p_client_slug);

  with aggregated as (
    select l.landing_page,
      sum(l.sessions)::numeric as sessions,
      sum(l.engaged_sessions)::numeric as engaged_sessions,
      sum(l.active_users)::numeric as active_users,
      sum(l.new_users)::numeric as new_users,
      sum(l.views)::numeric as views,
      sum(l.events)::numeric as events,
      sum(l.key_events)::numeric as key_events,
      case when bool_and(l.primary_conversions is not null)
        then sum(l.primary_conversions)::numeric else null end as primary_conversions
    from public.dashboard_ga4_landing_page_daily l
    where l.client_id = v_client_id
      and l.metric_date between p_start_date and p_end_date
    group by l.landing_page
  ), enriched as (
    select a.*, a.engaged_sessions * 100 / nullif(a.sessions,0) as engagement_rate,
      a.primary_conversions * 100 / nullif(a.sessions,0) as conversion_rate
    from aggregated a
  ), filtered as (
    select e.* from enriched e
    where v_cursor_sessions is null or e.sessions < v_cursor_sessions
      or (e.sessions = v_cursor_sessions and e.landing_page > v_cursor_page)
  ), limited as (
    select f.* from filtered f
    order by f.sessions desc, f.landing_page limit v_limit + 1
  ), visible as (
    select l.* from limited l
    order by l.sessions desc, l.landing_page limit v_limit
  )
  select jsonb_build_object(
    'items',coalesce((select jsonb_agg(to_jsonb(v) order by v.sessions desc,v.landing_page)
      from visible v),'[]'::jsonb),
    'total_count',(select count(*) from enriched),
    'next_cursor',case when (select count(*) from limited)>v_limit then (
      select jsonb_build_object('sessions',v.sessions,'landing_page',v.landing_page)
      from visible v order by v.sessions asc,v.landing_page desc limit 1
    ) else null end
  ) into v_result;
  return v_result;
end;
$function$;

revoke all on function public.get_dashboard_ga4_landing_pages(text,date,date,integer,jsonb)
  from public, anon;
grant execute on function public.get_dashboard_ga4_landing_pages(text,date,date,integer,jsonb)
  to authenticated, service_role;
