begin;

alter table public.dashboard_automation_runs
  drop constraint dashboard_automation_runs_trigger_check,
  drop constraint dashboard_automation_runs_period_mode_check,
  add constraint dashboard_automation_runs_trigger_check check (trigger in ('cron','manual','backfill','intraday')),
  add constraint dashboard_automation_runs_period_mode_check check (period_mode in ('complete_days','including_today','today_only')),
  add constraint dashboard_intraday_range_check check (
    (trigger='intraday')=(period_mode='today_only') and
    (trigger<>'intraday' or (operation='metrics' and range_start=range_end))
  );

create index dashboard_automation_runs_today_success
  on public.dashboard_automation_runs (client_id,source,range_end,completed_at desc)
  where operation='metrics' and status='success'
    and database_write_status in ('success','already_processed','no_data');

create function private.dashboard_today_success(p_client_id bigint,p_source text,p_today date)
returns setof public.dashboard_automation_runs
language sql stable security invoker set search_path='' as $$
  select r.* from public.dashboard_automation_runs r
  where r.client_id=p_client_id and r.source=p_source and r.operation='metrics'
    and r.range_end=p_today and r.status='success' and r.completed_at is not null
    and r.database_write_status in ('success','already_processed','no_data')
  order by r.completed_at desc,r.id desc limit 1;
$$;
revoke all on function private.dashboard_today_success(bigint,text,date) from public,anon,authenticated;
grant execute on function private.dashboard_today_success(bigint,text,date) to service_role;

create function private.dashboard_intraday_cron_window(p_now timestamptz)
returns boolean language sql stable security invoker set search_path='' as $$
  select (p_now at time zone 'America/Sao_Paulo')::time >= time '00:55'
     and (p_now at time zone 'America/Sao_Paulo')::time < time '01:05';
$$;
revoke all on function private.dashboard_intraday_cron_window(timestamptz) from public,anon,authenticated;
grant execute on function private.dashboard_intraday_cron_window(timestamptz) to service_role;

