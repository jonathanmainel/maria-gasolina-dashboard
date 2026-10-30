-- Keep metric freshness/history unchanged by a completed preview-only operation.
-- An active preview retains the existing busy state; explicit runs expose purpose.
begin;
create or replace function public.get_dashboard_sync_status(p_client_slug text,p_user_id uuid,p_run_ids uuid[] default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_client bigint; v_role text; v_sources jsonb; v_requested jsonb;
begin
  select c.id,m.role into v_client,v_role from public.dashboard_clients c join public.dashboard_client_users m on m.client_id=c.id
    where c.slug=p_client_slug and c.active and m.user_id=p_user_id;
  if v_client is null then raise exception 'SYNC_FORBIDDEN' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('source',s.source,'enabled',s.enabled,
    'latest_run',(select jsonb_build_object('id',r.id,'status',r.status,'requested_at',r.requested_at,
       'started_at',r.worker_started_at,'completed_at',r.completed_at,'range_start',r.range_start,'range_end',r.range_end,
       'database_write_status',r.database_write_status,'error_code',r.error_code,'period_mode',r.period_mode,'requested_by',r.requested_by,'trigger',r.trigger,'operation',r.operation,
       'overdue',r.status in ('queued','running','indeterminate') and r.requested_at<now()-interval '10 minutes')
      from public.dashboard_automation_runs r where r.client_id=v_client and r.source=s.source and (r.operation='metrics' or r.status in ('queued','running','indeterminate')) order by r.requested_at desc limit 1),
    'last_success_at',(select max(completed_at) from public.dashboard_automation_runs r where r.client_id=v_client and r.source=s.source and r.operation='metrics' and status='success'),
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
    'error_code',r.error_code,'period_mode',r.period_mode,'requested_by',r.requested_by,'trigger',r.trigger,'operation',r.operation,
    'overdue',r.status in ('queued','running','indeterminate') and r.requested_at<now()-interval '10 minutes')),'[]')
    into v_requested from public.dashboard_automation_runs r where r.client_id=v_client and r.id=any(coalesce(p_run_ids,'{}'));
  return jsonb_build_object('client_id',v_client,'role',v_role,'can_request',v_role='admin',
    'server_time',now(),'today',(now() at time zone 'America/Sao_Paulo')::date,'sources',v_sources,'requested_runs',v_requested);
end $$;

notify pgrst,'reload schema';
commit;
