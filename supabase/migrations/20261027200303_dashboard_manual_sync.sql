-- Manual collection: admin-only, prior seven days plus partial today.
-- Review and authorize separately. Never changes membership/RLS or cron.
begin;
alter table public.dashboard_automation_runs
  add column requested_by uuid references auth.users(id) on delete set null,
  add column request_key uuid,
  add column requested_at timestamptz,
  add column worker_started_at timestamptz,
  add column collector_started_at timestamptz,
  add column dispatch_id bigint,
  add column error_code text,
  add column period_mode text not null default 'complete_days';
update public.dashboard_automation_runs set requested_at = started_at;
alter table public.dashboard_automation_runs alter column requested_at set default now();
alter table public.dashboard_automation_runs alter column requested_at set not null;
alter table public.dashboard_automation_runs drop constraint dashboard_automation_runs_status_check;
alter table public.dashboard_automation_runs add constraint dashboard_automation_runs_status_check
  check (status in ('queued','running','indeterminate','success','failed'));
alter table public.dashboard_automation_runs drop constraint dashboard_automation_runs_trigger_check;
alter table public.dashboard_automation_runs add constraint dashboard_automation_runs_trigger_check
  check (trigger in ('cron','manual','backfill'));
alter table public.dashboard_automation_runs add constraint dashboard_automation_runs_period_mode_check
  check (period_mode in ('complete_days','including_today'));
-- Fails safely if legacy active duplicates exist. Do not delete/expire them automatically.
create unique index dashboard_automation_runs_active_source
  on public.dashboard_automation_runs(client_id,source)
  where status in ('queued','running','indeterminate');
create unique index dashboard_automation_runs_request_source
  on public.dashboard_automation_runs(client_id,source,request_key) where request_key is not null;
create index dashboard_automation_runs_source_requested
  on public.dashboard_automation_runs(client_id,source,requested_at desc);

-- Only service_role can call the functions below. user_id is derived by the
-- JWT endpoint using Auth.getUser, never copied from browser payload.
create function public.reserve_dashboard_sync(
  p_client_id bigint, p_source text, p_trigger text,
  p_start date, p_end date, p_user_id uuid default null, p_request_key uuid default null
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_run public.dashboard_automation_runs%rowtype;
  v_now timestamptz := clock_timestamp();
  v_next timestamptz;
  v_today date := (v_now at time zone 'America/Sao_Paulo')::date;
begin
  if p_source is null or p_source not in ('google_ads','meta_ads','ga4')
     or p_trigger is null or p_trigger not in ('cron','manual','backfill')
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
       and m.user_id=p_user_id and m.role='admin')) then
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
  select * into v_run from public.dashboard_automation_runs
    where client_id=p_client_id and source=p_source and status in ('queued','running','indeterminate')
    order by requested_at desc limit 1;
  if found then return jsonb_build_object('source',p_source,'state','active','run_id',v_run.id); end if;
  if p_trigger='manual' then
    select max(requested_at)+interval '5 minutes' into v_next from public.dashboard_automation_runs
      where client_id=p_client_id and source=p_source and trigger='manual';
    if v_next > v_now then
      return jsonb_build_object('source',p_source,'state','cooldown','retry_at',v_next);
    end if;
  end if;
  insert into public.dashboard_automation_runs(client_id,source,trigger,range_start,range_end,status,
      requested_by,request_key,requested_at,period_mode)
    values(p_client_id,p_source,p_trigger,p_start,p_end,'queued',p_user_id,p_request_key,v_now,case when p_trigger='manual' then 'including_today' else 'complete_days' end)
    returning * into v_run;
  return jsonb_build_object('source',p_source,'state','accepted','run_id',v_run.id);
end $$;