-- The public metrics wrapper, advisory lock, active index and legacy signatures
-- stay shared with cron, manual, previews and backfill.
CREATE OR REPLACE FUNCTION public.reserve_dashboard_metrics_sync_legacy(p_client_id bigint, p_source text, p_trigger text, p_start date, p_end date, p_user_id uuid DEFAULT NULL::uuid, p_request_key uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_run public.dashboard_automation_runs%rowtype;
  v_now timestamptz := clock_timestamp();
  v_next timestamptz;
  v_success public.dashboard_automation_runs%rowtype;
  v_failure_count integer;
  v_today date := ((case when p_trigger='intraday' then now() else v_now end) at time zone 'America/Sao_Paulo')::date;
begin
  if p_source is null or p_source not in ('google_ads','meta_ads','ga4')
     or p_trigger is null or p_trigger not in ('cron','manual','backfill','intraday')
     or p_start is null or p_end is null or p_start > p_end or (p_end > v_today or (p_trigger='backfill' and p_end >= v_today)) then
    raise exception 'INVALID_SYNC_REQUEST' using errcode='22023';
  end if;
  if not exists(select 1 from public.dashboard_clients c where c.id=p_client_id and c.active) then
    raise exception 'CLIENT_UNAVAILABLE' using errcode='42501';
  end if;
  if not exists(select 1 from public.dashboard_source_accounts a where a.client_id=p_client_id and a.source=p_source and a.active and a.automation_enabled) then
    return jsonb_build_object('source',p_source,'state','unavailable');
  end if;
  if p_trigger='manual' and (p_user_id is null or p_request_key is null
     or p_start <> v_today-7 or p_end <> v_today or not exists(
       select 1 from public.dashboard_client_users m where m.client_id=p_client_id
       and m.user_id=p_user_id and m.role in ('admin','editor'))) then
    raise exception 'SYNC_FORBIDDEN' using errcode='42501';
  end if;
  if p_trigger='intraday' and (p_user_id is null or p_request_key is not null
     or p_start <> v_today or p_end <> v_today or not exists(
       select 1 from public.dashboard_client_users m
       where m.client_id=p_client_id and m.user_id=p_user_id)) then
    raise exception 'SYNC_FORBIDDEN' using errcode='42501';
  end if;
  if p_trigger='backfill' and (p_user_id is null or not exists(
     select 1 from public.dashboard_client_users m where m.client_id=p_client_id
     and m.user_id=p_user_id and m.role='admin')) then
    raise exception 'SYNC_FORBIDDEN' using errcode='42501';
  end if;
  if p_trigger='cron' and (p_user_id is not null or p_start<>v_today-7 or p_end<>v_today-1) then
    raise exception 'INVALID_CRON_RANGE' using errcode='22023';
  end if;
  if p_end-p_start > 30 then raise exception 'RANGE_TOO_LARGE' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_client_id::text||':'||p_source, 0));
  if p_request_key is not null then
    select * into v_run from public.dashboard_automation_runs
      where client_id=p_client_id and source=p_source and request_key=p_request_key;
    if found then return jsonb_build_object('source',p_source,'state','existing','run_id',v_run.id); end if;
  end if;
  -- A worker can only claim a queued row, under this row lock. Let the
  -- scheduled run retire D0 dispatches queued before its reservation window.
  update public.dashboard_automation_runs set status='failed', completed_at=v_now,
    error_code='DISPATCH_EXPIRED', error_message='A coleta não iniciou no prazo.'
  where client_id=p_client_id and source=p_source and trigger='intraday'
    and status='queued' and worker_started_at is null
    and requested_at < v_now - case when p_trigger='cron' then interval '5 minutes' else interval '10 minutes' end;
  select * into v_run from public.dashboard_automation_runs
    where client_id=p_client_id and source=p_source and status in ('queued','running','indeterminate')
    order by requested_at desc limit 1;
  if found then return jsonb_build_object('source',p_source,'state','active','run_id',v_run.id); end if;
  if p_trigger='intraday' then
    select * into v_success from private.dashboard_today_success(p_client_id,p_source,v_today);
    if v_success.completed_at > v_now-interval '30 minutes' then
      return jsonb_build_object('source',p_source,'state','fresh','run_id',v_success.id,
        'write_status',v_success.database_write_status);
    end if;
    select count(*),max(completed_at) into v_failure_count,v_next
    from public.dashboard_automation_runs r
    where r.client_id=p_client_id and r.source=p_source and r.trigger='intraday'
      and r.status='failed' and r.range_start=v_today
      and r.completed_at > coalesce(v_success.completed_at,'-infinity'::timestamptz);
    v_next := v_next + make_interval(mins => least(60, 5 * (1 << least(4, greatest(0,v_failure_count-1)))));
    if v_next > v_now then
      return jsonb_build_object('source',p_source,'state','backoff','retry_at',v_next);
    end if;
    -- Leave time for the 01:00 scheduled run to reserve its sources.
    if private.dashboard_intraday_cron_window(v_now) then
      return jsonb_build_object('source',p_source,'state','scheduled');
    end if;
  end if;
  if p_trigger='manual' then
    select max(requested_at)+interval '5 minutes' into v_next from public.dashboard_automation_runs
      where client_id=p_client_id and source=p_source and trigger='manual';
    if v_next > v_now then
      return jsonb_build_object('source',p_source,'state','cooldown','retry_at',v_next);
    end if;
  end if;
  insert into public.dashboard_automation_runs(client_id,source,trigger,range_start,range_end,status,
      requested_by,request_key,requested_at,period_mode)
    values(p_client_id,p_source,p_trigger,p_start,p_end,'queued',p_user_id,p_request_key,v_now,case when p_trigger='manual' then 'including_today' when p_trigger='intraday' then 'today_only' else 'complete_days' end)
    returning * into v_run;
  return jsonb_build_object('source',p_source,'state','accepted','run_id',v_run.id);
end $function$;

