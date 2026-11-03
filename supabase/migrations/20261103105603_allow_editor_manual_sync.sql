-- Allow existing editors to request manual metrics/preview syncs.
-- Keep the existing client membership checks, service-role-only grants,
-- immutable reservations, replay protection, cooldowns and platform collectors.
-- Historical backfills remain restricted to admins.

CREATE OR REPLACE FUNCTION public.begin_dashboard_preview_collection(p_run_id uuid, p_client_id bigint, p_account_id text, p_start date, p_end date, p_selection jsonb, p_fingerprint text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_run public.dashboard_automation_runs%rowtype;
begin
 select * into v_run from public.dashboard_automation_runs where id=p_run_id for update;
 if not found or v_run.operation<>'previews' or v_run.source<>'meta_ads' or v_run.client_id<>p_client_id
 or v_run.account_id is distinct from p_account_id or v_run.range_start<>p_start or v_run.range_end<>p_end
 or v_run.preview_selection is distinct from p_selection or v_run.selection_fingerprint is distinct from p_fingerprint
 or v_run.status<>'running' or v_run.worker_started_at is null or v_run.collector_started_at is not null then return false; end if;
 if not exists(select 1 from public.dashboard_client_users m join public.dashboard_clients c on c.id=m.client_id
 where m.client_id=p_client_id and m.user_id=v_run.requested_by and m.role in ('admin','editor') and c.active)
 or not exists(select 1 from public.dashboard_source_accounts a where a.client_id=p_client_id and a.source='meta_ads'
 and a.account_id=p_account_id and a.active and a.automation_enabled) then return false; end if;
 if exists(select 1 from jsonb_array_elements(p_selection->'ads') a left join public.dashboard_creative_previews c
 on c.client_id=p_client_id and c.source='meta_ads' and c.account_id=p_account_id and c.entity_type='ad' and c.entity_id=a->>'ad_id'
 where c.id is null or c.creative_id is distinct from a->>'creative_id'
 or c.preview_sha256 is distinct from a->>'previous_sha256' or c.preview_storage_path is distinct from a->>'previous_path'
 or c.metadata->>'video_id' is distinct from a->>'video_id'
 or c.metadata->>'preview_asset_key' is distinct from a->>'asset_key'
 or to_jsonb(c.updated_at) is distinct from a->'previous_updated_at') then return false; end if;
 update public.dashboard_automation_runs set collector_started_at=clock_timestamp() where id=p_run_id;
 return true;
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
  return jsonb_build_object('client_id',v_client,'role',v_role,'can_request',v_role in ('admin','editor'),
    'server_time',now(),'today',(now() at time zone 'America/Sao_Paulo')::date,'sources',v_sources,'requested_runs',v_requested);
end $function$;

CREATE OR REPLACE FUNCTION public.request_dashboard_preview_sync(p_client_slug text, p_user_id uuid, p_request_key uuid, p_ad_ids text[], p_assets jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
 v_client bigint; v_ids text[]; v_account text; v_count integer; v_accounts integer;
 v_assets jsonb; v_selection jsonb; v_run public.dashboard_automation_runs%rowtype;
 v_today date := (now() at time zone 'America/Sao_Paulo')::date; v_next timestamptz; v_dispatch bigint;
begin
 select c.id into v_client from public.dashboard_clients c join public.dashboard_client_users m on m.client_id=c.id
 where c.slug=p_client_slug and c.active and m.user_id=p_user_id and m.role in ('admin','editor');
 if v_client is null then raise exception 'SYNC_FORBIDDEN' using errcode='42501'; end if;
 if p_request_key is null or p_ad_ids is null or cardinality(p_ad_ids) not between 1 and 50
 or exists(select 1 from unnest(p_ad_ids) x where x is null or x !~ '^[0-9]{1,30}$')
 or (select count(distinct x) from unnest(p_ad_ids) x)<>cardinality(p_ad_ids)
 or jsonb_typeof(p_assets) is distinct from 'array' then raise exception 'INVALID_PREVIEW_SELECTION' using errcode='22023'; end if;
 select array_agg(x order by x collate "C") into v_ids from unnest(p_ad_ids) x;
 if jsonb_array_length(p_assets)>cardinality(v_ids)
 or exists(select 1 from jsonb_array_elements(p_assets) a where jsonb_typeof(a)<>'object'
 or a->>'ad_id' is null or not (a->>'ad_id'=any(v_ids)) or a->>'sha256' is null or a->>'sha256' !~ '^[a-f0-9]{64}$'
 or a->>'creative_id' is null or a->>'creative_id' !~ '^[0-9]{1,30}$'
 or (a ? 'video_id' and (a->>'video_id' is null or a->>'video_id' !~ '^[0-9]{1,30}$'))
 or (select count(*) from jsonb_object_keys(a) k where k not in ('ad_id','creative_id','video_id','sha256'))>0)
 or (select count(distinct a->>'ad_id') from jsonb_array_elements(p_assets) a)<>jsonb_array_length(p_assets)
 then raise exception 'INVALID_PREVIEW_ASSETS' using errcode='22023'; end if;
 select coalesce(jsonb_agg(a order by a->>'ad_id'),'[]') into v_assets from jsonb_array_elements(p_assets) a;
 perform pg_advisory_xact_lock(hashtextextended(v_client::text||':meta_ads',0));
 select * into v_run from public.dashboard_automation_runs where client_id=v_client and source='meta_ads' and request_key=p_request_key;
 if found then
  if v_run.operation<>'previews' or v_run.preview_selection->'ad_ids'<>to_jsonb(v_ids)
  or v_run.preview_selection->'approved_assets'<>v_assets then raise exception 'RESERVATION_PAYLOAD_MISMATCH' using errcode='22023'; end if;
  return jsonb_build_object('ok',true,'results',jsonb_build_array(jsonb_build_object('source','meta_ads','state','existing','run_id',v_run.id)));
 end if;
 select count(*),count(distinct c.account_id),min(c.account_id) into v_count,v_accounts,v_account
 from public.dashboard_creative_previews c where c.client_id=v_client and c.source='meta_ads'
 and c.entity_type='ad' and c.entity_id=any(v_ids) and c.creative_id is not null
 and exists(select 1 from public.dashboard_source_accounts a where a.client_id=c.client_id and a.source=c.source
 and a.account_id=c.account_id and a.active and a.automation_enabled);
 if v_count<>cardinality(v_ids) or v_accounts<>1 then raise exception 'PREVIEW_SCOPE_FORBIDDEN' using errcode='42501'; end if;
 if exists(select 1 from jsonb_array_elements(v_assets) a join public.dashboard_creative_previews c
 on c.client_id=v_client and c.source='meta_ads' and c.entity_type='ad' and c.entity_id=a->>'ad_id'
 where c.creative_id is distinct from a->>'creative_id' or (a ? 'video_id' and c.metadata->>'video_id' is distinct from a->>'video_id'))
 then raise exception 'PREVIEW_ASSET_MISMATCH' using errcode='22023'; end if;
 select jsonb_build_object('ad_ids',to_jsonb(v_ids),'approved_assets',v_assets,'ads',jsonb_agg(jsonb_build_object(
 'ad_id',c.entity_id,'creative_id',c.creative_id,'video_id',c.metadata->>'video_id','asset_key',c.metadata->>'preview_asset_key',
 'previous_sha256',c.preview_sha256,'previous_path',c.preview_storage_path,'previous_updated_at',c.updated_at) order by c.entity_id))
 into v_selection from public.dashboard_creative_previews c where c.client_id=v_client and c.source='meta_ads'
 and c.entity_type='ad' and c.entity_id=any(v_ids);
 select * into v_run from public.dashboard_automation_runs where client_id=v_client and source='meta_ads'
 and status in ('queued','running','indeterminate') order by requested_at desc limit 1;
 if found then return jsonb_build_object('ok',true,'results',jsonb_build_array(jsonb_build_object('source','meta_ads','state','active','run_id',v_run.id))); end if;
 select max(requested_at)+interval '5 minutes' into v_next from public.dashboard_automation_runs
 where client_id=v_client and source='meta_ads' and trigger='manual';
 if v_next>clock_timestamp() then return jsonb_build_object('ok',true,'results',jsonb_build_array(jsonb_build_object('source','meta_ads','state','cooldown','retry_at',v_next))); end if;
 insert into public.dashboard_automation_runs(client_id,source,trigger,range_start,range_end,status,requested_by,request_key,
 period_mode,operation,account_id,preview_selection,selection_fingerprint)
 values(v_client,'meta_ads','manual',v_today-7,v_today,'queued',p_user_id,p_request_key,'including_today','previews',v_account,
 v_selection,encode(sha256(convert_to(v_selection::text,'UTF8')),'hex')) returning * into v_run;
 v_dispatch:=private.dispatch_dashboard_sync(array[v_run.id]);
 update public.dashboard_automation_runs set dispatch_id=v_dispatch where id=v_run.id;
 return jsonb_build_object('ok',true,'results',jsonb_build_array(jsonb_build_object('source','meta_ads','state','accepted','run_id',v_run.id)),
 'range_start',v_today-7,'range_end',v_today);
end $function$;

CREATE OR REPLACE FUNCTION public.request_dashboard_sync(p_client_slug text, p_user_id uuid, p_sources text[], p_request_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_client bigint; v_source text; v_result jsonb; v_results jsonb := '[]';
  v_ids uuid[] := '{}'; v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_dispatch bigint;
begin
  select c.id into v_client from public.dashboard_clients c join public.dashboard_client_users m on m.client_id=c.id
    where c.slug=p_client_slug and c.active and m.user_id=p_user_id and m.role in ('admin','editor');
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
end $function$;

CREATE OR REPLACE FUNCTION public.reserve_dashboard_metrics_sync_legacy(p_client_id bigint, p_source text, p_trigger text, p_start date, p_end date, p_user_id uuid DEFAULT NULL::uuid, p_request_key uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
       and m.user_id=p_user_id and m.role in ('admin','editor'))) then
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
    and (r.trigger='cron' or exists(select 1 from public.dashboard_client_users m
      where m.client_id=r.client_id and m.user_id=r.requested_by
      and (m.role='admin' or (r.trigger='manual' and m.role='editor'))))
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
end $function$;