-- Vault access is narrowly contained in a private, backend-only definer.
create function private.dispatch_dashboard_sync(p_ids uuid[])
returns bigint language plpgsql security definer set search_path='' as $$
declare v_url text; v_secret text; v_dispatch bigint;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name='dashboard_project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name='dashboard_cron_secret_key';
  if v_url is null or v_secret is null then raise exception 'DISPATCH_NOT_CONFIGURED'; end if;
  select net.http_post(url:=v_url||'/functions/v1/sync-dashboard-daily',
    headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_secret,'apikey',v_secret),
    body:=jsonb_build_object('run_ids',to_jsonb(p_ids)),timeout_milliseconds:=120000) into v_dispatch;
  return v_dispatch;
end $$;
revoke all on function private.dispatch_dashboard_sync(uuid[]) from public,anon,authenticated;
grant usage on schema private to service_role;
grant execute on function private.dispatch_dashboard_sync(uuid[]) to service_role;

create function public.request_dashboard_sync(p_client_slug text,p_user_id uuid,p_sources text[],p_request_key uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  v_client bigint; v_source text; v_result jsonb; v_results jsonb := '[]';
  v_ids uuid[] := '{}'; v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_dispatch bigint;
begin
  select c.id into v_client from public.dashboard_clients c join public.dashboard_client_users m on m.client_id=c.id
    where c.slug=p_client_slug and c.active and m.user_id=p_user_id and m.role='admin';
  if v_client is null then raise exception 'SYNC_FORBIDDEN' using errcode='42501'; end if;
  if p_request_key is null or p_sources is null or cardinality(p_sources) not between 1 and 3
     or exists(select 1 from unnest(p_sources) s where s is null or s not in ('google_ads','meta_ads','ga4')) then
    raise exception 'INVALID_SYNC_REQUEST' using errcode='22023';
  end if;
  -- Sorted locks avoid deadlocks between requests for all sources.
  for v_source in select distinct unnest(p_sources) order by 1 loop
    v_result := public.reserve_dashboard_sync(v_client,v_source,'manual',v_today-7,v_today,p_user_id,p_request_key);
    v_results := v_results||jsonb_build_array(v_result);
    if v_result->>'state'='accepted' then v_ids := array_append(v_ids,(v_result->>'run_id')::uuid); end if;
  end loop;
  if cardinality(v_ids)>0 then
    v_dispatch := private.dispatch_dashboard_sync(v_ids);
    update public.dashboard_automation_runs set dispatch_id=v_dispatch where id=any(v_ids);
  end if;
  return jsonb_build_object('ok',true,'results',v_results,'range_start',v_today-7,'range_end',v_today);
end $$;

create function public.start_dashboard_sync_run(p_run_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_run public.dashboard_automation_runs%rowtype; v_slug text;
begin
  update public.dashboard_automation_runs r set status='running',worker_started_at=clock_timestamp()
    where id=p_run_id and status='queued'
    and exists(select 1 from public.dashboard_clients c where c.id=r.client_id and c.active)
    and exists(select 1 from public.dashboard_source_accounts a where a.client_id=r.client_id and a.source=r.source and a.active and a.automation_enabled)
    and (r.trigger='cron' or exists(select 1 from public.dashboard_client_users m
      where m.client_id=r.client_id and m.user_id=r.requested_by
      and m.role='admin'))
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
    'client_slug',v_slug,'range_start',v_run.range_start,'range_end',v_run.range_end);
end $$;

-- A second collector cannot claim the same reservation, even with privileged headers.
create function public.begin_dashboard_sync_collection(p_run_id uuid,p_client_id bigint,p_source text,p_start date,p_end date)
returns boolean language plpgsql security invoker set search_path='' as $$
declare v_id uuid;
begin
  update public.dashboard_automation_runs set collector_started_at=clock_timestamp()
    where id=p_run_id and client_id=p_client_id and source=p_source and range_start=p_start and range_end=p_end
    and status='running' and worker_started_at is not null and collector_started_at is null
    returning id into v_id;
  return v_id is not null;
end $$;

create function public.finish_dashboard_sync_run(p_run_id uuid,p_status text,p_http_status integer,
  p_counts jsonb,p_write_status text,p_error_code text)
returns void language plpgsql security invoker set search_path='' as $$
begin
  if p_status not in ('success','failed','indeterminate') or p_status is null then raise exception 'INVALID_SYNC_STATUS'; end if;
  update public.dashboard_automation_runs set status=p_status,http_status=p_http_status,
    counts=coalesce(p_counts,'{}'),database_write_status=p_write_status,error_code=p_error_code,
    error_message=case when p_status='success' then null when p_status='indeterminate' then 'Conclusão não confirmada. Verificação operacional necessária.' else 'Não foi possível concluir a sincronização desta fonte.' end,
    duration_ms=extract(epoch from clock_timestamp()-coalesce(worker_started_at,requested_at))*1000,
    completed_at=case when p_status='indeterminate' then null else clock_timestamp() end
    where id=p_run_id and status='running';
end $$;

create function public.get_dashboard_sync_status(p_client_slug text,p_user_id uuid,p_run_ids uuid[] default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_client bigint; v_role text; v_sources jsonb; v_requested jsonb;
begin
  select c.id,m.role into v_client,v_role from public.dashboard_clients c join public.dashboard_client_users m on m.client_id=c.id
    where c.slug=p_client_slug and c.active and m.user_id=p_user_id;
  if v_client is null then raise exception 'SYNC_FORBIDDEN' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('source',s.source,'enabled',s.enabled,
    'latest_run',(select jsonb_build_object('id',r.id,'status',r.status,'requested_at',r.requested_at,
       'started_at',r.worker_started_at,'completed_at',r.completed_at,'range_start',r.range_start,'range_end',r.range_end,
       'database_write_status',r.database_write_status,'error_code',r.error_code,'period_mode',r.period_mode,'requested_by',r.requested_by,'trigger',r.trigger,
       'overdue',r.status in ('queued','running','indeterminate') and r.requested_at<now()-interval '10 minutes')
      from public.dashboard_automation_runs r where r.client_id=v_client and r.source=s.source order by r.requested_at desc limit 1),
    'last_success_at',(select max(completed_at) from public.dashboard_automation_runs r where r.client_id=v_client and r.source=s.source and status='success'),
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
    'error_code',r.error_code,'period_mode',r.period_mode,'requested_by',r.requested_by,'trigger',r.trigger,
    'overdue',r.status in ('queued','running','indeterminate') and r.requested_at<now()-interval '10 minutes')),'[]')
    into v_requested from public.dashboard_automation_runs r where r.client_id=v_client and r.id=any(coalesce(p_run_ids,'{}'));
  return jsonb_build_object('client_id',v_client,'role',v_role,'can_request',v_role='admin',
    'server_time',now(),'today',(now() at time zone 'America/Sao_Paulo')::date,'sources',v_sources,'requested_runs',v_requested);
end $$;

revoke all on function public.reserve_dashboard_sync(bigint,text,text,date,date,uuid,uuid) from public,anon,authenticated;
revoke all on function public.request_dashboard_sync(text,uuid,text[],uuid) from public,anon,authenticated;
revoke all on function public.start_dashboard_sync_run(uuid) from public,anon,authenticated;
revoke all on function public.begin_dashboard_sync_collection(uuid,bigint,text,date,date) from public,anon,authenticated;
revoke all on function public.finish_dashboard_sync_run(uuid,text,integer,jsonb,text,text) from public,anon,authenticated;
revoke all on function public.get_dashboard_sync_status(text,uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.reserve_dashboard_sync(bigint,text,text,date,date,uuid,uuid),
  public.request_dashboard_sync(text,uuid,text[],uuid),public.start_dashboard_sync_run(uuid),
  public.begin_dashboard_sync_collection(uuid,bigint,text,date,date),
  public.finish_dashboard_sync_run(uuid,text,integer,jsonb,text,text),public.get_dashboard_sync_status(text,uuid,uuid[]) to service_role;
commit;