CREATE OR REPLACE FUNCTION public.start_dashboard_metrics_sync_legacy(p_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_run public.dashboard_automation_runs%rowtype; v_slug text;
begin
  update public.dashboard_automation_runs r set status='running',worker_started_at=clock_timestamp()
    where id=p_run_id and status='queued'
    and exists(select 1 from public.dashboard_clients c where c.id=r.client_id and c.active)
    and exists(select 1 from public.dashboard_source_accounts a where a.client_id=r.client_id and a.source=r.source and a.active and a.automation_enabled)
    and (r.trigger<>'intraday' or r.range_end=(clock_timestamp() at time zone 'America/Sao_Paulo')::date)
    and (r.trigger='cron' or exists(select 1 from public.dashboard_client_users m
      where m.client_id=r.client_id and m.user_id=r.requested_by
      and (r.trigger='intraday' or m.role='admin' or (r.trigger='manual' and m.role='editor'))))
    returning * into v_run;
  if not found then
    -- Only queued records can be cancelled. Never interrupt another worker.
    update public.dashboard_automation_runs set status='failed',error_code='AUTHORIZATION_CHANGED',
      error_message='Permissão ou fonte indisponível antes do início.',completed_at=clock_timestamp()
      where id=p_run_id and status='queued';
    return null;
  end if;
  select slug into v_slug from public.dashboard_clients where id=v_run.client_id;
  return jsonb_build_object('id',v_run.id,'source',v_run.source,'client_id',v_run.client_id,
    'client_slug',v_slug,'range_start',v_run.range_start,'range_end',v_run.range_end,'trigger',v_run.trigger);
end $function$;

CREATE OR REPLACE FUNCTION public.get_dashboard_sync_status(p_client_slug text, p_user_id uuid, p_run_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_client bigint; v_role text; v_sources jsonb; v_requested jsonb;
begin
  select c.id,m.role into v_client,v_role from public.dashboard_clients c join public.dashboard_client_users m on m.client_id=c.id
    where c.slug=p_client_slug and c.active and m.user_id=p_user_id;
  if v_client is null then raise exception 'SYNC_FORBIDDEN' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('source',s.source,'enabled',s.enabled,
    'latest_run',(select jsonb_build_object('id',r.id,'status',r.status,'requested_at',r.requested_at,
       'started_at',r.worker_started_at,'completed_at',r.completed_at,'range_start',r.range_start,'range_end',r.range_end,
       'database_write_status',r.database_write_status,'error_code',r.error_code,'period_mode',r.period_mode,'requested_by',case when r.trigger<>'intraday' or r.requested_by=p_user_id then r.requested_by end,
       'trigger',r.trigger,'operation',r.operation,
       'overdue',r.status in ('queued','running','indeterminate') and r.requested_at<now()-interval '10 minutes')
      from public.dashboard_automation_runs r where r.client_id=v_client and r.source=s.source and (r.operation='metrics' or r.status in ('queued','running','indeterminate')) order by r.requested_at desc limit 1),
    'last_success_at',(select max(completed_at) from public.dashboard_automation_runs r where r.client_id=v_client and r.source=s.source and r.operation='metrics' and status='success'),
    'last_today_success_at',(select completed_at from private.dashboard_today_success(v_client,s.source,
      (now() at time zone 'America/Sao_Paulo')::date)),
    'available_through',(select min(last_date) from (select a.account_id,max(d.metric_date) last_date
       from public.dashboard_source_accounts a left join public.dashboard_daily_metrics d on d.client_id=a.client_id and d.source=a.source and d.account_id=a.account_id
       where a.client_id=v_client and a.source=s.source and a.active group by a.account_id) coverage),
    'missing_accounts',(select count(*) from public.dashboard_source_accounts a where a.client_id=v_client and a.source=s.source and a.active
       and not exists(select 1 from public.dashboard_daily_metrics d where d.client_id=a.client_id and d.source=a.source and d.account_id=a.account_id)),
    'accounts',(select jsonb_agg(jsonb_build_object('account_id',a.account_id,'last_data_date',
       (select max(metric_date) from public.dashboard_daily_metrics d where d.client_id=a.client_id and d.source=a.source and d.account_id=a.account_id)))
       from public.dashboard_source_accounts a where a.client_id=v_client and a.source=s.source and a.active),
    'next_manual_at',(select max(requested_at)+interval '5 minutes' from public.dashboard_automation_runs r where r.client_id=v_client and r.source=s.source and trigger='manual')
  ) order by s.source),'[]') into v_sources
  from (select source,bool_or(automation_enabled) enabled from public.dashboard_source_accounts
        where client_id=v_client and active and source in ('google_ads','meta_ads','ga4') group by source) s;
  if p_run_ids is not null and cardinality(p_run_ids)>3 then raise exception 'INVALID_SYNC_REQUEST'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'source',r.source,'status',r.status,
    'requested_at',r.requested_at,'started_at',r.worker_started_at,'completed_at',r.completed_at,
    'range_start',r.range_start,'range_end',r.range_end,'database_write_status',r.database_write_status,
    'error_code',r.error_code,'period_mode',r.period_mode,'requested_by',case when r.trigger<>'intraday' or r.requested_by=p_user_id then r.requested_by end,
       'trigger',r.trigger,'operation',r.operation,
    'overdue',r.status in ('queued','running','indeterminate') and r.requested_at<now()-interval '10 minutes')),'[]')
    into v_requested from public.dashboard_automation_runs r where r.client_id=v_client and r.id=any(coalesce(p_run_ids,'{}'));
  return jsonb_build_object('client_id',v_client,'role',v_role,'can_request',v_role in ('admin','editor'),
    'server_time',now(),'today',(now() at time zone 'America/Sao_Paulo')::date,'sources',v_sources,'requested_runs',v_requested);
end $function$;

create function public.request_dashboard_intraday_sync(p_client_slug text,p_user_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  v_client bigint;
  v_source text;
  v_result jsonb;
  v_results jsonb := '[]';
  v_ids uuid[] := '{}';
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_dispatch bigint;
begin
  select c.id into v_client from public.dashboard_clients c
    join public.dashboard_client_users m on m.client_id=c.id
    where c.slug=p_client_slug and c.active and m.user_id=p_user_id;
  if v_client is null then raise exception 'SYNC_FORBIDDEN' using errcode='42501'; end if;

  foreach v_source in array array['ga4','google_ads','meta_ads'] loop
    v_result := public.reserve_dashboard_sync(v_client,v_source,'intraday',v_today,v_today,p_user_id);
    v_results := v_results||jsonb_build_array(v_result);
    if v_result->>'state'='accepted' then v_ids := array_append(v_ids,(v_result->>'run_id')::uuid); end if;
  end loop;
  if cardinality(v_ids)>0 then
    v_dispatch := private.dispatch_dashboard_sync(v_ids);
    update public.dashboard_automation_runs set dispatch_id=v_dispatch where id=any(v_ids);
  end if;
  return jsonb_build_object('ok',true,'results',v_results,'range_start',v_today,'range_end',v_today);
end $$;

-- Add a claim overload for D0. A stale worker calling the original signature
-- cannot claim an intraday row, or send it through the legacy persistence path.
create or replace function public.begin_dashboard_sync_collection(
  p_run_id uuid,p_client_id bigint,p_source text,p_start date,p_end date,p_intraday boolean
) returns boolean language plpgsql security invoker set search_path='' as $$
declare v_id uuid;
begin
  update public.dashboard_automation_runs r set collector_started_at=clock_timestamp()
    where r.id=p_run_id and r.client_id=p_client_id and r.source=p_source and r.range_start=p_start and r.range_end=p_end
      and r.operation='metrics' and r.status='running' and r.worker_started_at is not null and r.collector_started_at is null
      and (r.trigger='intraday')=p_intraday
      and (not p_intraday or exists(select 1 from public.dashboard_client_users m
        where m.client_id=r.client_id and m.user_id=r.requested_by))
    returning id into v_id;
  return v_id is not null;
end $$;

create or replace function public.begin_dashboard_sync_collection(p_run_id uuid,p_client_id bigint,p_source text,p_start date,p_end date)
returns boolean language sql security invoker set search_path='' as $$
  select public.begin_dashboard_sync_collection(p_run_id,p_client_id,p_source,p_start,p_end,false);
$$;

-- Confirm collection scope from the reservation and reuse each existing batch
-- writer, in one transaction. The reserved run scopes idempotency to this
-- snapshot so that a later valid correction back to an older value is applied.
create function public.save_dashboard_intraday_metrics(p_run_id uuid,p_batches jsonb)
returns text language plpgsql security invoker set search_path='' as $$
declare
  v_run public.dashboard_automation_runs%rowtype;
  v_slug text;
  v_day date;
  v_base_key text := 'intraday:'||p_run_id::text||':';
  v_dataset text;
  v_rows jsonb;
  v_result jsonb;
  v_saved boolean := false;
  v_account text;
begin
  select * into v_run from public.dashboard_automation_runs where id=p_run_id for update;
  if not found or v_run.trigger<>'intraday' or v_run.status<>'running' or v_run.collector_started_at is null then
    raise exception 'SYNC_RESERVATION_CONFLICT' using errcode='22023';
  end if;
  if v_run.database_write_status in ('success','no_data') then return v_run.database_write_status; end if;

  select slug into strict v_slug from public.dashboard_clients where id=v_run.client_id and active;
  v_day := v_run.range_start;
  if jsonb_typeof(p_batches) is distinct from 'object' then
    raise exception 'INVALID_INTRADAY_BATCH' using errcode='22023';
  end if;

  for v_dataset,v_rows in select key,value from jsonb_each(p_batches) order by key loop
    if jsonb_typeof(v_rows) <> 'array' then raise exception 'INVALID_INTRADAY_BATCH' using errcode='22023'; end if;
    if jsonb_array_length(v_rows)=0 then continue; end if;
    if v_run.source='ga4' then
      select account_id into strict v_account from public.dashboard_source_accounts
        where client_id=v_run.client_id and source='ga4' and active and automation_enabled;
      case v_dataset
        when 'daily' then v_result := public.upsert_dashboard_batch(v_slug,'ga4',v_base_key||v_dataset,v_day,v_day,v_rows,'[]','[]');
        when 'acquisition' then v_result := public.upsert_dashboard_ga4_acquisition_batch(v_slug,v_account,v_base_key||v_dataset,v_day,v_day,v_rows);
        when 'events' then v_result := public.upsert_dashboard_ga4_event_batch(v_slug,v_account,v_base_key||v_dataset,v_day,v_day,v_rows);
        when 'landing_pages' then v_result := public.upsert_dashboard_ga4_landing_page_batch(v_slug,v_account,v_base_key||v_dataset,v_day,v_day,v_rows);
        else raise exception 'INVALID_INTRADAY_DATASET' using errcode='22023';
      end case;
    elsif v_dataset='paid_media' and v_run.source in ('meta_ads','google_ads') then
      -- Pack daily, campaign and ad arrays using the existing paid-media API.
      if jsonb_array_length(v_rows)<>3 then raise exception 'INVALID_INTRADAY_BATCH' using errcode='22023'; end if;
      if v_rows='[[],[],[]]'::jsonb then continue; end if;
      v_result := public.upsert_dashboard_paid_media_batch(v_slug,v_run.source,v_base_key||v_dataset,
        v_day,v_day,v_rows->0,v_rows->1,v_rows->2);
    elsif v_dataset='groups' and v_run.source in ('meta_ads','google_ads') then
      v_result := public.upsert_dashboard_paid_media_group_batch(v_slug,v_run.source,
        case v_run.source when 'meta_ads' then 'ad_set' else 'ad_group' end,v_base_key||v_dataset,v_day,v_day,v_rows);
    elsif v_dataset='keywords' and v_run.source='google_ads' then
      v_result := public.upsert_dashboard_keyword_batch(v_slug,v_base_key||v_dataset,v_day,v_day,v_rows);
    elsif v_dataset in ('pmax_asset_group','pmax_asset') and v_run.source='google_ads' then
      select jsonb_agg(row||jsonb_build_object('client_slug',v_slug,'source',v_run.source,'record_kind',v_dataset,
        'idempotency_key',v_base_key||v_dataset,'range_start',v_day,'range_end',v_day))
        into v_rows from jsonb_array_elements(v_rows) row;
      v_result := public.ingest_dashboard_pmax_rows(v_rows);
    else
      raise exception 'INVALID_INTRADAY_DATASET' using errcode='22023';
    end if;
    if coalesce(v_result->>'status','') not in ('success','already_processed')
       and coalesce(v_result->>'idempotent','false') <> 'true'
       and coalesce(v_result->>'success','false') <> 'true' then
      raise exception 'INTRADAY_WRITE_UNCONFIRMED';
    end if;
    v_saved := true;
  end loop;
  update public.dashboard_automation_runs set database_write_status=case when v_saved then 'success' else 'no_data' end
    where id=p_run_id returning database_write_status into v_dataset;
  return v_dataset;
end $$;

create or replace function public.finish_dashboard_sync_run(p_run_id uuid,p_status text,p_http_status integer,
  p_counts jsonb,p_write_status text,p_error_code text)
returns void language plpgsql security invoker set search_path='' as $$
declare v_run public.dashboard_automation_runs%rowtype;
begin
  if p_status not in ('success','failed','indeterminate') or p_status is null then raise exception 'INVALID_SYNC_STATUS'; end if;
  -- A response can be lost after the atomic save. The receipt on the run
  -- decides intraday success while the row lock serializes save and finish.
  select * into v_run from public.dashboard_automation_runs where id=p_run_id and status='running' for update;
  if not found then return; end if;
  if v_run.trigger='intraday' then
    if v_run.database_write_status in ('success','no_data') then
      p_status := 'success';
      p_write_status := v_run.database_write_status;
      p_error_code := null;
    elsif p_status='success' then
      p_status := 'indeterminate';
      p_write_status := null;
      p_error_code := 'SYNC_RESULT_UNCONFIRMED';
    end if;
  end if;
  update public.dashboard_automation_runs set status=p_status,http_status=p_http_status,
    counts=coalesce(p_counts,'{}'),database_write_status=p_write_status,error_code=p_error_code,
    error_message=case when p_status='success' then null when p_status='indeterminate' then 'Conclusão não confirmada. Verificação operacional necessária.' else 'Não foi possível concluir a sincronização desta fonte.' end,
    duration_ms=extract(epoch from clock_timestamp()-coalesce(worker_started_at,requested_at))*1000,
    completed_at=case when p_status='indeterminate' then null else clock_timestamp() end
    where id=p_run_id and status='running';
end $$;

revoke all on function public.request_dashboard_intraday_sync(text,uuid),
  public.begin_dashboard_sync_collection(uuid,bigint,text,date,date,boolean),
  public.save_dashboard_intraday_metrics(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.request_dashboard_intraday_sync(text,uuid),
  public.begin_dashboard_sync_collection(uuid,bigint,text,date,date,boolean),
  public.save_dashboard_intraday_metrics(uuid,jsonb) to service_role;

-- Extend the currently installed invoker RPC using the versioned definition.
-- Keep its three-argument API and all aggregation/conversion rules.
do $migration$
declare
  v_definition text := pg_get_functiondef('public.get_dashboard_overview(text,date,date)'::regprocedure);
  v_signature text := 'p_end_date date)';
  v_comparison text := E'v_compare_end := p_start_date - 1;\n  v_compare_start := v_compare_end - (v_days - 1);';
  v_days text := $text$'comparison_period', jsonb_build_object('start', v_compare_start, 'end', v_compare_end, 'days', v_days)$text$;
begin
  if strpos(v_definition,v_signature)=0 or strpos(v_definition,v_comparison)=0 or strpos(v_definition,v_days)=0 then
    raise exception 'Unexpected dashboard overview definition';
  end if;
  v_definition := replace(v_definition,v_signature,'p_end_date date, p_comparison_start_date date, p_comparison_end_date date)');
  v_definition := replace(v_definition,v_comparison,$body$
  if p_comparison_start_date is null or p_comparison_end_date is null
    or p_comparison_end_date < p_comparison_start_date or p_comparison_end_date >= p_start_date
    or p_comparison_end_date-p_comparison_start_date >= 366 then
    raise exception 'invalid comparison date range' using errcode = '22023';
  end if;
  v_compare_start := p_comparison_start_date;
  v_compare_end := p_comparison_end_date;$body$);
  v_definition := replace(v_definition,v_days,$text$'comparison_period', jsonb_build_object('start', v_compare_start, 'end', v_compare_end, 'days', v_compare_end-v_compare_start+1)$text$);
  execute v_definition;
end $migration$;
revoke all on function public.get_dashboard_overview(text,date,date,date,date) from public,anon,authenticated;
grant execute on function public.get_dashboard_overview(text,date,date,date,date) to authenticated,service_role;

commit;
